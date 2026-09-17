import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computePlanTier } from "@/lib/planTier";

type ImportRow = {
  companyName?: string;
  accountCount?: string | number;
  contactName?: string;
  contactEmail?: string;
  phone?: string;
  status?: string;
  externalId?: string;
  notes?: string;
};

// POST /api/contracts/import
// body: { rows: ImportRow[] }  ※CSVの列マッピングはクライアント側で済ませ、
// フィールド名を統一した状態のrowsを受け取る。
export async function POST(req: NextRequest) {
  const body = await req.json();
  const rows: ImportRow[] = body.rows || [];

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "取り込むデータがありません" }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const companyName = (row.companyName || "").trim();
    const accountCount = Number(row.accountCount);

    if (!companyName || Number.isNaN(accountCount)) {
      errors.push({
        row: i + 1,
        message: "会社名またはアカウント数が不正です",
      });
      continue;
    }

    const planTier = computePlanTier(accountCount);
    const data = {
      companyName,
      accountCount,
      planTier,
      contactName: row.contactName?.trim() || null,
      contactEmail: row.contactEmail?.trim() || null,
      phone: row.phone?.trim() || null,
      status: row.status?.trim() || "active",
      externalId: row.externalId?.trim() || null,
      notes: row.notes?.trim() || null,
    };

    try {
      // externalIdがあればそれで一意判定、無ければ会社名で既存を探す
      const existing = data.externalId
        ? await prisma.contract.findUnique({ where: { externalId: data.externalId } })
        : await prisma.contract.findFirst({ where: { companyName } });

      if (existing) {
        await prisma.contract.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.contract.create({ data });
        created++;
      }
    } catch (e) {
      errors.push({
        row: i + 1,
        message: e instanceof Error ? e.message : "登録に失敗しました",
      });
    }
  }

  return NextResponse.json({ created, updated, errors });
}
