import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { eventRating, importedEvent } from "@/db/schema";

export const dynamic = "force-dynamic";

type SearchParams = {
  only?: string;
  min?: string;
  days?: string;
};

function buildHref(
  current: SearchParams,
  overrides: Partial<SearchParams>,
): string {
  const merged = { ...current, ...overrides };
  const qs = new URLSearchParams();
  if (merged.only) qs.set("only", merged.only);
  if (merged.min) qs.set("min", merged.min);
  if (merged.days) qs.set("days", merged.days);
  const s = qs.toString();
  return `/review/ratings/aggregate${s ? `?${s}` : ""}`;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toISOString().slice(0, 10);
}

type AggregateRow = {
  eventId: string;
  title: string | null;
  types: string[] | null;
  rank: number | null;
  validFrom: Date | null;
  verdicts: Record<string, string>;
  notesByRater: Record<string, string | null>;
  raterCount: number;
  distinctVerdicts: number;
};

export default async function AggregateRatingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const onlyDisagreement = sp.only === "disagreement";
  const minRaters = Math.max(1, Math.min(10, Number(sp.min) || 1));
  const daysParsed =
    sp.days === "all" ? null : Math.max(1, Math.min(365, Number(sp.days) || 90));

  const whereConditions = [];
  if (daysParsed !== null) {
    const windowSeconds = daysParsed * 86_400;
    whereConditions.push(
      sql`${importedEvent.validFrom} >= now() - (${windowSeconds}::int * interval '1 second')`,
    );
  }

  const havingConditions = [sql`count(*) >= ${minRaters}`];
  if (onlyDisagreement) {
    havingConditions.push(sql`count(DISTINCT ${eventRating.verdict}) >= 2`);
  }

  const baseQuery = db()
    .select({
      eventId: eventRating.eventId,
      title: importedEvent.title,
      types: importedEvent.types,
      rank: importedEvent.rank,
      validFrom: importedEvent.validFrom,
      verdicts: sql<Record<string, string>>`jsonb_object_agg(${eventRating.rater}, ${eventRating.verdict})`,
      notesByRater: sql<Record<string, string | null>>`jsonb_object_agg(${eventRating.rater}, ${eventRating.notes})`,
      raterCount: sql<number>`count(*)::int`,
      distinctVerdicts: sql<number>`count(DISTINCT ${eventRating.verdict})::int`,
    })
    .from(eventRating)
    .leftJoin(importedEvent, eq(importedEvent.id, eventRating.eventId));

  const filteredQuery =
    whereConditions.length > 0 ? baseQuery.where(and(...whereConditions)) : baseQuery;

  const rows: AggregateRow[] = await filteredQuery
    .groupBy(
      eventRating.eventId,
      importedEvent.title,
      importedEvent.types,
      importedEvent.rank,
      importedEvent.validFrom,
    )
    .having(and(...havingConditions))
    .orderBy(sql`${importedEvent.validFrom} DESC NULLS LAST`, desc(eventRating.eventId))
    .limit(500);

  const allRatersResult = await db()
    .selectDistinct({ rater: eventRating.rater })
    .from(eventRating)
    .orderBy(eventRating.rater);
  const allRaters = allRatersResult.map((r) => r.rater);

  const disagreementCount = rows.filter((r) => r.distinctVerdicts >= 2).length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Ratings — all reviewers
          </h1>
          <p className="text-sm text-neutral-500">
            {rows.length} rated event{rows.length === 1 ? "" : "s"} shown · {allRaters.length}{" "}
            rater{allRaters.length === 1 ? "" : "s"} total · {disagreementCount} with
            disagreement
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
          <Link href="/review/ratings/james" className="hover:text-neutral-900">
            my ratings
          </Link>
        </nav>
      </header>

      <section className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
          Event window
        </span>
        {[7, 30, 90].map((d) => {
          const selected = daysParsed === d;
          return (
            <a
              key={d}
              href={buildHref(sp, { days: String(d) })}
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
          href={buildHref(sp, { days: "all" })}
          className={`rounded border px-2 py-1 font-mono text-xs transition-colors ${
            daysParsed === null
              ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
              : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
          }`}
        >
          all
        </a>

        <span className="ml-4 text-xs font-medium uppercase tracking-wider text-neutral-500">
          Min raters
        </span>
        {[1, 2, 3].map((n) => {
          const selected = minRaters === n;
          return (
            <a
              key={n}
              href={buildHref(sp, { min: String(n) })}
              className={`rounded border px-2 py-1 font-mono text-xs transition-colors ${
                selected
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                  : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
              }`}
            >
              ≥{n}
            </a>
          );
        })}

        <span className="ml-4 text-xs font-medium uppercase tracking-wider text-neutral-500">
          Show
        </span>
        <a
          href={buildHref(sp, { only: "" })}
          className={`rounded border px-2 py-1 font-mono text-xs transition-colors ${
            !onlyDisagreement
              ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
              : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
          }`}
        >
          all
        </a>
        <a
          href={buildHref(sp, { only: "disagreement" })}
          className={`rounded border px-2 py-1 font-mono text-xs transition-colors ${
            onlyDisagreement
              ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
              : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
          }`}
        >
          disagreement only
        </a>
      </section>

      <section className="mb-4 text-sm text-neutral-500">
        showing <span className="tabular-nums">{rows.length}</span>{" "}
        event{rows.length === 1 ? "" : "s"}
        {rows.length === 500 && <> · capped at 500</>}
      </section>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center text-sm text-neutral-500 dark:border-neutral-700">
          No rated events match these filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">Date</th>
                {allRaters.map((r) => (
                  <th key={r} className="px-3 py-2 font-mono font-medium">
                    <Link
                      href={`/review/ratings/${encodeURIComponent(r)}`}
                      className="hover:underline"
                    >
                      {r}
                    </Link>
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const status =
                  r.raterCount === 1
                    ? "single"
                    : r.distinctVerdicts === 1
                      ? "consensus"
                      : "split";
                return (
                  <tr
                    key={r.eventId}
                    className="border-t border-neutral-200 align-top dark:border-neutral-800"
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium text-neutral-900 dark:text-neutral-100">
                        {r.title ?? (
                          <em className="text-neutral-500">event cleared</em>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {(r.types ?? []).map((t) => (
                          <span
                            key={t}
                            className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px] text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                          >
                            {t}
                          </span>
                        ))}
                        <span className="font-mono text-[10px] text-neutral-500">
                          {r.eventId.slice(0, 10)}
                          {r.rank !== null && r.rank !== undefined && (
                            <> · rank {r.rank.toFixed(2)}</>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-neutral-500">
                      {fmtDate(r.validFrom)}
                    </td>
                    {allRaters.map((who) => {
                      const v = r.verdicts[who];
                      const note = r.notesByRater[who];
                      return (
                        <td
                          key={who}
                          className="px-3 py-2 font-mono text-xs"
                          title={note ?? undefined}
                        >
                          {v ? (
                            <span className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 dark:border-neutral-700 dark:bg-neutral-900">
                              {v}
                            </span>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 font-mono text-xs">
                      <span
                        className={
                          status === "split"
                            ? "rounded bg-amber-100 px-1.5 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                            : status === "consensus"
                              ? "rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                              : "text-neutral-500"
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
