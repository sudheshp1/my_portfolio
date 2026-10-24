"use client";

import { useState, type FormEvent } from "react";

import { formatDate, importCas, type CasImportResult } from "@/lib/api";

/** Upload form for a CAMS/KFintech CAS PDF. The password is sent once to open the PDF and not kept. */
export default function CasImport() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CasImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await importCas(file, password));
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem_auto]">
        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="min-w-0 text-sm file:mr-3 file:rounded-lg file:border file:border-zinc-300 file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:font-medium dark:file:border-zinc-700"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="PDF password"
          autoComplete="off"
          className="rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
        />
        <button
          type="submit"
          disabled={!file || busy}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {busy ? "Reading PDF…" : "Import CAS"}
        </button>
      </div>

      {error && <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p>}
      {result && (
        <div className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-800/50">
          <p>
            Imported <strong>{result.schemes}</strong> fund{result.schemes === 1 ? "" : "s"} and{" "}
            <strong>{result.transactions}</strong> transaction{result.transactions === 1 ? "" : "s"}
            {result.duplicates > 0 && ` (${result.duplicates} already imported)`} from the{" "}
            {result.cas_type.toLowerCase()} statement for {result.statement_period}.
          </p>
          {result.nav?.nav_date && (
            <p className="mt-1 text-zinc-500">Values updated to AMFI NAVs of {formatDate(result.nav.nav_date)}.</p>
          )}
          {result.warnings.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-amber-700 dark:text-amber-400">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
