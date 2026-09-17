import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PLAN_TIERS, PLAN_TIER_SHORT_LABELS, computePlanTier } from "@/lib/planTier";
import { computeActiveAccountCount } from "@/lib/contractLines";
import { PlanBadge } from "@/components/PlanBadge";

export const dynamic = "force-dynamic";

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: { tier?: string; q?: string; status?: string };
}) {
  const tier = searchParams.tier || "";
  const q = searchParams.q || "";
  // クエリパラメータが無い初回表示では絞り込まず全ステータスを表示する。
  // ここで "active" 等を既定値にすると、インポートしたデータのステータス値が
  // その文字列と一致しない限り一覧が常に空に見えてしまうため要注意。
  const status = searchParams.status || "";

  const contracts = await prisma.contract.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { companyName: { contains: q } },
              { contactName: { contains: q } },
              { contactEmail: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { companyName: "asc" },
    include: {
      contractLines: true,
      supportLogs: { orderBy: { occurredAt: "desc" }, take: 1 },
    },
  });

  // アカウント数・プランは日付によって変わるため保存せずここで都度計算する
  const withComputed = contracts.map(({ contractLines, ...c }) => {
    const accountCount = computeActiveAccountCount(contractLines);
    return { ...c, accountCount, planTier: computePlanTier(accountCount) };
  });
  const visibleContracts = tier
    ? withComputed.filter((c) => c.planTier === tier)
    : withComputed;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">契約一覧</h1>
        <Link href="/contracts/import" className="btn-secondary">
          CSVインポート
        </Link>
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-4" method="get">
        <div>
          <label className="label">サポートプラン</label>
          <select name="tier" defaultValue={tier} className="input">
            <option value="">すべて</option>
            {PLAN_TIERS.map((t) => (
              <option key={t} value={t}>
                {PLAN_TIER_SHORT_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">ステータス</label>
          <select name="status" defaultValue={status} className="input">
            <option value="">すべて</option>
            <option value="active">稼働中</option>
            <option value="paused">一時停止</option>
            <option value="cancelled">解約</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="label">検索（会社名・担当者・メール）</label>
          <input name="q" defaultValue={q} className="input" placeholder="キーワード" />
        </div>
        <button className="btn" type="submit">
          絞り込み
        </button>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2">会社名</th>
              <th className="px-4 py-2">アカウント数</th>
              <th className="px-4 py-2">プラン</th>
              <th className="px-4 py-2">担当者/連絡先</th>
              <th className="px-4 py-2">最終対応</th>
              <th className="px-4 py-2">ステータス</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleContracts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  該当する契約先がありません。
                </td>
              </tr>
            )}
            {visibleContracts.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/contracts/${c.id}`} className="font-medium text-brand-700 hover:underline">
                    {c.companyName}
                  </Link>
                </td>
                <td className="px-4 py-2">{c.accountCount}</td>
                <td className="px-4 py-2">
                  <PlanBadge tier={c.planTier} />
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {c.contactName || "-"}
                  {c.contactEmail ? ` / ${c.contactEmail}` : ""}
                </td>
                <td className="px-4 py-2 text-slate-500">
                  {c.supportLogs[0]
                    ? new Date(c.supportLogs[0].occurredAt).toLocaleDateString("ja-JP")
                    : "未対応"}
                </td>
                <td className="px-4 py-2 text-slate-500">{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
