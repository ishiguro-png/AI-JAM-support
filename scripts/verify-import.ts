// CSVインポート後のデータ整合性を検証するスクリプト。
// 実行: npm run verify （対象は .env の DATABASE_URL、通常は prisma/dev.db）
//
// 確認する項目:
//   1. 同一会社名（表記ゆれ正規化後）が複数のContractに分裂していないか
//   2. accountCount（画面表示値）が「契約中」の契約明細のquantity合計と一致するか
//      （アプリのロジックとは別に、このスクリプト内で独立に再計算してクロスチェックする）
//   3. contractStatusが未設定(null)の契約明細がないか（集計から漏れていないか確認するため）
//   4. 契約ID（externalId）がContractLine間で重複していないか
//   5. 契約種別（contractType）の集計・商品名との整合性
//      - 年契約/月契約/未設定それぞれの件数
//      - 商品名が「【年間プラン】」なのにcontractTypeが「月契約」になっている件数
//      - 商品名が「【月額プラン】」なのにcontractTypeが「年契約」になっている件数
//
// 同一CSVの再インポートで件数が増殖しないかは、このスクリプトの実行結果
// （会社数・契約明細数の合計）を再インポート前後で比較することで確認できる。

import { PrismaClient } from "@prisma/client";
import { ACTIVE_CONTRACT_STATUS, computeActiveAccountCount } from "../src/lib/contractLines";
import { normalizeCompanyName } from "../src/lib/csvImportChecks";
import { computePlanTier } from "../src/lib/planTier";

const prisma = new PrismaClient();

