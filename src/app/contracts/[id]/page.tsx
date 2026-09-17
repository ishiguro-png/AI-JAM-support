import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { computePlanTier } from "@/lib/planTier";
import { ACTIVE_CONTRACT_STATUS, computeActiveAccountCount } from "@/lib/contractLines";
import { PlanBadge } from "@/components/PlanBadge";
import { AddLogForm } from "@/components/AddLogForm";
import { SendEmailForm } from "@/components/SendEmailForm";
import { ContractStatusEditor } from "@/components/ContractStatusEditor";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  email: "メール",
  call: "電話",
  visit: "訪問",
  note: "メモ",
  other: "その他",
};

export default async function ContractDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    include: {
      contractLines: { orderBy: { startDate: "desc" } },
      supportLogs: { orderBy: { occurredAt: "desc" } },
    },
  });

  if (!contract) notFound();

  const accountCount = computeActiveAccountCount(contract.contractLines);
  const planTier = computePlanTier(accountCount);

  const [staff, templates] = await Promise.all([
    prisma.staff.findMany({ orderBy: { name: "asc" } }),
    prisma.emailTemplate.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/contracts" className="text-sm text-brand-600 hover:underline">
          ← 契約一覧に戻る
        </Link>
      </div>

      <div className="card p-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{contract.companyName}</h1>
            <div className="mt-2 flex items-center gap-2">
              <PlanBadge tier={planTier} />
              <span className="text-sm text-slate-500">
                現在のアカウント数: {accountCount}
              </span>
            </div>
          </div>
          <ContractStatusEditor contractId={contract.id} status={contract.status} />
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">担当者</dt>
            <dd>{contract.contactName || "-"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">メールアドレス</dt>
            <dd>{contract.contactEmail || "-"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">電話番号</dt>
            <dd>{contract.phone || "-"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">取り込み日</dt>
            <dd>{new Date(contract.importedAt).toLocaleDateString("ja-JP")}</dd>
          </div>
          {contract.notes && (
            <div className="sm:col-span-2">
              <dt className="text-slate-500">備考</dt>
              <dd className="whitespace-pre-wrap">{contract.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SendEmailForm
          contractId={contract.id}
          contactEmail={contract.contactEmail}
          planTier={planTier}
          staff={staff}
          templates={templates}
        />
        <AddLogForm contractId={contract.id} staff={staff} />
      </div>

      <div className="card">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold">
          契約明細（{contract.contractLines.length}件）
        </div>
        <p className="px-4 pt-3 text-xs text-slate-500">
          アカウント数の集計は「契約状態」列のみで判定します（契約開始日・終了日は表示用の参考情報です）。
        </p>
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2">契約種別</th>
              <th className="px-4 py-2">数量</th>
              <th className="px-4 py-2">契約状態</th>
              <th className="px-4 py-2">契約開始日</th>
              <th className="px-4 py-2">契約終了日</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contract.contractLines.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  契約明細がまだありません。CSVインポートで取り込んでください。
                </td>
              </tr>
            )}
            {contract.contractLines.map((line) => {
              const active = line.contractStatus === ACTIVE_CONTRACT_STATUS;
              return (
                <tr key={line.id}>
                  <td className="px-4 py-2">{line.contractType || "-"}</td>
                  <td className="px-4 py-2">{line.quantity}</td>
                  <td className="px-4 py-2">
                    {line.contractStatus ? (
                      <span
                        className={
                          active
                            ? "badge bg-emerald-100 text-emerald-800"
                            : "badge bg-slate-100 text-slate-600"
                        }
                      >
                        {line.contractStatus}
                        {active ? "（集計対象）" : ""}
                      </span>
                    ) : (
                      <span className="badge bg-slate-100 text-slate-400">未設定</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {line.startDate ? new Date(line.startDate).toLocaleDateString("ja-JP") : "-"}
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {line.endDate ? new Date(line.endDate).toLocaleDateString("ja-JP") : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold">
          対応履歴（{contract.supportLogs.length}件）
        </div>
        <ul className="divide-y divide-slate-100">
          {contract.supportLogs.length === 0 && (
            <li className="px-4 py-6 text-sm text-slate-500">まだ対応履歴がありません。</li>
          )}
          {contract.supportLogs.map((log) => (
            <li key={log.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="badge bg-slate-100 text-slate-700">
                    {TYPE_LABELS[log.type] || log.type}
                  </span>
                  <span className="font-medium">{log.subject || "（件名なし）"}</span>
                  {log.type === "email" && (
                    <span
                      className={
                        log.emailStatus === "sent"
                          ? "badge bg-emerald-100 text-emerald-800"
                          : "badge bg-rose-100 text-rose-800"
                      }
                    >
                      {log.emailStatus === "sent" ? "送信済み" : "送信失敗"}
                    </span>
                  )}
                </div>
                <div className="text-right text-sm text-slate-500">
                  <div>{log.staffName}</div>
                  <div>{new Date(log.occurredAt).toLocaleString("ja-JP")}</div>
                </div>
              </div>
              {log.emailTo && (
                <p className="mt-1 text-xs text-slate-500">宛先: {log.emailTo}</p>
              )}
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{log.content}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
