import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computePlanTier } from "@/lib/planTier";
import { computeActiveAccountCount } from "@/lib/contractLines";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    include: {
      contractLines: { orderBy: { startDate: "desc" } },
      supportLogs: { orderBy: { occurredAt: "desc" } },
    },
  });

  if (!contract) {
    return NextResponse.json({ error: "契約が見つかりません" }, { status: 404 });
  }

  const accountCount = computeActiveAccountCount(contract.contractLines);
  return NextResponse.json({
    contract: { ...contract, accountCount, planTier: computePlanTier(accountCount) },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const data: Record<string, unknown> = {};

  for (const key of [
    "companyName",
    "contactName",
    "contactEmail",
    "phone",
    "notes",
    "status",
  ]) {
    if (key in body) data[key] = body[key] || null;
  }

  const contract = await prisma.contract.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json({ contract });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await prisma.contract.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
