import Link from "next/link";
import { desc, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { eventRating, importedEvent, importedSignal } from "@/db/schema";
import { ImportControls } from "./import-controls";
import { EventRow } from "./row";

export const dynamic = "force-dynamic";

export default async function ReviewEventsPage() {
  const events = await db()
    .select({
      id: importedEvent.id,
      title: importedEvent.title,
      description: importedEvent.description,
      types: importedEvent.types,
      rank: importedEvent.rank,
      validFrom: importedEvent.validFrom,
      validTo: importedEvent.validTo,
      importedAt: importedEvent.importedAt,
      signalCount:
        sql<number>`(SELECT COUNT(*)::int FROM ${importedSignal} WHERE ${importedSignal.eventId} = ${importedEvent.id})`.as(
          "signal_count",
        ),
      verdict: eventRating.verdict,
      notes: eventRating.notes,
    })
    .from(importedEvent)
    .leftJoin(
      eventRating,
      sql`${eventRating.eventId} = ${importedEvent.id} AND ${eventRating.rater} = 'james'`,
    )
    .orderBy(desc(importedEvent.validFrom))
    .limit(200);

  const eventIds = events.map((e) => e.id);
  const signals =
    eventIds.length === 0
      ? []
      : await db()
          .select({
            id: importedSignal.id,
            eventId: importedSignal.eventId,
            sourceName: importedSignal.sourceName,
            title: importedSignal.title,
            description: importedSignal.description,
            url: importedSignal.url,
            publishedAt: importedSignal.publishedAt,
          })
          .from(importedSignal)
          .where(inArray(importedSignal.eventId, eventIds))
          .orderBy(desc(importedSignal.publishedAt));

  const signalsByEvent = new Map<string, typeof signals>();
  for (const s of signals) {
    const bucket = signalsByEvent.get(s.eventId) ?? [];
    bucket.push(s);
    signalsByEvent.set(s.eventId, bucket);
  }

  const ratedCount = events.filter((e) => e.verdict !== null).length;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Cluster review
          </h1>
          <p className="text-sm text-neutral-500">
            Import recent events from clear-api and rate each cluster as a whole.
          </p>
        </div>
        <nav className="text-sm text-neutral-500">
          <Link href="/" className="hover:text-neutral-900">
            ← dashboard
          </Link>
          <span className="mx-2">·</span>
          <Link href="/review/group" className="hover:text-neutral-900">
            call-level review
          </Link>
          <span className="mx-2">·</span>
          <Link href="/review/ratings/james" className="hover:text-neutral-900">
            my ratings
          </Link>
          <span className="mx-2">·</span>
          <Link href="/review/ratings/aggregate" className="hover:text-neutral-900">
            all reviewers
          </Link>
        </nav>
      </header>

      <ImportControls hasImports={events.length > 0} />

      <section className="mb-4 text-sm text-neutral-500 tabular-nums">
        {events.length === 0 ? (
          <>no events imported yet</>
        ) : (
          <>
            <span>{events.length}</span> imported · <span>{ratedCount}</span>{" "}
            rated · <span>{events.length - ratedCount}</span> unrated
          </>
        )}
      </section>

      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center text-sm text-neutral-500 dark:border-neutral-700">
          Click <strong>Import last 7d</strong> above to pull recent events from clear-api.
        </div>
      ) : (
        <section className="space-y-3">
          {events.map((e) => (
            <EventRow
              key={e.id}
              eventId={e.id}
              title={e.title}
              description={e.description}
              types={e.types ?? []}
              rank={e.rank}
              validFrom={new Date(e.validFrom).toISOString()}
              validTo={new Date(e.validTo).toISOString()}
              signalCount={e.signalCount ?? 0}
              signals={(signalsByEvent.get(e.id) ?? []).map((s) => ({
                id: s.id,
                sourceName: s.sourceName,
                title: s.title,
                description: s.description,
                url: s.url,
                publishedAt: new Date(s.publishedAt).toISOString(),
              }))}
              initialVerdict={e.verdict}
              initialNotes={e.notes}
            />
          ))}
        </section>
      )}
    </main>
  );
}
