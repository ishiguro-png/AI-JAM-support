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

// POST /api/contracts/import
// body: { rows: ImportRow[] }
//
// torimatoのCSVは同一会社について「月契約」「年契約」等が別々の行として存在するため、
// 1行 = 1契約明細（ContractLine）として取り込み、会社（Contract）単位でまとめる。
//
// 会社の同一性は、可能な限り会社ID（companyExternalId、torimato側の顧客ID等）で判定する。
// 会社名だけでの突合は表記ゆれ（全角スペース・改行混入など）で同じ会社が別レコードに
// 分裂しうるため、会社IDが無い場合のフォールバックとしてのみ使用する。
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

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "取り込むデータがありません" }, { status: 400 });
  }

  // 会社ID・契約IDの列マッピングが誤っている疑いがあれば、取り込みは行いつつ
  // 警告として返す（UIの事前チェックをすり抜けてPOSTされた場合の保険）。
  const warnings = [...findCompanyIdConflicts(rows), ...findLineIdConflicts(rows)];

  const createdContractIds = new Set<string>();
  const updatedContractIds = new Set<string>();
  let linesCreated = 0;
  let linesUpdated = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const companyName = normalizeCompanyName(row.companyName || "");
    const companyExternalId = row.companyExternalId?.trim() || null;
    const quantity = Number(row.quantity);
    const contractType = (row.contractType || "").trim();
    const contractStatus = (row.contractStatus || "").trim();
    // 契約開始日・終了日は表示用のみ。パースできなくても行自体は取り込む。
    const startDate = row.startDate ? parseDateOnly(row.startDate) : null;
    const endDate = row.endDate ? parseDateOnly(row.endDate) : null;
    // 商品名・金額も表示用・検証用のみ（集計には使用しない）
    const productName = row.productName?.trim() || null;
    const amount = row.amount?.trim() || null;

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

    try {
      let contract = companyExternalId
        ? await prisma.contract.findUnique({ where: { externalId: companyExternalId } })
        : await prisma.contract.findFirst({ where: { companyName } });

      // 会社IDが無いままcompanyNameだけで作られた既存契約でも、今回のCSVで会社IDが
      // 分かった場合はそれを付与しておく（次回以降はID優先で確実に突合できるようにする）
      const contactPatch = {
        ...(contract && contract.companyName !== companyName ? { companyName } : {}),
        ...(companyExternalId && !contract?.externalId ? { externalId: companyExternalId } : {}),
        ...(row.contactName?.trim() ? { contactName: row.contactName.trim() } : {}),
        ...(row.contactEmail?.trim() ? { contactEmail: row.contactEmail.trim() } : {}),
        ...(row.phone?.trim() ? { phone: row.phone.trim() } : {}),
        ...(row.notes?.trim() ? { notes: row.notes.trim() } : {}),
      };

      if (!contract) {
        contract = await prisma.contract.create({
          data: { companyName, externalId: companyExternalId, ...contactPatch },
        });
        createdContractIds.add(contract.id);
      } else if (Object.keys(contactPatch).length > 0) {
        contract = await prisma.contract.update({
          where: { id: contract.id },
          data: contactPatch,
        });
        if (!createdContractIds.has(contract.id)) {
          updatedContractIds.add(contract.id);
        }
      }

      // 契約明細の同一性は、可能な限り契約ID（externalId、torimato側の行の一意キー）で判定する。
      // 契約IDが無い場合のみ契約種別・期間の組をフォールバックキーとして使うが、
      // 開始日・終了日が両方揃っている場合に限る（どちらかが無いと、同じ会社の
      // 複数の契約明細が誤って同一視され、他の行のcontractStatusで上書きされてしまうため）。
      // contractStatusは再インポートのたびに変わりうる値なので、この照合キーには含めない
      // （そうしないと"契約前→契約中"のような状態遷移が別明細として重複作成されてしまう）。
      const externalId = row.externalId?.trim() || null;
      const canUseDateFallback = !externalId && startDate && endDate;
      const existingLine = externalId
        ? await prisma.contractLine.findUnique({ where: { externalId } })
        : canUseDateFallback
          ? await prisma.contractLine.findFirst({
              where: { contractId: contract.id, contractType, startDate, endDate },
            })
          : null;

      if (existingLine) {
        await prisma.contractLine.update({
          where: { id: existingLine.id },
          data: {
            contractId: contract.id,
            contractType,
            contractStatus,
            quantity,
            startDate,
            endDate,
            productName,
            amount,
            externalId,
          },
        });
        linesUpdated++;
      } else {
        await prisma.contractLine.create({
          data: {
            contractId: contract.id,
            contractType,
            contractStatus,
            quantity,
            startDate,
            endDate,
            productName,
            amount,
            externalId,
          },
        });
        linesCreated++;
      }
    } catch (e) {
      errors.push({
        row: i + 1,
        message: e instanceof Error ? e.message : "登録に失敗しました",
      });
    }
  }

  return NextResponse.json({
    companiesCreated: createdContractIds.size,
    companiesUpdated: updatedContractIds.size,
    linesCreated,
    linesUpdated,
    errors,
    warnings,
  });
}
