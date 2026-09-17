"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import { useRouter } from "next/navigation";

type FieldKey =
  | "companyName"
  | "accountCount"
  | "contactName"
  | "contactEmail"
  | "phone"
  | "status"
  | "externalId"
  | "notes";

const FIELDS: { key: FieldKey; label: string; required?: boolean }[] = [
  { key: "companyName", label: "会社名", required: true },
  { key: "accountCount", label: "アカウント数", required: true },
  { key: "contactName", label: "担当者名" },
  { key: "contactEmail", label: "メールアドレス" },
  { key: "phone", label: "電話番号" },
  { key: "status", label: "ステータス" },
  { key: "externalId", label: "契約ID（torimato側の一意キー）" },
  { key: "notes", label: "備考" },
];

const GUESS: Record<FieldKey, string[]> = {
  companyName: ["会社名", "契約先名", "顧客名", "企業名", "会社", "company", "name"],
  accountCount: ["アカウント数", "アカウント", "ユーザー数", "ID数", "account", "accounts", "seats"],
  contactName: ["担当者", "担当者名", "ご担当者", "contact"],
  contactEmail: ["メールアドレス", "メール", "email", "mail"],
  phone: ["電話番号", "電話", "tel", "phone"],
  status: ["ステータス", "状態", "status"],
  externalId: ["契約ID", "id", "契約番号"],
  notes: ["備考", "メモ", "note", "notes"],
};

function guessMapping(headers: string[]) {
  const mapping: Partial<Record<FieldKey, string>> = {};
  for (const field of FIELDS) {
    const hit = headers.find((h) =>
      GUESS[field.key].some((g) => h.toLowerCase().includes(g.toLowerCase()))
    );
    if (hit) mapping[field.key] = hit;
  }
  return mapping;
}

export default function ImportPage() {
  const router = useRouter();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, string>>>({});
  const [fileName, setFileName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    errors: { row: number; message: string }[];
  } | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const hdrs = res.meta.fields || [];
        setHeaders(hdrs);
        setRows(res.data);
        setMapping(guessMapping(hdrs));
      },
    });
  }

  const mappedRows = useMemo(() => {
    return rows.map((row) => {
      const out: Record<string, string> = {};
      for (const field of FIELDS) {
        const col = mapping[field.key];
        out[field.key] = col ? row[col] ?? "" : "";
      }
      return out;
    });
  }, [rows, mapping]);

  const canSubmit =
    rows.length > 0 && !!mapping.companyName && !!mapping.accountCount && !submitting;

  async function handleImport() {
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/contracts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: mappedRows }),
      });
      const data = await res.json();
      setResult(data);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">CSVインポート</h1>
      <p className="text-sm text-slate-500">
        torimato（admin.torimato.jp）からエクスポートしたCSVをアップロードし、
        列をこのシステムの項目に割り当てて取り込みます。会社名が既存契約と一致する場合は上書き更新されます。
      </p>

      <div className="card space-y-4 p-4">
        <div>
          <label className="label">CSVファイル</label>
          <input type="file" accept=".csv" onChange={handleFile} className="input" />
          {fileName && (
            <p className="mt-1 text-xs text-slate-500">
              {fileName}（{rows.length}件検出）
            </p>
          )}
        </div>

        {headers.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <div key={field.key}>
                <label className="label">
                  {field.label}
                  {field.required && <span className="text-rose-600"> *</span>}
                </label>
                <select
                  className="input"
                  value={mapping[field.key] || ""}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [field.key]: e.target.value || undefined }))
                  }
                >
                  <option value="">（マッピングしない）</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {mappedRows.length > 0 && (
          <div>
            <div className="label">プレビュー（先頭5件）</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 text-left">
                  <tr>
                    {FIELDS.map((f) => (
                      <th key={f.key} className="px-2 py-1">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mappedRows.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      {FIELDS.map((f) => (
                        <td key={f.key} className="px-2 py-1">
                          {r[f.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <button className="btn" disabled={!canSubmit} onClick={handleImport}>
          {submitting ? "取り込み中..." : `${rows.length}件を取り込む`}
        </button>

        {result && (
          <div className="rounded-md bg-slate-50 p-3 text-sm">
            <p>
              新規登録: {result.created}件 / 更新: {result.updated}件
              {result.errors.length > 0 && ` / エラー: ${result.errors.length}件`}
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-rose-600">
                {result.errors.map((err, i) => (
                  <li key={i}>
                    {err.row}行目: {err.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
