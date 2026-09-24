// 「なぜこの契約明細群が重複として検出されない/されるのか」を調査するための
// 読み取り専用の診断スクリプト。削除や統合は一切行わない。
//
// 契約種別・商品名・契約期間が全て未設定だと、数量・契約状態・金額だけでは
// 「同じ契約が時間とともに変化したもの」なのか「たまたま値が同じ別の契約」なのか
// 区別できない。このスクリプトはimportedAtの間隔から「同じCSVインポート実行由来と
// 思われる行の集まり（バッチ）」を検出し、バッチ間で同じ順番の行を突き合わせて、
// どの項目が違うために重複とみなされていないのかを一覧化する。
//
// 前提（要確認）: 同じCSVファイルを複数回インポートした場合、各回でその会社の行が
// 同じ順番でCSVに現れる（＝バッチ内でimportedAt順に並べたときの並び順が対応する）
// ことを前提に突き合わせている。この前提が崩れる場合（torimato側で行順が変わる等）
// は突き合わせ結果を鵜呑みにしないこと。
//
// 実行方法:
//   npm run diagnose                     … 全体サマリ + 差異のある会社を最大10件表示
//   npm run diagnose -- --all            … 差異のある会社を全件表示
//   npm run diagnose -- --company=株式会社テスト1 … 特定の会社だけ詳細表示
//   npm run diagnose -- --gap-minutes=10 … バッチ判定の間隔閾値を変更（既定5分）

import { PrismaClient } from "@prisma/client";
import { detectImportBatches, diffFields } from "../src/lib/contractLines";

const prisma = new PrismaClient();

function fmt(line: {
  contractType: string;
  productName: string | null;
  quantity: number;
  contractStatus: string | null;
  amount: string | null;
  startDate: Date | null;
  endDate: Date | null;
  externalId: string | null;
  importedAt: Date;
}): string {
  return (
    `type=${line.contractType || "(未設定)"} product=${line.productName || "(未設定)"} ` +
    `qty=${line.quantity} status=${line.contractStatus || "(未設定)"} amount=${line.amount || "(未設定)"} ` +
    `start=${line.startDate ? line.startDate.toISOString().slice(0, 10) : "(未設定)"} ` +
    `end=${line.endDate ? line.endDate.toISOString().slice(0, 10) : "(未設定)"} ` +
    `externalId=${line.externalId ?? "(なし)"} importedAt=${line.importedAt.toISOString()}`
  );
}

