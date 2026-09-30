// 契約明細（月契約/年契約などの行）から「現在のアカウント数」を集計するためのユーティリティ。
//
// torimatoのCSVに入っている契約開始日・契約終了日は、無料期間や契約切り替えの都合で
// 実際の契約状態と一致しないことがあるため、集計対象かどうかの判定には使用しない。
// 代わりにCSVの「契約状態」列だけを基準に判定する（契約期間の日付から契約前・契約中を
// 推測することはしない）。開始日・終了日は契約詳細画面などの表示用データとしてのみ保持する。
//
// 集計ルール:
//   - 契約中 → カウントする
//   - 契約前 → カウントする（まだ開始していないが有効な契約のため）
//   - 解約・解約済み等、終了した契約 → カウントしない
export const ACTIVE_CONTRACT_STATUS = "契約中";
export const PENDING_CONTRACT_STATUS = "契約前";
// アカウント数の集計対象に含める契約状態の一覧。この配列に無い値（解約・解約済み・
// 未設定など）は全てカウント対象外になる。
export const ACCOUNT_COUNTABLE_STATUSES: readonly string[] = [
  ACTIVE_CONTRACT_STATUS,
  PENDING_CONTRACT_STATUS,
];

export type ContractLineLike = {
  quantity: number;
  contractStatus: string | null;
};

// このContractLineがアカウント数の集計対象かどうか（契約中 または 契約前）。
export function isLineActive(line: ContractLineLike): boolean {
  return ACCOUNT_COUNTABLE_STATUSES.includes((line.contractStatus ?? "").trim());
}

// 会社単位で、集計対象（契約中・契約前）の契約行だけのquantityを合算する
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

// --- 契約種別・商品名の整合性チェック用 ------------------------------------------
//
// 商品名に含まれるプラン表記（【年間プラン】/【月額プラン】）と契約種別（年契約/月契約）が
// 一致しているかの検証に使う。npm run verify から利用する。
export const YEARLY_PLAN_TAG = "【年間プラン】";
export const MONTHLY_PLAN_TAG = "【月額プラン】";

// キー発行状況（CSVの「キー発行済み」列）を "済" / "未" に正規化する。
// torimatoの表記ゆれ（済/未発行、○/×、TRUE/FALSE等）をできるだけ吸収するが、
// どちらとも判断できない場合は元の文字列をそのまま保持する（＝情報を失わない）。
const ISSUED_PATTERNS = ["済", "発行済", "○", "レ", "true", "yes", "y", "1"];
const NOT_ISSUED_PATTERNS = ["未", "未発行", "×", "false", "no", "n", "0"];

export function normalizeKeyIssuedStatus(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  const lower = trimmed.toLowerCase();
  if (ISSUED_PATTERNS.some((p) => lower === p.toLowerCase())) return "済";
  if (NOT_ISSUED_PATTERNS.some((p) => lower === p.toLowerCase())) return "未";
  return trimmed;
}
