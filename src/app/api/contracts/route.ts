import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computePlanTier } from "@/lib/planTier";

// GET /api/contracts?tier=5+|10+|30+&q=検索語&status=active
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tier = searchParams.get("tier");
  const q = searchParams.get("q");
  const status = searchParams.get("status");

  const contracts = await prisma.contract.findMany({
    where: {
      ...(tier ? { planTier: tier } : {}),
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
      _count: { select: { supportLogs: true } },
      supportLogs: {
        orderBy: { occurredAt: "desc" },
        take: 1,
      },
    },
  });

  return NextResponse.json({ contracts });
}

// POST /api/contracts - 契約を1件手動登録
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { companyName, accountCount, contactName, contactEmail, phone, notes } = body;

  if (!companyName || typeof accountCount !== "number") {
    return NextResponse.json(
      { error: "companyName と accountCount(数値) は必須です" },
      { status: 400 }
    );
  }

  const contract = await prisma.contract.create({
    data: {
      companyName,
      accountCount,
      planTier: computePlanTier(accountCount),
      contactName: contactName || null,
      contactEmail: contactEmail || null,
      phone: phone || null,
      notes: notes || null,
    },
  });

  return NextResponse.json({ contract }, { status: 201 });
}
