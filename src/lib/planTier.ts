export type PlanTier = "5+" | "10+" | "30+";

export const PLAN_TIERS: PlanTier[] = ["5+", "10+", "30+"];

export const PLAN_TIER_LABELS: Record<PlanTier, string> = {
  "5+": "5アカウント以上プラン",
  "10+": "10アカウント以上プラン",
  "30+": "30アカウント以上プラン",
};

// アカウント数から対象となるサポートプランの階層を判定する（該当なしはnull）
export function computePlanTier(accountCount: number): PlanTier | null {
  if (accountCount >= 30) return "30+";
  if (accountCount >= 10) return "10+";
  if (accountCount >= 5) return "5+";
  return null;
}
