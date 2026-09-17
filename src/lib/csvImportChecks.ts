// CSVインポートの列マッピングを人が間違えたときに気付けるようにするための検証ロジック。
// クライアント（インポート画面のプレビュー）とサーバー（実際の取り込みAPI）の両方から
// 同じロジックを使う。

// 全角スペースなどの表記ゆれを吸収して会社名を比較しやすくする
export function normalizeCompanyName(name: string): string {
  return name.trim().replace(/[\s　]+/g, " ");
}

type Row = {
  companyName?: string;
  companyExternalId?: string;
  externalId?: string;
};

// 会社ID（companyExternalId）は「同じ会社の全ての行で共通の値」であるべき。
// 同じ会社名なのに複数の異なる会社IDが出てきた場合、契約IDや行番号など
// 会社単位ではない列を誤って会社IDにマッピングしている可能性が高い。
export function findCompanyIdConflicts(rows: Row[]): string[] {
  const byName = new Map<string, Set<string>>();
  for (const row of rows) {
    const name = normalizeCompanyName(row.companyName || "");
    const id = row.companyExternalId?.trim();
    if (!name || !id) continue;
    if (!byName.has(name)) byName.set(name, new Set());
    byName.get(name)!.add(id);
  }

  const warnings: string[] = [];
  for (const [name, ids] of byName) {
    if (ids.size > 1) {
      warnings.push(
        `会社名「${name}」に複数の会社ID（${[...ids].join(", ")}）が見つかりました。` +
          "会社ID列が本当に会社（顧客）単位で共通の値になっているか確認してください。"
      );
    }
  }
  return warnings;
}

// 契約ID（externalId、契約明細1行の一意キー）は「行ごとに異なる値」であるべきで、
// 会社をまたいで同じ値になることは通常無い。もし同じ契約IDが複数の会社名にまたがって
// 出てくる場合、会社IDや別の列を誤って契約IDにマッピングしている可能性が高い。
export function findLineIdConflicts(rows: Row[]): string[] {
  const idToNames = new Map<string, Set<string>>();
  for (const row of rows) {
    const id = row.externalId?.trim();
    const name = normalizeCompanyName(row.companyName || "");
    if (!id || !name) continue;
    if (!idToNames.has(id)) idToNames.set(id, new Set());
    idToNames.get(id)!.add(name);
  }

  const warnings: string[] = [];
  for (const [id, names] of idToNames) {
    if (names.size > 1) {
      warnings.push(
        `契約ID「${id}」が複数の会社名（${[...names].join(", ")}）にまたがっています。` +
          "契約ID列が本当に契約明細1行ごとに固有の値になっているか確認してください。"
      );
    }
  }
  return warnings;
}
