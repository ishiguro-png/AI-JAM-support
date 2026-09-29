import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/contractLines";
import {
  normalizeCompanyName,
  findCompanyIdConflicts,
  findLineIdConflicts,
} from "@/lib/csvImportChecks";

type ImportRow = {
  companyName?: string;
  companyExternalId?: string;
  quantity?: string | number;
  contractType?: string;
  contractStatus?: string;
  startDate?: string;
  endDate?: string;
  productName?: string;
  amount?: string;
  contactName?: string;
  contactEmail?: string;
  phone?: string;
  externalId?: string;
  notes?: string;
};

type ParsedRow = {
  rowIndex: number;
  companyName: string;
  companyExternalId: string | null;
  quantity: number;
  contractType: string;
  contractStatus: string;
  startDate: Date | null;
  endDate: Date | null;
  productName: string | null;
  amount: string | null;
  externalId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  phone: string | null;
  notes: string | null;
};

// POST /api/contracts/import
// body: { rows: ImportRow[], fileName?: string }
//
// 方針: 「最新のtorimato CSVが現在の契約状態の正」。
// CSVをインポートするたびに、会社ごとの契約明細(ContractLine)を今回のCSVの内容で
// 完全に置き換える（過去のContractLineとの複雑なupsert・externalIdによる同一性判定は
// 行わない）。そのため契約ID(externalId)がtorimatoの再エクスポートのたびに変わっても、
// ContractLineが増殖することはない。同じCSVを3回インポートしても、3回目の
// ContractLine件数は常に「そのCSVの行数」のままになる。
//
// 会社（Contract）は従来どおり会社単位で管理する。会社IDがあれば会社IDを優先し、
// 無ければ正規化した会社名でまとめる。会社そのもの・SupportLog・担当者・メール
// テンプレートはCSV再インポートで削除しない（削除・置き換えの対象はContractLineのみ）。
//
// アカウント数の集計は「契約状態（contractStatus）」列だけを基準に行う。
// 契約開始日・終了日は無料期間や契約切り替えの都合で実際の契約状態と一致しないことが
// あるため判定には使わず、契約詳細画面などの表示用データとしてのみ保持する。
//
// 注意: Contract.status（このアプリ内だけで使う対応ステータス）は、CSVからは一切
// 書き込まない。ContractLine.contractStatus（契約中/契約前/解約）と混同しないため。
export async function POST(req: NextRequest) {
  const body = await req.json();
  const rows: ImportRow[] = body.rows || [];
  const fileName: string | null = typeof body.fileName === "string" ? body.fileName : null;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "取り込むデータがありません" }, { status: 400 });
  }

  // 会社ID・契約IDの列マッピングが誤っている疑いがあれば、取り込みは行いつつ
  // 警告として返す（UIの事前チェックをすり抜けてPOSTされた場合の保険）。
  const warnings = [...findCompanyIdConflicts(rows), ...findLineIdConflicts(rows)];

  const errors: { row: number; message: string }[] = [];
  const parsedRows: ParsedRow[] = [];

  // 1. 各行を検証・パースする（この時点ではDBに書き込まない）
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const companyName = normalizeCompanyName(row.companyName || "");
    const quantity = Number(row.quantity);
    const contractType = (row.contractType || "").trim();
    const contractStatus = (row.contractStatus || "").trim();

    if (!companyName) {
      errors.push({ row: i + 1, message: "会社名が空です" });
      continue;
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      errors.push({ row: i + 1, message: "数量が不正です" });
      continue;
    }
    if (!contractStatus) {
      errors.push({
        row: i + 1,
        message: "契約状態が空です（契約中 / 契約前 / 解約 のいずれかを指定してください）",
      });
      continue;
    }

    parsedRows.push({
      rowIndex: i + 1,
      companyName,
      companyExternalId: row.companyExternalId?.trim() || null,
      quantity,
      contractType,
      contractStatus,
      // 契約開始日・終了日は表示用のみ。パースできなくても行自体は取り込む。
      startDate: row.startDate ? parseDateOnly(row.startDate) : null,
      endDate: row.endDate ? parseDateOnly(row.endDate) : null,
      productName: row.productName?.trim() || null,
      amount: row.amount?.trim() || null,
      externalId: row.externalId?.trim() || null,
      contactName: row.contactName?.trim() || null,
      contactEmail: row.contactEmail?.trim() || null,
      phone: row.phone?.trim() || null,
      notes: row.notes?.trim() || null,
    });
  }

  // 2. 会社単位でグループ化する。会社IDがあれば会社ID、無ければ正規化した会社名でまとめる。
  const groups = new Map<string, ParsedRow[]>();
  for (const row of parsedRows) {
    const key = row.companyExternalId ? `id:${row.companyExternalId}` : `name:${row.companyName}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const createdContractIds = new Set<string>();
  const updatedContractIds = new Set<string>();
  let linesImported = 0;

  // 3. 会社ごとに、Contractを作成・更新した上でContractLineを今回のCSV内容で置き換える
  for (const [, groupRows] of groups) {
    const companyExternalId = groupRows.find((r) => r.companyExternalId)?.companyExternalId ?? null;
    const companyName = groupRows[0].companyName;

    try {
      let contract = companyExternalId
        ? await prisma.contract.findUnique({ where: { externalId: companyExternalId } })
        : await prisma.contract.findFirst({ where: { companyName } });

      // 連絡先などの付随情報は、今回のCSV内でその会社に該当する行の中から
      // 値が入っている最初のものを採用する（空欄の行で既存の値を消さないため、
      // 値が無い項目は更新しない）。
      const firstNonEmpty = (pick: (r: ParsedRow) => string | null) =>
        groupRows.map(pick).find((v): v is string => !!v) ?? null;
      const contactName = firstNonEmpty((r) => r.contactName);
      const contactEmail = firstNonEmpty((r) => r.contactEmail);
      const phone = firstNonEmpty((r) => r.phone);
      const notes = firstNonEmpty((r) => r.notes);

      const contactPatch = {
        ...(contract && contract.companyName !== companyName ? { companyName } : {}),
        ...(companyExternalId && !contract?.externalId ? { externalId: companyExternalId } : {}),
        ...(contactName ? { contactName } : {}),
        ...(contactEmail ? { contactEmail } : {}),
        ...(phone ? { phone } : {}),
        ...(notes ? { notes } : {}),
      };

      if (!contract) {
        contract = await prisma.contract.create({
          data: { companyName, externalId: companyExternalId, ...contactPatch },
        });
        createdContractIds.add(contract.id);
      } else {
        if (Object.keys(contactPatch).length > 0) {
          contract = await prisma.contract.update({
            where: { id: contract.id },
            data: contactPatch,
          });
        }
        updatedContractIds.add(contract.id);
      }

      // 既存のContractLineを全て削除し、今回のCSVの内容で作り直す。
      // SupportLog・担当者・メールテンプレートはContractLineとは独立したデータのため、
      // ここでは一切変更しない（Contract自体を削除しない限り保持される）。
      const contractId = contract.id;
      await prisma.$transaction([
        prisma.contractLine.deleteMany({ where: { contractId } }),
        prisma.contractLine.createMany({
          data: groupRows.map((r) => ({
            contractId,
            contractType: r.contractType,
            contractStatus: r.contractStatus,
            quantity: r.quantity,
            startDate: r.startDate,
            endDate: r.endDate,
            productName: r.productName,
            amount: r.amount,
            externalId: r.externalId,
          })),
        }),
      ]);
      linesImported += groupRows.length;
    } catch (e) {
      const message = e instanceof Error ? e.message : "登録に失敗しました";
      for (const r of groupRows) {
        errors.push({ row: r.rowIndex, message });
      }
    }
  }

  await prisma.importBatch.create({
    data: {
      fileName,
      rowCount: rows.length,
      companyCount: groups.size,
      successCount: rows.length - errors.length,
      errorCount: errors.length,
    },
  });

  return NextResponse.json({
    companiesCreated: createdContractIds.size,
    companiesUpdated: updatedContractIds.size,
    linesImported,
    companyCount: groups.size,
    errors,
    warnings,
  });
}
