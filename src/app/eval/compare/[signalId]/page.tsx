import Link from "next/link";
import { fetchModelDisagreement } from "@/lib/queries";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function fmtCost(v: number | null): string {
  if (v === null) return "—";
  return `$${v.toFixed(4)}`;
}

function fmtMs(v: number | null): string {
  if (v === null) return "—";
  return `${v} ms`;
}

function fmtJson(value: unknown): string {
  if (value === null || value === undefined) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default async function CompareSignalPage({
  params,
}: {
  params: Promise<{ signalId: string }>;
}) {
  await requireSession();
  const { signalId: encoded } = await params;
  const signalId = decodeURIComponent(encoded);
  const { groundTruth, evalSetName, evalSetVersion, rows } =
    await fetchModelDisagreement(signalId);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <Link
          href="/eval"
          className="text-xs text-neutral-500 hover:underline"
        >
          ← all eval runs
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Signal comparison
        </h1>
        <p className="mt-1 break-all font-mono text-xs text-neutral-500">
          signal_id: {signalId}
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          {rows.length} call{rows.length === 1 ? "" : "s"} on this signal
          {rows.length > 0 && (
            <>
              {" · "}
              {new Set(rows.map((r) => r.model)).size} distinct model
              {new Set(rows.map((r) => r.model)).size === 1 ? "" : "s"}
            </>
          )}
        </p>
      </header>

      {groundTruth !== null && (
        <section className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-900 dark:text-emerald-200">
            Ground truth
            {evalSetName && (
              <span className="ml-2 font-mono font-normal text-emerald-800 dark:text-emerald-300">
                {evalSetName}@{evalSetVersion}
              </span>
            )}
          </h2>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-emerald-950 dark:text-emerald-100">
            {fmtJson(groundTruth)}
          </pre>
        </section>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center text-sm text-neutral-500 dark:border-neutral-700">
          No llm_call rows found for this signal.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rows.map((r) => (
            <article
              key={r.callId}
              className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <header className="mb-3 flex items-baseline justify-between gap-2">
                <h3 className="font-mono text-sm font-semibold">{r.model}</h3>
                <span className="font-mono text-[10px] text-neutral-500">
                  {r.env}
                </span>
              </header>
              <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                <dt className="text-neutral-500">Stage</dt>
                <dd className="font-mono">{r.stage}</dd>
                <dt className="text-neutral-500">Prompt v.</dt>
                <dd className="break-all font-mono">{r.promptVersion}</dd>
                <dt className="text-neutral-500">Latency</dt>
                <dd className="font-mono tabular-nums">{fmtMs(r.latencyMs)}</dd>
                <dt className="text-neutral-500">Cost</dt>
                <dd className="font-mono tabular-nums">{fmtCost(r.costUsd)}</dd>
                <dt className="text-neutral-500">Run</dt>
                <dd className="break-all">
                  <Link
                    href={`/eval/runs/${r.runId}`}
                    className="font-mono text-[10px] text-neutral-500 hover:underline"
                  >
                    {r.runName.length > 30
                      ? `${r.runName.slice(0, 30)}…`
                      : r.runName}
                  </Link>
                </dd>
              </dl>
              {r.parseError && (
                <div className="mb-2 rounded bg-amber-100 px-2 py-1 font-mono text-[11px] text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  parse error: {r.parseError}
                </div>
              )}
              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-neutral-50 p-2 font-mono text-[11px] leading-tight text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                {fmtJson(r.parsedResponse)}
              </pre>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
