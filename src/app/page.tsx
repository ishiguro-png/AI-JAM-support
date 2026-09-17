import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PLAN_TIERS, PLAN_TIER_LABELS, computePlanTier } from "@/lib/planTier";
import { computeActiveAccountCount } from "@/lib/contractLines";
import { PlanBadge } from "@/components/PlanBadge";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [allTotal, activeTotal, contractsWithLines, recentLogs] = await Promise.all([
    prisma.contract.count(),
    prisma.contract.count({ where: { status: "active" } }),
    prisma.contract.findMany({ select: { contractLines: true } }),
    prisma.supportLog.findMany({
      orderBy: { occurredAt: "desc" },
      take: 10,
      include: { contract: { select: { id: true, companyName: true } } },
    }),
  ]);

  // アカウント数・プランはContractLineの契約状態から都度集計する（キャッシュを持たないため常に最新）
  const tierCounts = PLAN_TIERS.map(
    (tier) =>
      contractsWithLines.filter(
        (c) => computePlanTier(computeActiveAccountCount(c.contractLines)) === tier
      ).length
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <p className="mt-1 text-sm text-slate-500">
          サポートプラン対象契約先と対応状況の概要
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="card p-4">
          <div className="text-sm text-slate-500">契約先（全ステータス）</div>
          <div className="mt-1 text-3xl font-bold">{allTotal}</div>
          <div className="mt-1 text-xs text-slate-400">うち稼働中: {activeTotal}</div>
        </div>
        {PLAN_TIERS.map((tier, i) => (
          <Link
            key={tier}
            href={`/contracts?tier=${encodeURIComponent(tier)}`}
            className="card p-4 hover:border-brand-300"
          >
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <PlanBadge tier={tier} />
              {PLAN_TIER_LABELS[tier]}
            </div>
            <div className="mt-1 text-3xl font-bold">{tierCounts[i]}</div>
          </Link>
        ))}
      </div>

      <div className="card">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold">
          最近の対応履歴
        </div>
        <ul className="divide-y divide-slate-100">
          {recentLogs.length === 0 && (
            <li className="px-4 py-6 text-sm text-slate-500">
              まだ対応履歴がありません。
            </li>
          )}
          {recentLogs.map((log) => (
            <li key={log.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <Link
                  href={`/contracts/${log.contract.id}`}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {log.contract.companyName}
                </Link>
                <div className="text-sm text-slate-500">
                  [{log.type}] {log.subject || log.content.slice(0, 40)}
                </div>
              </div>
              <div className="text-right text-sm text-slate-500">
                <div>{log.staffName}</div>
                <div>{new Date(log.occurredAt).toLocaleString("ja-JP")}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
