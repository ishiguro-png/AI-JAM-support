"use client";

import { useEffect, useState } from "react";
import { PLAN_TIERS } from "@/lib/planTier";

type Template = {
  id: string;
  name: string;
  planTier: string | null;
  subject: string;
  body: string;
};

const emptyForm = { name: "", planTier: "", subject: "", body: "" };

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/templates");
    const data = await res.json();
    setTemplates(data.templates || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(t: Template) {
    setEditingId(t.id);
    setForm({ name: t.name, planTier: t.planTier || "", subject: t.subject, body: t.body });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
      setError("名前・件名・本文は必須です");
      return;
    }
    const payload = {
      name: form.name,
      planTier: form.planTier || null,
      subject: form.subject,
      body: form.body,
    };
    const res = editingId
      ? await fetch("/api/templates", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, ...payload }),
        })
      : await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "保存に失敗しました");
      return;
    }
    resetForm();
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("このテンプレートを削除しますか？")) return;
    await fetch("/api/templates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">メールテンプレート</h1>
      <p className="text-sm text-slate-500">
        サポートプランごとの定型連絡文を管理します。契約詳細画面のメール送信フォームから呼び出せます。
      </p>

      <form onSubmit={handleSubmit} className="card space-y-3 p-4">
        <h3 className="font-semibold">{editingId ? "テンプレートを編集" : "新規テンプレート"}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">名前</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">対象プラン</label>
            <select
              className="input"
              value={form.planTier}
              onChange={(e) => setForm((f) => ({ ...f, planTier: e.target.value }))}
            >
              <option value="">共通（全プラン）</option>
              {PLAN_TIERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">件名</label>
          <input
            className="input"
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">本文</label>
          <textarea
            className="input"
            rows={6}
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <button className="btn">{editingId ? "更新する" : "作成する"}</button>
          {editingId && (
            <button type="button" className="btn-secondary" onClick={resetForm}>
              キャンセル
            </button>
          )}
        </div>
      </form>

      <div className="card divide-y divide-slate-100">
        {loading && <p className="p-4 text-sm text-slate-500">読み込み中...</p>}
        {!loading && templates.length === 0 && (
          <p className="p-4 text-sm text-slate-500">テンプレートがまだありません。</p>
        )}
        {templates.map((t) => (
          <div key={t.id} className="flex items-start justify-between gap-4 p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{t.name}</span>
                <span className="badge bg-slate-100 text-slate-600">
                  {t.planTier || "共通"}
                </span>
              </div>
              <div className="mt-1 text-sm text-slate-600">件名: {t.subject}</div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{t.body}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button className="btn-secondary" onClick={() => startEdit(t)}>
                編集
              </button>
              <button
                className="btn-secondary text-rose-600"
                onClick={() => handleDelete(t.id)}
              >
                削除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