async function main() {
  const contracts = await prisma.contract.findMany({
    include: { contractLines: true },
    orderBy: { companyName: "asc" },
  });

  const totalLines = contracts.reduce((sum, c) => sum + c.contractLines.length, 0);
  console.log(`会社(Contract)数: ${contracts.length}`);
  console.log(`契約明細(ContractLine)数(合計): ${totalLines}`);
  console.log("");

  let hasProblem = false;

  // 1. 同一会社名の分裂チェック
  const byName = new Map<string, typeof contracts>();
  for (const c of contracts) {
    const key = normalizeCompanyName(c.companyName);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(c);
  }
  const duplicates = [...byName.entries()].filter(([, list]) => list.length > 1);

  if (duplicates.length === 0) {
    console.log("[OK] 同一会社名が複数のContractに分裂しているケースはありません。");
  } else {
    hasProblem = true;
    console.log(`[NG] 会社名が重複しているグループ: ${duplicates.length}件`);
    for (const [name, list] of duplicates) {
      console.log(`  - 「${name}」が ${list.length} 件のContractに分裂:`);
      for (const c of list) {
        console.log(
          `      id=${c.id} companyName=${JSON.stringify(c.companyName)} ` +
            `externalId=${c.externalId ?? "(なし)"} 契約明細数=${c.contractLines.length}`
        );
      }
      const ids = list.map((c) => c.externalId ?? null);
      const distinctIds = new Set(ids.filter((x): x is string => x !== null));
      if (distinctIds.size > 1) {
        console.log(
          `      原因: 会社ID(externalId)が ${[...distinctIds].join(", ")} のように複数種類存在しています。` +
            "CSVインポート時の「会社ID」マッピングが、実際には会社単位で共通の値になっていない列を" +
            "指している可能性があります（契約ID・行番号などを誤って会社IDにマッピングしていないか確認してください）。"
        );
      } else if (distinctIds.size === 0) {
        console.log(
          "      原因: 会社IDが設定されていないため会社名のみで突合していますが、" +
            "会社名の文字列そのものが行によって微妙に異なっている可能性があります" +
            "（正規化で吸収しきれない文字種の違いなど）。各ContractのcompanyNameを目視で比較してください。"
        );
      } else {
        console.log(
          "      原因: 1件は会社IDあり・他は会社IDなしで作られたため別Contractとして扱われています。" +
            "会社IDを付けてCSVを再インポートすると、次回以降は統合されます" +
            "（ただし既にできてしまったこの分裂自体は自動統合されないため、手動での統合が必要です）。"
        );
      }
    }
  }
  console.log("");

  // 2. accountCountの独立検算
  let mismatchCount = 0;
  let nullStatusLineCount = 0;
  for (const c of contracts) {
    const appComputed = computeActiveAccountCount(c.contractLines);
    const manualSum = c.contractLines
      .filter((l) => l.contractStatus === ACTIVE_CONTRACT_STATUS)
      .reduce((sum, l) => sum + l.quantity, 0);
    if (appComputed !== manualSum) {
      hasProblem = true;
      mismatchCount++;
      console.log(
        `[NG] ${c.companyName}: 画面表示のaccountCount=${appComputed} / 独立再計算=${manualSum} が不一致`
      );
    }
    nullStatusLineCount += c.contractLines.filter((l) => !l.contractStatus).length;
  }
  if (mismatchCount === 0) {
    console.log("[OK] 全社でaccountCountは「契約中」明細のquantity合計と一致しています。");
  }
  if (nullStatusLineCount > 0) {
    console.log(
      `[注意] 契約状態(contractStatus)が未設定の契約明細が ${nullStatusLineCount} 件あります。` +
        "これらはaccountCountの集計から除外されています（CSVインポート前のデータ、または契約状態が空欄のまま取り込まれた行の可能性）。"
    );
  }
  console.log("");

  // 3. 契約ID(externalId)の重複チェック（DBのユニーク制約で通常は防止されるが念のため）
  const dup = await prisma.contractLine.groupBy({
    by: ["externalId"],
    where: { externalId: { not: null } },
    _count: { externalId: true },
  });
  const dupIds = dup.filter((d) => d._count.externalId > 1);
  if (dupIds.length === 0) {
    console.log("[OK] 契約ID(externalId)の重複はありません。");
  } else {
    hasProblem = true;
    console.log(`[NG] 重複している契約ID: ${dupIds.map((d) => d.externalId).join(", ")}`);
  }
  console.log("");

  // 5. 契約種別（contractType）の集計・商品名との整合性チェック
  const YEARLY_TAG = "【年間プラン】";
  const MONTHLY_TAG = "【月額プラン】";
  let yearlyCount = 0;
  let monthlyCount = 0;
  let unsetTypeCount = 0;
  const typeMismatches: {
    companyName: string;
    productName: string;
    contractType: string;
    amount: string;
    kind: string;
  }[] = [];

  for (const c of contracts) {
    for (const l of c.contractLines) {
      const type = (l.contractType || "").trim();
      if (type === "年契約") yearlyCount++;
      else if (type === "月契約") monthlyCount++;
      else if (!type) unsetTypeCount++;

      const productName = l.productName || "";
      if (productName.includes(YEARLY_TAG) && type === "月契約") {
        typeMismatches.push({
          companyName: c.companyName,
          productName,
          contractType: type,
          amount: l.amount ?? "(なし)",
          kind: `商品名が${YEARLY_TAG}なのに月契約`,
        });
      }
      if (productName.includes(MONTHLY_TAG) && type === "年契約") {
        typeMismatches.push({
          companyName: c.companyName,
          productName,
          contractType: type,
          amount: l.amount ?? "(なし)",
          kind: `商品名が${MONTHLY_TAG}なのに年契約`,
        });
      }
    }
  }

  const yearlyMismatchCount = typeMismatches.filter((m) => m.kind.includes(YEARLY_TAG)).length;
  const monthlyMismatchCount = typeMismatches.filter((m) => m.kind.includes(MONTHLY_TAG)).length;

  console.log("=== 契約種別の検証 ===");
  console.log(`年契約の件数: ${yearlyCount}`);
  console.log(`月契約の件数: ${monthlyCount}`);
  console.log(`契約種別未設定の件数: ${unsetTypeCount}`);
  console.log(`${YEARLY_TAG}なのに月契約になっている件数: ${yearlyMismatchCount}`);
  console.log(`${MONTHLY_TAG}なのに年契約になっている件数: ${monthlyMismatchCount}`);

  if (typeMismatches.length > 0) {
    hasProblem = true;
    console.log("");
    console.log("不一致の明細一覧（会社名 / 商品名 / 契約種別 / 金額）:");
    for (const m of typeMismatches) {
      console.log(
        `  - [${m.kind}] ${m.companyName} / ${m.productName} / ${m.contractType} / ${m.amount}`
      );
    }
  }
  console.log("");
  console.log(typeMismatches.length === 0 ? "[OK] 契約種別" : "[NG] 契約種別");
  console.log("");

  console.log("=== 会社別サマリ ===");
  for (const c of contracts) {
    const accountCount = computeActiveAccountCount(c.contractLines);
    const activeLines = c.contractLines.filter((l) => l.contractStatus === ACTIVE_CONTRACT_STATUS).length;
    console.log(
      `${c.companyName} | accountCount=${accountCount} | plan=${computePlanTier(accountCount) ?? "対象外"} | ` +
        `契約明細=${c.contractLines.length}件（契約中=${activeLines}件）`
    );
  }

  console.log("");
  console.log(hasProblem ? "=== 結果: 問題が見つかりました ===" : "=== 結果: 問題は見つかりませんでした ===");

  await prisma.$disconnect();
  process.exit(hasProblem ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
