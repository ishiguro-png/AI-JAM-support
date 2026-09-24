// 内容が同じ（契約種別・契約開始日・契約終了日が完全一致）なのに、externalId(契約ID)だけが
// 異なるためにContractLineが重複作成されてしまったケースを整理するスクリプト。
//
// 典型的な原因: CSVの「契約ID」列が、torimatoの再エクスポートのたびに違う値になってしまい
// （安定した一意キーではない）、契約IDでの突合に失敗して同じ契約明細が何度も新規作成される。
//
// 実行方法:
//   npm run dedupe-lines            … 削除対象を表示するだけ（何も削除しない・安全）
//   npm run dedupe-lines -- --apply … 実際に削除する
//
// 同一会社・同一契約種別・同一契約期間（開始日・終了日）のグループごとに、
// 最もupdatedAtが新しい1件だけを残し、他は削除する（＝直近のCSVインポートで
// 反映された最新の状態を優先する）。契約種別・開始日・終了日のいずれかが
// 未設定（null）の契約明細は対象外とし、手動確認に回す（誤削除を避けるため）。

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");

  const contracts = await prisma.contract.findMany({
    include: { contractLines: true },
    orderBy: { companyName: "asc" },
  });

  let groupsFound = 0;
  let linesToDelete: string[] = [];
  let skippedForReview = 0;

  for (const c of contracts) {
    const byFingerprint = new Map<string, (typeof c.contractLines)[number][]>();
    for (const l of c.contractLines) {
      if (!l.contractType || !l.startDate || !l.endDate) {
        continue; // 情報不足のものは自動削除の対象外
      }
      const fp = `${l.contractType}|${l.startDate.toISOString()}|${l.endDate.toISOString()}`;
      if (!byFingerprint.has(fp)) byFingerprint.set(fp, []);
      byFingerprint.get(fp)!.push(l);
    }

    for (const [fp, list] of byFingerprint) {
      if (list.length <= 1) continue;
      groupsFound++;
      const sorted = [...list].sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
      );
      const keep = sorted[0];
      const remove = sorted.slice(1);
      const [type, start, end] = fp.split("|");

      console.log(`${c.companyName} (${type} / ${start}〜${end}): ${list.length}件 → 1件に整理`);
      console.log(
        `  残す: id=${keep.id} externalId=${keep.externalId ?? "(なし)"} ` +
          `contractStatus=${keep.contractStatus ?? "(未設定)"} quantity=${keep.quantity} ` +
          `updatedAt=${keep.updatedAt.toISOString()}`
      );
      for (const r of remove) {
        console.log(
          `  削除: id=${r.id} externalId=${r.externalId ?? "(なし)"} ` +
            `contractStatus=${r.contractStatus ?? "(未設定)"} quantity=${r.quantity} ` +
            `updatedAt=${r.updatedAt.toISOString()}`
        );
      }
      linesToDelete.push(...remove.map((r) => r.id));
    }
  }

  // 契約種別・開始日・終了日のいずれかが未設定で自動判定できなかった重複候補を、
  // 参考情報として別途一覧表示する（自動削除はしない）
  for (const c of contracts) {
    const incomplete = c.contractLines.filter(
      (l) => !l.contractType || !l.startDate || !l.endDate
    );
    if (incomplete.length > 1) {
      skippedForReview += incomplete.length;
      console.log(
        `[要目視確認] ${c.companyName}: 契約種別/契約開始日/契約終了日が未設定の契約明細が` +
          `${incomplete.length}件あります（自動判定できないため対象外。Prisma Studioで確認してください）`
      );
    }
  }

  console.log("");
  console.log(`重複グループ: ${groupsFound}件 / 削除対象: ${linesToDelete.length}件`);
  if (skippedForReview > 0) {
    console.log(`要目視確認（自動対象外）: ${skippedForReview}件`);
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
