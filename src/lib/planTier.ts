export type PlanTier = "5+" | "10+" | "30+";

export const PLAN_TIERS: PlanTier[] = ["5+", "10+", "30+"];

export const PLAN_TIER_LABELS: Record<PlanTier, string> = {
  "5+": "5アカウント以上プラン",
  "10+": "10アカウント以上プラン",
  "30+": "30アカウント以上プラン",
};

// バッジや絞り込みの選択肢など、短く「◯◯アカウント以上」と表示したい箇所向け
export const PLAN_TIER_SHORT_LABELS: Record<PlanTier, string> = {
  "5+": "5アカウント以上",
  "10+": "10アカウント以上",
  "30+": "30アカウント以上",
};

// アカウント数から対象となるサポートプランの階層を判定する（該当なしはnull）
export function computePlanTier(accountCount: number): PlanTier | null {
  if (accountCount >= 30) return "30+";
  if (accountCount >= 10) return "10+";
  if (accountCount >= 5) return "5+";
  return null;
}
