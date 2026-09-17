import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const staff = await prisma.staff.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ staff });
}

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "name は必須です" }, { status: 400 });
  }
  const staff = await prisma.staff.upsert({
    where: { name: name.trim() },
    update: {},
    create: { name: name.trim() },
  });
  return NextResponse.json({ staff }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  }
  await prisma.staff.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