async function main() {
  const args = process.argv.slice(2);
  const showAll = args.includes("--all");
  const companyFilter = args.find((a) => a.startsWith("--company="))?.split("=")[1];
  const gapArg = args.find((a) => a.startsWith("--gap-minutes="))?.split("=")[1];
  const gapMs = (gapArg ? Number(gapArg) : 5) * 60 * 1000;
  const limit = companyFilter || showAll ? Infinity : 10;

  const contracts = await prisma.contract.findMany({
    where: companyFilter ? { companyName: companyFilter } : {},
    include: { contractLines: true },
    orderBy: { companyName: "asc" },
  });

  if (companyFilter && contracts.length === 0) {
    console.log(`会社名「${companyFilter}」が見つかりません。`);
    await prisma.$disconnect();
    return;
  }

  // 1. バッチ数の分布（サマリ）
  type Line = (typeof contracts)[number]["contractLines"][number];
  const batchCountHistogram = new Map<number, number>();
  const perCompanyBatches = new Map<string, Line[][]>();
  for (const c of contracts) {
    const batches = detectImportBatches<Line>(c.contractLines, gapMs);
    perCompanyBatches.set(c.id, batches);
    batchCountHistogram.set(batches.length, (batchCountHistogram.get(batches.length) || 0) + 1);
  }

  console.log(`=== バッチ検出サマリ（間隔閾値: ${gapMs / 60000}分） ===`);
  console.log(`会社数: ${contracts.length}`);
  console.log(`契約明細数(合計): ${contracts.reduce((s, c) => s + c.contractLines.length, 0)}`);
  console.log("会社ごとのバッチ数の内訳:");
  for (const [count, companies] of [...batchCountHistogram.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  バッチ${count}個: ${companies}社`);
  }
  console.log("");

  // 2. バッチサイズが会社内で揃っているか（揃っていないと行の対応付けができない）
  const mismatchedBatchSizeCompanies: string[] = [];
  for (const c of contracts) {
    const batches = perCompanyBatches.get(c.id)!;
    if (batches.length <= 1) continue;
    const sizes = new Set(batches.map((b) => b.length));
    if (sizes.size > 1) {
      mismatchedBatchSizeCompanies.push(
        `${c.companyName}（バッチごとの件数: ${batches.map((b) => b.length).join(", ")}）`
      );
    }
  }
  if (mismatchedBatchSizeCompanies.length > 0) {
    console.log(
      `[要確認] バッチ間で契約明細の件数が揃っていない会社が ${mismatchedBatchSizeCompanies.length}件あります` +
        "（行の対応付けができないため、以下の突き合わせ結果には含めていません）:"
    );
    for (const m of mismatchedBatchSizeCompanies.slice(0, showAll ? undefined : 10)) {
      console.log(`  - ${m}`);
    }
    console.log("");
  }

  // 3. バッチ間で「同じ順番の行」を突き合わせ、差分があるフィールドを集計する
  const diffFieldCounts = new Map<string, number>();
  let comparedPairs = 0;
  let identicalPairs = 0;
  const companiesWithDiffs: { companyName: string; details: string[] }[] = [];

  for (const c of contracts) {
    const batches = perCompanyBatches.get(c.id)!;
    if (batches.length <= 1) continue;
    const sizes = new Set(batches.map((b) => b.length));
    if (sizes.size > 1) continue; // サイズ不揃いは突き合わせ対象外（上で別途警告済み）

    const details: string[] = [];
    const lineCount = batches[0].length;
    for (let pos = 0; pos < lineCount; pos++) {
      const linesAtPos = batches.map((b) => b[pos]);
      for (let i = 1; i < linesAtPos.length; i++) {
        comparedPairs++;
        const diffs = diffFields(linesAtPos[0], linesAtPos[i]);
        if (diffs.length === 0) {
          identicalPairs++;
        } else {
          for (const f of diffs) diffFieldCounts.set(f, (diffFieldCounts.get(f) || 0) + 1);
        }
      }
      const diffsAcrossAll = new Set<string>();
      for (let i = 1; i < linesAtPos.length; i++) {
        for (const f of diffFields(linesAtPos[0], linesAtPos[i])) diffsAcrossAll.add(f);
      }
      if (diffsAcrossAll.size > 0) {
        details.push(`  [行位置 ${pos + 1}] 差異のある項目: ${[...diffsAcrossAll].join(", ")}`);
        for (const [bi, l] of linesAtPos.entries()) {
          details.push(`    バッチ${bi + 1}: ${fmt(l)}`);
        }
      }
    }
    if (details.length > 0) {
      companiesWithDiffs.push({ companyName: c.companyName, details });
    }
  }

  console.log("=== バッチ間の突き合わせ結果（同じ順番の行同士を比較） ===");
  console.log(`比較したペア数: ${comparedPairs}（うち完全一致: ${identicalPairs}）`);
  if (diffFieldCounts.size === 0) {
    console.log("差異のあるフィールドはありませんでした。");
  } else {
    console.log("差異のあったフィールドの出現回数:");
    for (const [field, count] of [...diffFieldCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${field}: ${count}回`);
    }
  }
  console.log("");

  if (companiesWithDiffs.length === 0) {
    console.log("バッチ間で差異のある会社はありませんでした。");
  } else {
    console.log(
      `差異のある会社: ${companiesWithDiffs.length}件` +
        (limit < companiesWithDiffs.length ? `（先頭${limit}件のみ表示。--all で全件表示）` : "")
    );
    for (const { companyName, details } of companiesWithDiffs.slice(0, limit)) {
      console.log(`--- ${companyName} ---`);
      for (const d of details) console.log(d);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
