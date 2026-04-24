"use client";

import { useState, useTransition } from "react";
import { clearImports, importEvents } from "./actions";

export function ImportControls({ hasImports }: { hasImports: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const doImport = (days: number) => {
    setMsg(null);
    setErr(null);
    const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();
    startTransition(async () => {
      const res = await importEvents({ sinceIso, limit: 200 });
      if (res.ok) {
        setMsg(
          `imported ${res.eventsImported} events · ${res.signalsImported} signals${res.teamId ? ` (team ${res.teamId})` : ""}`,
        );
      } else {
        setErr(res.error);
      }
    });
  };

  const doClear = () => {
    setMsg(null);
    setErr(null);
    if (!confirm("Delete all imported events and signals? Ratings will survive.")) return;
    startTransition(async () => {
      const res = await clearImports();
      if (res.ok) setMsg(`cleared ${res.cleared} events (ratings kept)`);
    });
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <button
        type="button"
        onClick={() => doImport(7)}
        disabled={isPending}
        className="rounded border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-white hover:bg-neutral-800 disabled:opacity-50 dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        Import last 7d
      </button>
      <button
        type="button"
        onClick={() => doImport(30)}
        disabled={isPending}
        className="rounded border border-neutral-900 px-3 py-1.5 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-100 dark:hover:bg-neutral-900"
      >
        Import last 30d
      </button>
      <button
        type="button"
        onClick={doClear}
        disabled={isPending || !hasImports}
        className="rounded border border-red-300 px-3 py-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
      >
        Clear imports
      </button>
      <span className="ml-2 text-xs text-neutral-500">
        {isPending
          ? "working…"
          : err
            ? <span className="text-red-600">error: {err}</span>
            : msg || <>capped at 200 events per click · ratings persist across clears</>}
      </span>
    </div>
  );
}
