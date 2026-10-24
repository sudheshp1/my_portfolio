"use client";

import { useRef, useState } from "react";

import { importTradebook } from "@/lib/api";

/** Upload button for a Zerodha Console tradebook CSV. Reports the outcome inline. */
export default function TradebookImport({ onImported }: { onImported?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await importTradebook(file);
      const parts = [`Imported ${r.imported} trade${r.imported === 1 ? "" : "s"}`];
      if (r.duplicates) parts.push(`${r.duplicates} already imported`);
      if (r.skipped_segments) parts.push(`${r.skipped_segments} F&O/other rows skipped`);
      if (r.errors.length) parts.push(`problems: ${r.errors.join("; ")}`);
      setMessage({ text: parts.join(" · "), ok: r.errors.length === 0 });
      onImported?.();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Import failed", ok: false });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {busy ? "Importing…" : "Import tradebook"}
      </button>
      {message && (
        <p className={`max-w-sm text-right text-xs ${message.ok ? "text-zinc-500" : "text-amber-700 dark:text-amber-400"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
