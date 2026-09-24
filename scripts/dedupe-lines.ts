// 内容が同じ（会社名・契約種別・商品名・数量・契約状態・金額・契約開始日・契約終了日が
// 全て一致）なのに、externalId(契約ID)だけが異なるためにContractLineが重複作成されて
// しまったケースを安全に整理するスクリプト。
//
// 典型的な原因: CSVの「契約ID」列が、torimatoの再エクスポートのたびに違う値になってしまい
// （安定した一意キーではない）、契約IDでの突合に失敗して同じ契約明細が何度も新規作成される。
//
// 実行方法:
//   npm run dedupe-lines            … 削除対象を表示するだけ（何も削除しない・安全）
//   npm run dedupe-lines -- --apply … 実際に削除する
//
// 判定方法: 同一Contract配下で、契約種別・商品名・数量・契約状態・金額・契約開始日・
// 契約終了日（externalId以外の全項目）が完全に一致する契約明細をグループ化する。
// 全項目が完全一致する場合のみ「同一内容」とみなすため、状態が進んだ明細
// （例: 契約前→契約中に変わった明細）は指紋が変わり別グループとして扱われ、
// 誤って削除されることはない。各グループでは最もupdatedAtが新しい1件だけを残し、
// 他は削除する（＝直近のCSVインポートで反映された最新の状態を優先する）。
//
// 契約種別・商品名・契約期間が全て空/未設定のグループは、数量・契約状態・金額だけで
// 一致判定することになり偶然の一致が起きやすいため「信頼度: 低」として表示する
// （削除自体は行うが、--apply前に内容をよく確認することを推奨）。

import { PrismaClient } from "@prisma/client";
import { fingerprintConfidence, fullContentFingerprint } from "../src/lib/contractLines";

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
    const byFingerprint = new Map<string, (typeof c.contractLines)[number][]>();
    for (const l of c.contractLines) {
      const fp = fullContentFingerprint(l);
      if (!byFingerprint.has(fp)) byFingerprint.set(fp, []);
      byFingerprint.get(fp)!.push(l);
    }

    for (const list of byFingerprint.values()) {
      if (list.length <= 1) continue;
      groupsFound++;
      const confidence = fingerprintConfidence(list[0]);
      if (confidence === "low") lowConfidenceGroups++;

      const sorted = [...list].sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
      );
      const keep = sorted[0];
      const remove = sorted.slice(1);

      console.log(
        `${c.companyName}${confidence === "low" ? " [信頼度: 低]" : ""}: ` +
          `契約種別=${keep.contractType || "(未設定)"} / 商品名=${keep.productName || "(未設定)"} / ` +
          `数量=${keep.quantity} / 契約状態=${keep.contractStatus || "(未設定)"} / ` +
          `金額=${keep.amount || "(未設定)"} / ` +
          `期間=${keep.startDate ? keep.startDate.toISOString().slice(0, 10) : "(未設定)"}〜` +
          `${keep.endDate ? keep.endDate.toISOString().slice(0, 10) : "(未設定)"}`
      );
      console.log(`  → この${list.length}件は同一内容だがexternalIdだけ違う:`);
      console.log(
        `  残す: id=${keep.id} externalId=${keep.externalId ?? "(なし)"} ` +
          `updatedAt=${keep.updatedAt.toISOString()}`
      );
      for (const r of remove) {
        console.log(
          `  削除: id=${r.id} externalId=${r.externalId ?? "(なし)"} ` +
            `updatedAt=${r.updatedAt.toISOString()}`
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
