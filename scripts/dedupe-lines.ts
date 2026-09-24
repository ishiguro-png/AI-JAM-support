// 内容が同じ契約明細（契約ID(externalId)だけが異なる）を安全に整理するスクリプト。
//
// 典型的な原因: CSVの「契約ID」列が、torimatoの再エクスポートのたびに違う値になってしまい
// （安定した一意キーではない）、契約IDでの突合に失敗して同じ契約明細が何度も新規作成される。
//
// 実行方法:
//   npm run dedupe-lines            … 削除対象を表示するだけ（何も削除しない・安全）
//   npm run dedupe-lines -- --apply … 実際に削除する
//
// 判定方法（groupLinesForDedupe、src/lib/contractLines.ts）: 同一Contract配下で、
//   - 商品名または契約期間のどちらかがあれば、契約種別・商品名・契約期間
//     （＝時間が経っても変わらないはずの識別情報）でグループ化する（信頼度: high）。
//     数量・契約状態・金額は含めないため、再インポートの間に状態が進んだ明細
//     （例: 契約前→契約中、数量変更）も同じ契約明細として正しくまとめて整理できる。
//   - 商品名も契約期間も無い場合のみ、契約種別・数量・契約状態・金額でグループ化する
//     （信頼度: low）。手がかりが乏しく偶然の一致が起こりうるため要注意。
// 各グループでは最もupdatedAtが新しい1件だけを残し、他は削除する
// （＝直近のCSVインポートで反映された最新の状態を優先する）。

import { PrismaClient } from "@prisma/client";
import { groupLinesForDedupe } from "../src/lib/contractLines";

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");

  const contracts = await prisma.contract.findMany({
    include: { contractLines: true },
    orderBy: { companyName: "asc" },
  });

  let groupsFound = 0;
  let lowConfidenceGroups = 0;
  const linesToDelete: string[] = [];

  for (const c of contracts) {
    const groups = groupLinesForDedupe(c.contractLines);

    for (const { confidence, lines: list } of groups) {
      if (list.length <= 1) continue;
      groupsFound++;
      if (confidence === "low") lowConfidenceGroups++;

      const sorted = [...list].sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
      );
      const keep = sorted[0];
      const remove = sorted.slice(1);

      console.log(
        `${c.companyName}${confidence === "low" ? " [信頼度: 低]" : ""}: ` +
          `契約種別=${keep.contractType || "(未設定)"} / 商品名=${keep.productName || "(未設定)"} / ` +
          `期間=${keep.startDate ? keep.startDate.toISOString().slice(0, 10) : "(未設定)"}〜` +
          `${keep.endDate ? keep.endDate.toISOString().slice(0, 10) : "(未設定)"}`
      );
      console.log(`  → この${list.length}件は同一契約明細だがexternalIdだけ違う:`);
      for (const l of sorted) {
        const mark = l === keep ? "残す" : "削除";
        console.log(
          `  ${mark}: id=${l.id} externalId=${l.externalId ?? "(なし)"} ` +
            `数量=${l.quantity} 契約状態=${l.contractStatus || "(未設定)"} 金額=${l.amount || "(未設定)"} ` +
            `updatedAt=${l.updatedAt.toISOString()}`
        );
      }
      linesToDelete.push(...remove.map((r) => r.id));
    }
  }

  console.log("");
  console.log(`重複グループ: ${groupsFound}件 / 削除対象: ${linesToDelete.length}件`);
  if (lowConfidenceGroups > 0) {
    console.log(
      `  うち信頼度が低いグループ: ${lowConfidenceGroups}件` +
        "（契約種別・商品名・契約期間が全て未設定で、数量・契約状態・金額だけで一致判定しています。" +
        "内容をよく確認してから--applyしてください）"
    );
  }

  if (linesToDelete.length === 0) {
    console.log("削除対象はありません。");
    await prisma.$disconnect();
    return;
  }

  if (!apply) {
    console.log("");
    console.log("[ドライラン] 実際の削除は行っていません。内容を確認の上、");
    console.log("  npm run dedupe-lines -- --apply");
    console.log("を実行すると上記の「削除」対象が削除されます。");
  } else {
    const result = await prisma.contractLine.deleteMany({
      where: { id: { in: linesToDelete } },
    });
    console.log("");
    console.log(`[適用] ${result.count}件の契約明細を削除しました。`);
    console.log("npm run verify を実行して整合性を再確認してください。");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
