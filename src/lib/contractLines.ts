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

// --- 契約明細の「同一性」を判定するための指紋 -----------------------------------
//
// 契約ID（externalId）はtorimatoの再エクスポートのたびに値が変わることがあり、
// それだけに頼ると同じ契約明細が再インポートのたびに新規作成され続けてしまう。
// そのため、契約ID以外の情報からも「同じ契約明細らしさ」を判定できるようにする。
// 用途に応じて2種類の指紋を使い分ける。

type StableIdentityInput = {
  contractType: string;
  productName: string | null;
  startDate: Date | null;
  endDate: Date | null;
};

// 「本来、時間が経っても変わらないはずの識別情報」だけを使った指紋（インポート時の
// 同一明細判定に使用）。数量・契約状態・金額は状態の変化で正しく変わりうるため含めない。
// 契約種別だけでは会社内で複数の同種契約と衝突しやすいため、商品名または契約期間の
// どちらか一方が無いと識別力が弱すぎると判断し、その場合はnullを返す
// （＝この指紋では安全にマッチさせられない＝新規作成するしかない、という意味）。
export function stableIdentityFingerprint(line: StableIdentityInput): string | null {
  const type = (line.contractType || "").trim();
  const product = (line.productName || "").trim();
  const hasDates = !!(line.startDate && line.endDate);
  if (!product && !hasDates) return null;
  return [
    type,
    product,
    line.startDate ? line.startDate.toISOString() : "null",
    line.endDate ? line.endDate.toISOString() : "null",
  ].join("|");
}

type FullContentInput = StableIdentityInput & {
  quantity: number;
  contractStatus: string | null;
  amount: string | null;
};

// 「今この瞬間、externalId以外の全項目が完全に一致しているか」を表す厳密な指紋。
// 再インポートのたびにexternalIdだけ変わって同じ内容の契約明細が増殖してしまった
// ケースを検出・整理するために使う（npm run verify / npm run dedupe-lines）。
// 数量・契約状態・金額も含めて完全一致を要求するため、時間経過で状態が変わった
// 明細まで誤って同一視することは無い（その場合は指紋が変わり別グループになる）。
export function fullContentFingerprint(line: FullContentInput): string {
  return [
    (line.contractType || "").trim(),
    (line.productName || "").trim(),
    String(line.quantity),
    (line.contractStatus || "").trim(),
    (line.amount || "").trim(),
    line.startDate ? line.startDate.toISOString() : "null",
    line.endDate ? line.endDate.toISOString() : "null",
  ].join("|");
}

// fullContentFingerprintの信頼度。契約種別・商品名・契約期間が全て空/未設定だと
// 数量・契約状態・金額だけで一致判定することになり、偶然の一致が起きやすい。
export function fingerprintConfidence(
  line: StableIdentityInput
): "high" | "low" {
  const type = (line.contractType || "").trim();
  const product = (line.productName || "").trim();
  const hasDates = !!(line.startDate && line.endDate);
  return type || product || hasDates ? "high" : "low";
}
