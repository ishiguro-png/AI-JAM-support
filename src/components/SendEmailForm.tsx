"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Template = {
  id: string;
  name: string;
  planTier: string | null;
  subject: string;
  body: string;
};

export function SendEmailForm({
  contractId,
  contactEmail,
  planTier,
  staff,
  templates,
}: {
  contractId: string;
  contactEmail: string | null;
  planTier: string | null;
  staff: { id: string; name: string }[];
  templates: Template[];
}) {
  const router = useRouter();
  const [staffName, setStaffName] = useState(staff[0]?.name || "");
  const [to, setTo] = useState(contactEmail || "");
  const [cc, setCc] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!staffName.trim() || !to.trim() || !subject.trim() || !body.trim()) {
      setError("担当者・宛先・件名・本文は必須です");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/contracts/${contractId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffName, to, cc, subject, body }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "送信に失敗しました");
      }
      setSuccess("メールを送信し、対応履歴に記録しました");
      setBody("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  const relevantTemplates = templates.filter(
    (t) => !t.planTier || t.planTier === planTier
  );

  return (
    <form onSubmit={handleSubmit} className="card space-y-3 p-4">
      <h3 className="font-semibold">サポートメールを送信</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">担当者</label>
          <input
            className="input"
            list="staff-list-email"
            value={staffName}
            onChange={(e) => setStaffName(e.target.value)}
          />
          <datalist id="staff-list-email">
            {staff.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label">テンプレート</label>
          <select
            className="input"
            value={templateId}
            onChange={(e) => applyTemplate(e.target.value)}
          >
            <option value="">（テンプレートを選択）</option>
            {relevantTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">宛先</label>
          <input className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="label">CC（任意）</label>
          <input className="input" value={cc} onChange={(e) => setCc(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">件名</label>
        <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div>
        <label className="label">本文</label>
        <textarea
          className="input"
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">{success}</p>}
      <button className="btn" disabled={submitting}>
        {submitting ? "送信中..." : "送信して記録する"}
      </button>
    </form>
  );
}
