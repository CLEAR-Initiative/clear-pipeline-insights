import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchEvalRunDetail } from "@/lib/queries";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtTimestamp(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

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
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default async function EvalRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const run = await fetchEvalRunDetail(id);
  if (!run) notFound();

  const parseErrorCount = run.calls.filter((c) => c.parseError !== null).length;
  const totalCost = run.calls.reduce(
    (acc, c) => (c.costUsd === null ? acc : acc + c.costUsd),
    0,
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <Link
          href="/eval"
          className="text-xs text-neutral-500 hover:underline"
        >
          ← all eval runs
        </Link>
        <h1 className="mt-2 break-all font-mono text-lg font-semibold tracking-tight">
          {run.name}
        </h1>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <dt className="text-neutral-500">Model</dt>
          <dd className="font-mono text-xs">{run.modelId ?? "—"}</dd>
          <dt className="text-neutral-500">Eval set</dt>
          <dd className="font-mono text-xs">
            {run.evalSetName ? `${run.evalSetName}@${run.evalSetVersion}` : "—"}
          </dd>
          <dt className="text-neutral-500">Stage</dt>
          <dd className="font-mono text-xs">{run.evalSetStage ?? "—"}</dd>
          <dt className="text-neutral-500">Env</dt>
          <dd className="font-mono text-xs">{run.env}</dd>
          <dt className="text-neutral-500">Started</dt>
          <dd className="font-mono text-xs">{fmtTimestamp(run.startedAt)}</dd>
          <dt className="text-neutral-500">Ended</dt>
          <dd className="font-mono text-xs">
            {run.endedAt ? fmtTimestamp(run.endedAt) : (
              <span className="text-amber-700 dark:text-amber-400">
                (open)
              </span>
            )}
          </dd>
          <dt className="text-neutral-500">Git SHA</dt>
          <dd className="font-mono text-xs">{run.gitSha ?? "—"}</dd>
          <dt className="text-neutral-500">Calls</dt>
          <dd className="font-mono text-xs tabular-nums">
            {run.calls.length}
            {parseErrorCount > 0 && (
              <span className="ml-2 text-amber-700 dark:text-amber-400">
                ({parseErrorCount} parse error{parseErrorCount === 1 ? "" : "s"})
              </span>
            )}
          </dd>
          <dt className="text-neutral-500">Total cost</dt>
          <dd className="font-mono text-xs tabular-nums">
            {totalCost > 0 ? `$${totalCost.toFixed(4)}` : "—"}
          </dd>
        </dl>
        {run.description && (
          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
            {run.description}
          </p>
        )}
      </header>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">
        Calls
      </h2>
      {run.calls.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center text-sm text-neutral-500 dark:border-neutral-700">
          No calls in this run.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2 font-medium">Signal</th>
                <th className="px-3 py-2 font-medium">Output</th>
                <th className="px-3 py-2 text-right font-medium">Latency</th>
                <th className="px-3 py-2 text-right font-medium">Cost</th>
                <th className="px-3 py-2 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {run.calls.map((c) => (
                <tr
                  key={c.callId}
                  className="border-t border-neutral-200 align-top dark:border-neutral-800"
                >
                  <td className="px-3 py-2 font-mono text-xs">
                    {c.signalId ? (
                      <Link
                        href={`/eval/compare/${encodeURIComponent(c.signalId)}`}
                        className="text-neutral-900 hover:underline dark:text-neutral-100"
                      >
                        {c.signalId.length > 24
                          ? `${c.signalId.slice(0, 24)}…`
                          : c.signalId}
                      </Link>
                    ) : (
                      <span className="text-neutral-400">(synthetic)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    <pre className="max-w-md whitespace-pre-wrap break-all text-[11px] leading-tight text-neutral-700 dark:text-neutral-300">
                      {fmtJson(c.parsedResponse)}
                    </pre>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-xs">
                    {fmtMs(c.latencyMs)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-xs">
                    {fmtCost(c.costUsd)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {c.parseError ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                        {c.parseError.length > 40
                          ? `${c.parseError.slice(0, 40)}…`
                          : c.parseError}
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
