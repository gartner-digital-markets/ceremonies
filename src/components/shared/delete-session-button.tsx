"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

interface DeleteSessionButtonProps {
  readonly kind: "estimation" | "retro";
  readonly id: string;
  readonly label?: string;
}

export function DeleteSessionButton({
  kind,
  id,
  label = "Delete",
}: DeleteSessionButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete this ${kind === "estimation" ? "estimation session" : "retro"}? This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const res = await fetch(
        kind === "estimation" ? `/api/estimation/${id}` : `/api/retros/${id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Delete failed");
      }
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="inline-flex items-center gap-1 rounded-lg border-2 border-destructive/30 bg-destructive/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-destructive transition hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-50"
      title={label}
    >
      <Trash2 size={12} />
      {deleting ? "Deleting" : label}
    </button>
  );
}
