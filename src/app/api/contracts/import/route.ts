import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/contractLines";

type ImportRow = {
  companyName?: string;
  quantity?: string | number;
  contractType?: string;
  contractStatus?: string;
  startDate?: string;
  endDate?: string;
  contactName?: string;
  contactEmail?: string;
  phone?: string;
  status?: string;
  externalId?: string;
  notes?: string;
};

// POST /api/contracts/import
// body: { rows: ImportRow[] }
//
// torimatoのCSVは同一会社について「月契約」「年契約」等が別々の行として存在するため、
// 1行 = 1契約明細（ContractLine）として取り込み、会社（Contract）単位でまとめる。
//
// アカウント数の集計は「契約状態（contractStatus）」列だけを基準に行う。
// 契約開始日・終了日は無料期間や契約切り替えの都合で実際の契約状態と一致しないことが
// あるため判定には使わず、契約詳細画面などの表示用データとしてのみ保持する。
export async function POST(req: NextRequest) {
  const body = await req.json();
  const rows: ImportRow[] = body.rows || [];

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "取り込むデータがありません" }, { status: 400 });
  }

  const createdContractIds = new Set<string>();
  const updatedContractIds = new Set<string>();
  let linesCreated = 0;
  let linesUpdated = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const companyName = (row.companyName || "").trim();
    const quantity = Number(row.quantity);
    const contractType = (row.contractType || "").trim();
    const contractStatus = (row.contractStatus || "").trim();
    // 契約開始日・終了日は表示用のみ。パースできなくても行自体は取り込む。
    const startDate = row.startDate ? parseDateOnly(row.startDate) : null;
    const endDate = row.endDate ? parseDateOnly(row.endDate) : null;

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
      let contract = await prisma.contract.findFirst({ where: { companyName } });

      const contactPatch = {
        ...(row.contactName?.trim() ? { contactName: row.contactName.trim() } : {}),
        ...(row.contactEmail?.trim() ? { contactEmail: row.contactEmail.trim() } : {}),
        ...(row.phone?.trim() ? { phone: row.phone.trim() } : {}),
        ...(row.status?.trim() ? { status: row.status.trim() } : {}),
        ...(row.notes?.trim() ? { notes: row.notes.trim() } : {}),
      };

      if (!contract) {
        contract = await prisma.contract.create({
          data: { companyName, ...contactPatch },
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

      // externalId（契約ID）が無い場合は契約種別・期間の組で同一明細とみなす。
      // contractStatusは再インポートのたびに変わりうる値なので、この照合キーには含めない
      // （そうしないと"契約前→契約中"のような状態遷移が別明細として重複作成されてしまう）。
      const externalId = row.externalId?.trim() || null;
      const existingLine = externalId
        ? await prisma.contractLine.findUnique({ where: { externalId } })
        : await prisma.contractLine.findFirst({
            where: { contractId: contract.id, contractType, startDate, endDate },
          });

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
            externalId,
          },
        });
        linesUpdated++;
      } else {
        await prisma.contractLine.create({
          data: { contractId: contract.id, contractType, contractStatus, quantity, startDate, endDate, externalId },
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
  });
}
