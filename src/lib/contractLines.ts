// 契約明細（月契約/年契約などの行）から「現在有効なアカウント数」を集計するためのユーティリティ。
// 日付は時刻を持たない「日」の単位で比較したいので、常にUTC 00:00に正規化して扱う。

export type ContractLineLike = {
  quantity: number;
  startDate: Date;
  endDate: Date;
};

// サーバーのタイムゾーンに依存しないよう、UTCの年月日だけで「今日」を表す
export function todayUTC(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// "2026/9/1" "2026-09-01" "2026年9月1日" などを日付のみ(UTC 00:00)にパースする。不正な日付はnull。
export function parseDateOnly(input: string): Date | null {
  const trimmed = input.trim();
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

// 現在日が「開始日以上・終了日以下」の契約行のみを有効とみなす
export function isLineActive(line: ContractLineLike, asOf: Date = todayUTC()): boolean {
  return line.startDate.getTime() <= asOf.getTime() && asOf.getTime() <= line.endDate.getTime();
}

// 会社単位で、現在有効な契約行のquantityだけを合算する
export function computeActiveAccountCount(
  lines: ContractLineLike[],
  asOf: Date = todayUTC()
): number {
  return lines
    .filter((line) => isLineActive(line, asOf))
    .reduce((sum, line) => sum + line.quantity, 0);
}
