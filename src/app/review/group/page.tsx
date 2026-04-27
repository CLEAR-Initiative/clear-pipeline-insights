import type { Verdict } from "@/db/schema";
import {
  fetchAvailableEnvs,
  fetchGroupCallsForReview,
  fetchGroupPromptVersions,
  fetchGroupReviewCounts,
} from "@/lib/queries";
import { ReviewRow } from "./row";

export const dynamic = "force-dynamic";

type SearchParams = {
  days?: string;
  env?: string | string[];
  show?: string;
  pv?: string;
};

function buildHref(current: SearchParams, overrides: Partial<SearchParams>) {
  const qs = new URLSearchParams();
  const merged = { ...current, ...overrides };
  if (merged.days) qs.set("days", merged.days);
  if (merged.show) qs.set("show", merged.show);
  if (merged.pv) qs.set("pv", merged.pv);
  const envs = Array.isArray(merged.env)
    ? merged.env
    : merged.env
      ? [merged.env]
      : [];
  for (const e of envs) qs.append("env", e);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export default async function ReviewGroupPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const days = Math.max(1, Math.min(90, Number(params.days) || 7));
  const envs = Array.isArray(params.env)
    ? params.env
    : params.env
      ? [params.env]
      : [];
  const showMode = params.show === "all" ? "all" : "unrated";
  const unratedOnly = showMode === "unrated";
  const promptVersion = params.pv?.trim() ? params.pv.trim() : null;
  const windowSeconds = days * 86_400;

  const [availableEnvs, promptVersions, counts, rows] = await Promise.all([
    fetchAvailableEnvs(),
    fetchGroupPromptVersions(windowSeconds),
    fetchGroupReviewCounts({
      envs,
      fromSeconds: windowSeconds,
      promptVersion,
    }),
    fetchGroupCallsForReview({
      envs,
      fromSeconds: windowSeconds,
      unratedOnly,
      promptVersion,
      limit: 50,
    }),
  ]);

  const toggleEnv = (target: string | null) => {
    let next: string[];
    if (target === null) next = [];
    else if (envs.includes(target)) next = envs.filter((e) => e !== target);
    else next = [...envs, target];
    return buildHref(params, { env: next as string[] });
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Call review
        </h1>
        <p className="text-sm text-neutral-500">
          Rate Claude&rsquo;s grouping decisions — last {days} days
          {envs.length > 0 && <> · envs: {envs.join(", ")}</>}
        </p>
      </header>

      <section className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
          Window
        </span>
        {[1, 7, 30].map((d) => {
          const selected = days === d;
          return (
            <a
              key={d}
              href={buildHref(params, { days: String(d) })}
              className={`rounded border px-2 py-1 font-mono text-xs transition-colors ${
                selected
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                  : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
              }`}
            >
              {d}d
            </a>
          );
        })}

        <span className="ml-4 text-xs font-medium uppercase tracking-wider text-neutral-500">
          Show
        </span>
        {(["unrated", "all"] as const).map((m) => {
          const selected = showMode === m;
          return (
            <a
              key={m}
              href={buildHref(params, { show: m })}
              className={`rounded border px-2 py-1 font-mono text-xs transition-colors ${
                selected
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                  : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
              }`}
            >
              {m}
            </a>
          );
        })}

        <span className="ml-4 text-xs font-medium uppercase tracking-wider text-neutral-500">
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
                href={toggleEnv(e)}
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
            href={toggleEnv(null)}
            className="text-xs text-neutral-500 underline hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            clear
          </a>
        )}

        {promptVersions.length > 1 && (
          <>
            <span className="ml-4 text-xs font-medium uppercase tracking-wider text-neutral-500">
              prompt_version
            </span>
            <a
              href={buildHref(params, { pv: "" })}
              className={`rounded border px-2 py-1 font-mono text-xs transition-colors ${
                !promptVersion
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                  : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
              }`}
            >
              any
            </a>
            {promptVersions.map((pv) => {
              const selected = promptVersion === pv;
              return (
                <a
                  key={pv}
                  href={buildHref(params, { pv })}
                  className={`rounded border px-2 py-1 font-mono text-xs transition-colors ${
                    selected
                      ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                      : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
                  }`}
                >
                  {pv}
                </a>
              );
            })}
          </>
        )}
      </section>

      <section className="mb-4 text-sm text-neutral-500">
        <span className="tabular-nums">{counts.unrated}</span> unrated ·{" "}
        <span className="tabular-nums">{counts.total}</span> total group calls ·
        showing {rows.length}
      </section>

      <section className="mb-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
        hotkeys: focus a row (tab/click), then press <kbd>1</kbd>–<kbd>5</kbd>{" "}
        to rate · notes save on blur
      </section>

      <section className="space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center text-sm text-neutral-500 dark:border-neutral-700">
            {counts.total === 0
              ? "No group-stage calls in this window."
              : "All group calls in this window are rated. Switch to ‘all’ to review earlier ratings."}
          </div>
        ) : (
          rows.map((r) => (
            <ReviewRow
              key={r.callId}
              callId={r.callId}
              createdAt={r.createdAt}
              env={r.env}
              promptVersion={r.promptVersion}
              model={r.model}
              signalId={r.signalId}
              eventId={r.eventId}
              parsedResponse={r.parsedResponse}
              parseError={r.parseError}
              userPrompt={r.userPrompt}
              rawResponse={r.rawResponse}
              initialVerdict={r.verdict as Verdict | null}
              initialConfidence={r.confidence}
              initialNotes={r.notes}
            />
          ))
        )}
      </section>
    </main>
  );
}
