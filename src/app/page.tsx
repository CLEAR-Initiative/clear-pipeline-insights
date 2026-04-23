import Link from "next/link";
import { fmtSignedUsd, fmtUsd, pivot, summarizeCache } from "@/lib/dashboard";
import { MODEL_PRICES } from "@/lib/prices";
import {
  fetchAvailableEnvs,
  fetchCacheStats,
  fetchDailyByEnv,
  fetchDailyByStage,
  fetchHeroStat,
  fetchLatencyByStage,
  fetchModelsSeen,
  fetchParseErrorRate,
  fetchTopRuns,
} from "@/lib/queries";
import { StackedBar } from "./stacked-bar";

export const dynamic = "force-dynamic";

function buildEnvHref(
  days: number,
  envs: string[],
  toggle: string | null,
): string {
  let next: string[];
  if (toggle === null) {
    next = [];
  } else if (envs.includes(toggle)) {
    next = envs.filter((e) => e !== toggle);
  } else {
    next = [...envs, toggle];
  }
  const qs = new URLSearchParams();
  qs.set("days", String(days));
  for (const e of next) qs.append("env", e);
  return `?${qs.toString()}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; env?: string | string[] }>;
}) {
  const params = await searchParams;
  const days = Math.max(1, Math.min(365, Number(params.days) || 30));
  const envs = Array.isArray(params.env)
    ? params.env
    : params.env
      ? [params.env]
      : [];

  const windowSeconds = days * 86_400;
  const [
    availableEnvs,
    hero,
    dailyEnvRaw,
    dailyStageRaw,
    topRuns,
    models,
    parseErrors,
    latency,
    cacheRaw,
  ] = await Promise.all([
    fetchAvailableEnvs(),
    fetchHeroStat(86_400, envs),
    fetchDailyByEnv(windowSeconds, envs),
    fetchDailyByStage(windowSeconds, envs),
    fetchTopRuns(windowSeconds, 20, envs),
    fetchModelsSeen(windowSeconds, envs),
    fetchParseErrorRate(windowSeconds, envs),
    fetchLatencyByStage(windowSeconds, envs),
    fetchCacheStats(windowSeconds, envs),
  ]);
  const cache = summarizeCache(cacheRaw);

  const byEnv = pivot(dailyEnvRaw);
  const byStage = pivot(dailyStageRaw);

  const pct =
    hero.prior > 0 ? ((hero.current - hero.prior) / hero.prior) * 100 : null;

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Pipeline Insights
          </h1>
          <p className="text-sm text-neutral-500">
            LLM call cost & volume — last {days} days
            {envs.length > 0 && <> · envs: {envs.join(", ")}</>}
          </p>
        </div>
        <nav className="text-sm text-neutral-500">
          <a
            className="hover:text-neutral-900"
            href={(() => {
              const qs = new URLSearchParams();
              qs.set("days", "7");
              for (const e of envs) qs.append("env", e);
              return `?${qs.toString()}`;
            })()}
          >
            7d
          </a>
          {" · "}
          <a
            className="hover:text-neutral-900"
            href={(() => {
              const qs = new URLSearchParams();
              qs.set("days", "30");
              for (const e of envs) qs.append("env", e);
              return `?${qs.toString()}`;
            })()}
          >
            30d
          </a>
          {" · "}
          <a
            className="hover:text-neutral-900"
            href={(() => {
              const qs = new URLSearchParams();
              qs.set("days", "90");
              for (const e of envs) qs.append("env", e);
              return `?${qs.toString()}`;
            })()}
          >
            90d
          </a>
          {" · "}
          <Link className="hover:text-neutral-900" href="/live">
            live →
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
                href={buildEnvHref(days, envs, e)}
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
            href={buildEnvHref(days, envs, null)}
            className="text-xs text-neutral-500 underline hover:text-neutral-900"
          >
            clear
          </a>
        )}
      </section>

      <section className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
            Spend — last 24h
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
              <span className="text-neutral-500"> vs prior 24h</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
            Prompt caching — last {days}d
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
            last {days} days · red when &gt; 1%
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

      <section className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
          <h2 className="mb-3 text-sm font-semibold">$/day by env</h2>
          <StackedBar data={byEnv.data} keys={byEnv.keys} />
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
          <h2 className="mb-3 text-sm font-semibold">$/day by stage</h2>
          <StackedBar data={byStage.data} keys={byStage.keys} />
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
          Top 20 runs by spend
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
                      {new Date(r.startedAt).toISOString().replace("T", " ").slice(0, 16)}
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
            rows flagged if the model is missing from <code>src/lib/prices.ts</code>
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
  );
}
