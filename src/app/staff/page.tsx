"use client";

import { useEffect, useState } from "react";

type Staff = { id: string; name: string };

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/staff");
    const data = await res.json();
    setStaff(data.staff || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("名前を入力してください");
      return;
    }
    const res = await fetch("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "登録に失敗しました");
      return;
    }
    setName("");
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("この担当者を削除しますか？")) return;
    await fetch("/api/staff", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">担当者管理</h1>
      <p className="text-sm text-slate-500">
        ログイン機能はなく、誰が対応しても記録を残せるよう担当者名だけを管理します。
        対応記録・メール送信フォームの候補として表示されます。
      </p>

      <form onSubmit={handleAdd} className="card flex items-end gap-3 p-4">
        <div className="flex-1">
          <label className="label">担当者名</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn">追加</button>
      </form>
      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="card divide-y divide-slate-100">
        {loading && <p className="p-4 text-sm text-slate-500">読み込み中...</p>}
        {!loading && staff.length === 0 && (
          <p className="p-4 text-sm text-slate-500">担当者が登録されていません。</p>
        )}
        {staff.map((s) => (
          <div key={s.id} className="flex items-center justify-between p-4">
            <span>{s.name}</span>
            <button
              className="btn-secondary text-rose-600"
              onClick={() => handleDelete(s.id)}
            >
              削除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
