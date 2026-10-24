import { Suspense } from "react";

import HoldingView from "@/components/HoldingView";

// Not async: the id is read inside the Suspense boundary so the page shell can still be prerendered
export default function HoldingPage({ params }: PageProps<"/holdings/[id]">) {
  return (
    <Suspense
      fallback={<main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 text-sm text-zinc-500 sm:px-6">Loading…</main>}
    >
      <HoldingView params={params} />
    </Suspense>
  );
}
