"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TYPE_LABELS: Record<string, string> = {
  call: "電話",
  visit: "訪問",
  note: "メモ",
  other: "その他",
};

export function AddLogForm({
  contractId,
  staff,
}: {
  contractId: string;
  staff: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [type, setType] = useState("call");
  const [staffName, setStaffName] = useState(staff[0]?.name || "");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!staffName.trim() || !content.trim()) {
      setError("担当者と対応内容は必須です");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/contracts/${contractId}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, staffName, subject, content }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "登録に失敗しました");
      }
      setSubject("");
      setContent("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-3 p-4">
      <h3 className="font-semibold">対応履歴を記録</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">対応種別</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">担当者</label>
          <input
            className="input"
            list="staff-list"
            value={staffName}
            onChange={(e) => setStaffName(e.target.value)}
            placeholder="担当者名"
          />
          <datalist id="staff-list">
            {staff.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </div>
      </div>
      <div>
        <label className="label">件名（任意）</label>
        <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div>
        <label className="label">対応内容</label>
        <textarea
          className="input"
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button className="btn" disabled={submitting}>
        {submitting ? "登録中..." : "記録する"}
      </button>
    </form>
  );
}
