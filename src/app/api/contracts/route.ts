import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computePlanTier } from "@/lib/planTier";
import { computeActiveAccountCount, parseDateOnly } from "@/lib/contractLines";

// GET /api/contracts?tier=5+|10+|30+&q=検索語&status=active
// アカウント数・プランはContractLineから都度集計するため、tierでの絞り込みは取得後にJS側で行う。
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tier = searchParams.get("tier");
  const q = searchParams.get("q");
  const status = searchParams.get("status");

  const contracts = await prisma.contract.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { companyName: { contains: q } },
              { contactName: { contains: q } },
              { contactEmail: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { companyName: "asc" },
    include: {
      contractLines: true,
      _count: { select: { supportLogs: true } },
      supportLogs: {
        orderBy: { occurredAt: "desc" },
        take: 1,
      },
    },
  });

  const withComputed = contracts.map(({ contractLines, ...c }) => {
    const accountCount = computeActiveAccountCount(contractLines);
    return { ...c, accountCount, planTier: computePlanTier(accountCount) };
  });

  const filtered = tier ? withComputed.filter((c) => c.planTier === tier) : withComputed;

  return NextResponse.json({ contracts: filtered });
}

// POST /api/contracts - 契約を1件手動登録（契約明細を1件作成する）
// アカウント数の集計に使うのはcontractStatusのみ。startDate/endDateは表示用のため任意。
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    companyName,
    quantity,
    contractType,
    contractStatus,
    startDate,
    endDate,
    contactName,
    contactEmail,
    phone,
    notes,
  } = body;

  if (!companyName || typeof quantity !== "number" || !contractStatus) {
    return NextResponse.json(
      { error: "companyName, quantity(数値), contractStatus は必須です" },
      { status: 400 }
    );
  }

  const parsedStart = startDate ? parseDateOnly(String(startDate)) : null;
  const parsedEnd = endDate ? parseDateOnly(String(endDate)) : null;

  const contract = await prisma.contract.create({
    data: {
      companyName,
      contactName: contactName || null,
      contactEmail: contactEmail || null,
      phone: phone || null,
      notes: notes || null,
      contractLines: {
        create: {
          quantity,
          contractType: contractType || "",
          contractStatus,
          startDate: parsedStart,
          endDate: parsedEnd,
        },
      },
    },
    include: { contractLines: true },
  });

  const accountCount = computeActiveAccountCount(contract.contractLines);
  return NextResponse.json(
    { contract: { ...contract, accountCount, planTier: computePlanTier(accountCount) } },
    { status: 201 }
  );
}
