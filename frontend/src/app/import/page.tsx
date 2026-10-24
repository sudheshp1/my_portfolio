import Link from "next/link";
import type { ReactNode } from "react";

import CasImport from "@/components/CasImport";
import TradebookImport from "@/components/TradebookImport";

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="font-medium">{title}</h2>
      <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function ImportPage() {
  return (
    <main className="mx-auto w-full min-w-0 max-w-3xl flex-1 space-y-6 px-4 py-8 sm:px-6">
      <div>
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Import</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Files are read on your computer by the local backend and aren&apos;t uploaded anywhere else.
        </p>
      </div>

      <Section
        title="Mutual funds from any platform (CAS PDF)"
        subtitle="Adds funds held outside Zerodha — via AMCs, Groww, Kuvera, banks, distributors."
      >
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
          <li>
            Request a <strong>consolidated account statement (CAS – CAMS+KFintech)</strong> from camsonline.com
            (Statements section) or kfintech.com.
          </li>
          <li>
            Choose <strong>Detailed</strong> (includes transactions, needed for XIRR), period{" "}
            <strong>Specific period</strong> from your first investment to today, and set a password.
          </li>
          <li>The PDF arrives by email in a few minutes. Upload it here with that password.</li>
        </ol>
        <CasImport />
        <p className="mt-3 text-xs text-zinc-500">
          Re-import a newer CAS any time — holdings are replaced with the latest snapshot and transactions are
          deduplicated. Values are refreshed daily from AMFI NAVs. Depository (NSDL/CDSL) statements aren&apos;t
          supported yet.
        </p>
      </Section>

      <Section
        title="Zerodha trade history (tradebook CSV)"
        subtitle="Buys and sells for your Zerodha stocks and Coin funds, used for transactions and XIRR."
      >
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
          <li>Open console.zerodha.com → Reports → Tradebook.</li>
          <li>Pick the segment (Equity, or Mutual funds) and a date range covering your purchases.</li>
          <li>Download the CSV and import it here. Repeat per year if needed — duplicates are skipped.</li>
        </ol>
        <TradebookImport align="start" />
      </Section>
    </main>
  );
}
