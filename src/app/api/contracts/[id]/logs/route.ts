import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const logs = await prisma.supportLog.findMany({
    where: { contractId: params.id },
    orderBy: { occurredAt: "desc" },
  });
  return NextResponse.json({ logs });
}

// POST /api/contracts/[id]/logs - 対応履歴を手動で記録（電話・訪問・メモなど）
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const { type, staffName, subject, content, occurredAt } = body;

  if (!type || !staffName || !content) {
    return NextResponse.json(
      { error: "type, staffName, content は必須です" },
      { status: 400 }
    );
  }

  const contract = await prisma.contract.findUnique({ where: { id: params.id } });
  if (!contract) {
    return NextResponse.json({ error: "契約が見つかりません" }, { status: 404 });
  }

  const log = await prisma.supportLog.create({
    data: {
      contractId: params.id,
      type,
      staffName,
      subject: subject || null,
      content,
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
    },
  });

  return NextResponse.json({ log }, { status: 201 });
}
