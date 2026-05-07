import Link from "next/link";
import { fetchEvalRuns } from "@/lib/queries";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

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
  return `${Math.round(v)} ms`;
}

export default async function EvalRunsPage() {
  await requireSession();
  const runs = await fetchEvalRuns();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Eval runs</h1>
        <p className="text-sm text-neutral-500">
          {runs.length} offline-eval run{runs.length === 1 ? "" : "s"} ·{" "}
          all pipeline_run rows where env=&apos;offline-eval&apos;
        </p>
      </header>

      {runs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center text-sm text-neutral-500 dark:border-neutral-700">
          No eval runs yet. Use{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-900">
            npm run run-eval
          </code>{" "}
          or{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-900">
            npm run seed-eval
          </code>{" "}
          to populate.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2 font-medium">Run</th>
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 font-medium">Eval set</th>
                <th className="px-3 py-2 font-medium">Stage</th>
                <th className="px-3 py-2 text-right font-medium">Calls</th>
                <th className="px-3 py-2 text-right font-medium">Errors</th>
                <th className="px-3 py-2 text-right font-medium">Cost</th>
                <th className="px-3 py-2 text-right font-medium">Avg latency</th>
                <th className="px-3 py-2 font-medium">Started</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const status = r.endedAt ? "closed" : "open";
                return (
                  <tr
                    key={r.id}
                    className="border-t border-neutral-200 align-top dark:border-neutral-800"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/eval/runs/${r.id}`}
                        className="font-mono text-xs text-neutral-900 hover:underline dark:text-neutral-100"
                      >
                        {r.name.length > 60
                          ? `${r.name.slice(0, 60)}…`
                          : r.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.modelId ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.evalSetName ?? "—"}
                      {r.evalSetVersion && (
                        <span className="text-neutral-500">
                          @{r.evalSetVersion}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.evalSetStage ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {r.callCount}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {r.parseErrorCount > 0 ? (
                        <span className="text-amber-700 dark:text-amber-400">
                          {r.parseErrorCount}
                        </span>
                      ) : (
                        <span className="text-neutral-400">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-xs">
                      {fmtCost(r.totalCostUsd)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-xs">
                      {fmtMs(r.avgLatencyMs)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-neutral-500">
                      {fmtTimestamp(r.startedAt)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      <span
                        className={
                          status === "closed"
                            ? "rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                            : "rounded bg-amber-100 px-1.5 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                        }
                      >
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
