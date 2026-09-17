// 契約明細（月契約/年契約などの行）から「現在有効なアカウント数」を集計するためのユーティリティ。
//
// torimatoのCSVに入っている契約開始日・契約終了日は、無料期間や契約切り替えの都合で
// 実際の契約状態と一致しないことがあるため、有効契約かどうかの判定には使用しない。
// 代わりにCSVの「契約状態」列（契約中 / 契約前 / 解約）だけを基準に判定する。
// 開始日・終了日は契約詳細画面などの表示用データとしてのみ保持する。

export const ACTIVE_CONTRACT_STATUS = "契約中";

export type ContractLineLike = {
  quantity: number;
  contractStatus: string | null;
};

export function isLineActive(line: ContractLineLike): boolean {
  return (line.contractStatus ?? "").trim() === ACTIVE_CONTRACT_STATUS;
}

// 会社単位で、契約状態が「契約中」の契約行だけのquantityを合算する
export function computeActiveAccountCount(lines: ContractLineLike[]): number {
  return lines.filter(isLineActive).reduce((sum, line) => sum + line.quantity, 0);
}

// "2026/9/1" "2026-09-01" "2026年9月1日" などを日付のみ(UTC 00:00)にパースする。
// 表示用データの保持にのみ使用し、集計判定には使わない。不正な日付や空文字はnull。
export function parseDateOnly(input: string): Date | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const m = trimmed.match(/^(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})/);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  // 2月30日のような繰り上がりを弾く
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}
