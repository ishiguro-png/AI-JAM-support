"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ContractStatusEditor({
  contractId,
  status,
}: {
  contractId: string;
  status: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [saving, setSaving] = useState(false);

  async function handleChange(newStatus: string) {
    setValue(newStatus);
    setSaving(true);
    try {
      await fetch(`/api/contracts/${contractId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      className="input w-40"
      value={value}
      disabled={saving}
      onChange={(e) => handleChange(e.target.value)}
    >
      <option value="active">稼働中</option>
      <option value="paused">一時停止</option>
      <option value="cancelled">解約</option>
    </select>
  );
}
