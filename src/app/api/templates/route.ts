import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const templates = await prisma.emailTemplate.findMany({
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const { name, planTier, subject, body } = await req.json();
  if (!name || !subject || !body) {
    return NextResponse.json(
      { error: "name, subject, body は必須です" },
      { status: 400 }
    );
  }
  const template = await prisma.emailTemplate.create({
    data: { name, planTier: planTier || null, subject, body },
  });
  return NextResponse.json({ template }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { id, name, planTier, subject, body } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  }
  const template = await prisma.emailTemplate.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(planTier !== undefined ? { planTier: planTier || null } : {}),
      ...(subject !== undefined ? { subject } : {}),
      ...(body !== undefined ? { body } : {}),
    },
  });
  return NextResponse.json({ template });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  }
  await prisma.emailTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
