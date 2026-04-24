import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { eventRating, importedEvent } from "@/db/schema";

export const dynamic = "force-dynamic";

const EVENT_VERDICTS = [
  "coherent",
  "should_split",
  "should_merge",
  "should_dissolve",
  "unclear",
] as const;

type SearchParams = {
  verdict?: string;
  days?: string;
};

function buildHref(
  rater: string,
  current: SearchParams,
  overrides: Partial<SearchParams>,
): string {
  const merged = { ...current, ...overrides };
  const qs = new URLSearchParams();
  if (merged.verdict) qs.set("verdict", merged.verdict);
  if (merged.days) qs.set("days", merged.days);
  const s = qs.toString();
  return `/review/ratings/${encodeURIComponent(rater)}${s ? `?${s}` : ""}`;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toISOString().slice(0, 10);
}

export default async function ReviewerRatingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ rater: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { rater: raterParam } = await params;
  const rater = decodeURIComponent(raterParam);
  const sp = await searchParams;

  const daysParsed =
    sp.days === "all" ? null : Math.max(1, Math.min(365, Number(sp.days) || 90));
  const verdict = sp.verdict?.trim() || null;

  const conditions = [eq(eventRating.rater, rater)];
  if (verdict) conditions.push(eq(eventRating.verdict, verdict));
  if (daysParsed !== null) {
    const windowSeconds = daysParsed * 86_400;
    conditions.push(
      sql`${eventRating.createdAt} >= now() - (${windowSeconds}::int * interval '1 second')`,
    );
  }

  const [rows, counts] = await Promise.all([
    db()
      .select({
        ratingId: eventRating.id,
        eventId: eventRating.eventId,
        verdict: eventRating.verdict,
        notes: eventRating.notes,
        ratedAt: eventRating.createdAt,
        title: importedEvent.title,
        types: importedEvent.types,
        rank: importedEvent.rank,
        validFrom: importedEvent.validFrom,
      })
      .from(eventRating)
      .leftJoin(importedEvent, eq(importedEvent.id, eventRating.eventId))
      .where(and(...conditions))
      .orderBy(desc(eventRating.createdAt))
      .limit(500),
    db()
      .select({
        verdict: eventRating.verdict,
        count: sql<number>`count(*)::int`,
      })
      .from(eventRating)
      .where(eq(eventRating.rater, rater))
      .groupBy(eventRating.verdict),
  ]);

  const totalForRater = counts.reduce((a, c) => a + c.count, 0);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Ratings by <span className="font-mono">{rater}</span>
          </h1>
          <p className="text-sm text-neutral-500">
            {totalForRater} event{totalForRater === 1 ? "" : "s"} rated total
            {daysParsed !== null && <> · last {daysParsed} days shown</>}
            {verdict && <> · verdict: {verdict}</>}
          </p>
        </div>
        <nav className="text-sm text-neutral-500">
          <Link href="/" className="hover:text-neutral-900">
            ← dashboard
          </Link>
          <span className="mx-2">·</span>
          <Link href="/review/events" className="hover:text-neutral-900">
            cluster review
          </Link>
          <span className="mx-2">·</span>
          <Link href="/review/ratings/aggregate" className="hover:text-neutral-900">
            all reviewers
          </Link>
        </nav>
      </header>

      <section className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
          Window
        </span>
        {[7, 30, 90].map((d) => {
          const selected = daysParsed === d;
          return (
            <a
              key={d}
              href={buildHref(rater, sp, { days: String(d) })}
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
        <a
          href={buildHref(rater, sp, { days: "all" })}
          className={`rounded border px-2 py-1 font-mono text-xs transition-colors ${
            daysParsed === null
              ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
              : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
          }`}
        >
          all
        </a>

        <span className="ml-4 text-xs font-medium uppercase tracking-wider text-neutral-500">
          Verdict
        </span>
        <a
          href={buildHref(rater, sp, { verdict: "" })}
          className={`rounded border px-2 py-1 font-mono text-xs transition-colors ${
            !verdict
              ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
              : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
          }`}
        >
          any
        </a>
        {EVENT_VERDICTS.map((v) => {
          const selected = verdict === v;
          const count = counts.find((c) => c.verdict === v)?.count ?? 0;
          return (
            <a
              key={v}
              href={buildHref(rater, sp, { verdict: v })}
              className={`rounded border px-2 py-1 font-mono text-xs transition-colors ${
                selected
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                  : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
              }`}
            >
              {v} ({count})
            </a>
          );
        })}
      </section>

      <section className="mb-4 text-sm text-neutral-500">
        showing <span className="tabular-nums">{rows.length}</span>{" "}
        rating{rows.length === 1 ? "" : "s"}
        {rows.length === 500 && <> (capped at 500)</>}
      </section>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center text-sm text-neutral-500 dark:border-neutral-700">
          No ratings match these filters.
        </div>
      ) : (
        <section className="space-y-2">
          {rows.map((r) => (
            <article
              key={r.ratingId}
              className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950"
            >
              <div className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="text-base font-medium text-neutral-900 dark:text-neutral-100">
                  {r.title ?? (
                    <em className="text-neutral-500">event cleared from import</em>
                  )}
                </span>
                {(r.types ?? []).map((t) => (
                  <span
                    key={t}
                    className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                  >
                    {t}
                  </span>
                ))}
                <span className="ml-auto rounded border border-neutral-900 bg-neutral-900 px-2 py-0.5 font-mono text-xs text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900">
                  {r.verdict}
                </span>
              </div>

              <div className="mt-1 text-xs text-neutral-500">
                rated {fmtDate(r.ratedAt)} · event{" "}
                <span className="font-mono">{r.eventId.slice(0, 10)}</span>
                {r.validFrom && <> · event date {fmtDate(r.validFrom)}</>}
                {r.rank !== null && r.rank !== undefined && (
                  <> · rank {r.rank.toFixed(2)}</>
                )}
              </div>

              {r.notes && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">
                  {r.notes}
                </p>
              )}

              <div className="mt-2">
                <Link
                  href="/review/events"
                  className="font-mono text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  open in cluster review →
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
