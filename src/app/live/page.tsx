import Link from "next/link";
import { fmtSignedUsd, fmtUsd, summarizeCache } from "@/lib/dashboard";
import { MODEL_PRICES } from "@/lib/prices";
import {
  fetchAvailableEnvs,
  fetchCacheStats,
  fetchHeroStat,
  fetchLatencyByStage,
  fetchModelsSeen,
  fetchParseErrorRate,
  fetchTopRuns,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const WINDOW_SECONDS = 3600;
const REFRESH_SECONDS = 30;

function buildEnvHref(envs: string[], toggle: string | null): string {
  let next: string[];
  if (toggle === null) {
    next = [];
  } else if (envs.includes(toggle)) {
    next = envs.filter((e) => e !== toggle);
  } else {
    next = [...envs, toggle];
  }
  const qs = new URLSearchParams();
  for (const e of next) qs.append("env", e);
  const s = qs.toString();
  return s.length > 0 ? `?${s}` : "/live";
}

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ env?: string | string[] }>;
}) {
  const params = await searchParams;
  const envs = Array.isArray(params.env)
    ? params.env
    : params.env
      ? [params.env]
      : [];

  const [
    availableEnvs,
    hero,
    topRuns,
    models,
    parseErrors,
    latency,
    cacheRaw,
  ] = await Promise.all([
    fetchAvailableEnvs(),
    fetchHeroStat(WINDOW_SECONDS, envs),
    fetchTopRuns(WINDOW_SECONDS, 20, envs),
    fetchModelsSeen(WINDOW_SECONDS, envs),
    fetchParseErrorRate(WINDOW_SECONDS, envs),
    fetchLatencyByStage(WINDOW_SECONDS, envs),
    fetchCacheStats(WINDOW_SECONDS, envs),
  ]);
  const cache = summarizeCache(cacheRaw);

  const pct =
    hero.prior > 0 ? ((hero.current - hero.prior) / hero.prior) * 100 : null;

  return (
    <>
      <meta httpEquiv="refresh" content={String(REFRESH_SECONDS)} />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-8 flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Live — last 60 minutes
              <span className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-red-500 align-middle" />
            </h1>
            <p className="text-sm text-neutral-500">
              Auto-refresh every {REFRESH_SECONDS}s · rendered at{" "}
              {new Date().toISOString().replace("T", " ").slice(0, 19)}Z
              {envs.length > 0 && <> · envs: {envs.join(", ")}</>}
            </p>
          </div>
          <nav className="text-sm text-neutral-500">
            <Link className="hover:text-neutral-900" href="/">
              ← dashboard
            </Link>
          </nav>
        </header>

        <section className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
            Env
          </span>
          {availableEnvs.length === 0 ? (
            <span className="text-neutral-500">no runs yet</span>
          ) : (
            availableEnvs.map((e) => {
              const selected = envs.includes(e);
              return (
                <a
                  key={e}
                  href={buildEnvHref(envs, e)}
                  className={`rounded border px-2 py-1 font-mono text-xs transition-colors ${
                    selected
                      ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                      : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
                  }`}
                >
                  <span className="mr-1">{selected ? "✓" : " "}</span>
                  {e}
                </a>
              );
            })
          )}
          {envs.length > 0 && (
            <a
              href={buildEnvHref(envs, null)}
              className="text-xs text-neutral-500 underline hover:text-neutral-900"
            >
              clear
            </a>
          )}
        </section>

        <section className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Spend — last 60 min
            </div>
            <div className="mt-1 flex items-baseline gap-4">
              <div className="text-4xl font-semibold tabular-nums">
                ${hero.current.toFixed(2)}
              </div>
              <div
                className={`text-sm tabular-nums ${
                  hero.delta > 0
                    ? "text-red-600"
                    : hero.delta < 0
                      ? "text-green-600"
                      : "text-neutral-500"
                }`}
              >
                {fmtSignedUsd(hero.delta)}
                {pct !== null && <> ({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)</>}
                <span className="text-neutral-500"> vs prior 60 min</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Prompt caching — last 60 min
            </div>
            <div className="mt-1 flex items-baseline gap-4">
              <div className="text-4xl font-semibold tabular-nums">
                {cache.hitRatio === null
                  ? "—"
                  : `${(cache.hitRatio * 100).toFixed(1)}%`}
              </div>
              <div className="text-sm tabular-nums text-green-700">
                ~${cache.savings.toFixed(2)} saved
              </div>
            </div>
            <div className="mt-2 text-xs text-neutral-500 tabular-nums">
              {cache.cacheRead.toLocaleString()} read ·{" "}
              {cache.cacheCreate.toLocaleString()} created
            </div>
          </div>
        </section>

        <section className="mb-10 rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <h2 className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold dark:border-neutral-800">
            Parse error rate by stage
            <span className="ml-2 font-normal text-neutral-500">
              last 60 min · red when &gt; 1%
            </span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Stage</th>
                  <th className="px-4 py-2 text-right font-medium">Errors</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                  <th className="px-4 py-2 text-right font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {parseErrors.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-neutral-500"
                    >
                      —
                    </td>
                  </tr>
                ) : (
                  parseErrors.map((p) => {
                    const hot = p.rate > 0.01;
                    return (
                      <tr
                        key={p.stage}
                        className="border-t border-neutral-100 dark:border-neutral-900"
                      >
                        <td className="px-4 py-2 font-mono text-xs">{p.stage}</td>
                        <td
                          className={`px-4 py-2 text-right tabular-nums ${hot ? "font-medium text-red-600" : ""}`}
                        >
                          {p.errors.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {p.total.toLocaleString()}
                        </td>
                        <td
                          className={`px-4 py-2 text-right tabular-nums ${hot ? "font-medium text-red-600" : ""}`}
                        >
                          {(p.rate * 100).toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10 rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <h2 className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold dark:border-neutral-800">
            Latency by stage
            <span className="ml-2 font-normal text-neutral-500">
              ms · red when p95 &gt; 5000
            </span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Stage</th>
                  <th className="px-4 py-2 text-right font-medium">Calls</th>
                  <th className="px-4 py-2 text-right font-medium">p50 ms</th>
                  <th className="px-4 py-2 text-right font-medium">p95 ms</th>
                  <th className="px-4 py-2 text-right font-medium">p99 ms</th>
                </tr>
              </thead>
              <tbody>
                {latency.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-neutral-500"
                    >
                      —
                    </td>
                  </tr>
                ) : (
                  latency.map((l) => {
                    const hot = (l.p95 ?? 0) > 5000;
                    return (
                      <tr
                        key={l.stage}
                        className="border-t border-neutral-100 dark:border-neutral-900"
                      >
                        <td className="px-4 py-2 font-mono text-xs">{l.stage}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {l.calls.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {l.p50 === null ? "—" : l.p50.toLocaleString()}
                        </td>
                        <td
                          className={`px-4 py-2 text-right tabular-nums ${hot ? "font-medium text-red-600" : ""}`}
                        >
                          {l.p95 === null ? "—" : l.p95.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {l.p99 === null ? "—" : l.p99.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10 rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <h2 className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold dark:border-neutral-800">
            Runs active in the last 60 min
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Env</th>
                  <th className="px-4 py-2 font-medium">Model</th>
                  <th className="px-4 py-2 text-right font-medium">Calls</th>
                  <th className="px-4 py-2 text-right font-medium">Cost</th>
                  <th className="px-4 py-2 font-medium">Started</th>
                </tr>
              </thead>
              <tbody>
                {topRuns.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center text-neutral-500"
                    >
                      No runs in this range.
                    </td>
                  </tr>
                ) : (
                  topRuns.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-neutral-100 dark:border-neutral-900"
                    >
                      <td className="px-4 py-2 font-mono">{r.name}</td>
                      <td className="px-4 py-2">{r.env}</td>
                      <td className="px-4 py-2 font-mono text-xs">{r.model}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {r.calls.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {fmtUsd(r.cost)}
                      </td>
                      <td className="px-4 py-2 text-xs text-neutral-500">
                        {new Date(r.startedAt)
                          .toISOString()
                          .replace("T", " ")
                          .slice(0, 16)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <h2 className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold dark:border-neutral-800">
            Models seen
            <span className="ml-2 font-normal text-neutral-500">
              rows flagged if the model is missing from{" "}
              <code>src/lib/prices.ts</code>
            </span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Model</th>
                  <th className="px-4 py-2 text-right font-medium">Calls</th>
                  <th className="px-4 py-2 text-right font-medium">Cost</th>
                  <th className="px-4 py-2 font-medium">Priced?</th>
                </tr>
              </thead>
              <tbody>
                {models.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-neutral-500"
                    >
                      No calls in this range.
                    </td>
                  </tr>
                ) : (
                  models.map((m) => {
                    const priced = m.model in MODEL_PRICES;
                    return (
                      <tr
                        key={m.model}
                        className="border-t border-neutral-100 dark:border-neutral-900"
                      >
                        <td className="px-4 py-2 font-mono text-xs">{m.model}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {m.calls.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {fmtUsd(m.cost)}
                        </td>
                        <td className="px-4 py-2">
                          {priced ? (
                            <span className="text-green-700">yes</span>
                          ) : (
                            <span className="font-medium text-red-600">
                              no — add to prices.ts
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
