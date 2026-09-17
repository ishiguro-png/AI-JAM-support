const badgeClass: Record<string, string> = {
  "5+": "badge badge-5",
  "10+": "badge badge-10",
  "30+": "badge badge-30",
};

export function PlanBadge({ tier }: { tier: string | null }) {
  if (!tier) {
    return <span className="badge badge-none">対象外</span>;
  }
  return <span className={badgeClass[tier] ?? "badge badge-none"}>{tier}</span>;
}
