"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { eventRating, importedEvent, importedSignal } from "@/db/schema";
import { ClearApiError, fetchRecentEvents } from "@/lib/clearApi";

const IMPORT_HARD_CAP = 200;

export async function importEvents(input: {
  sinceIso: string;
  limit?: number;
}): Promise<
  | { ok: true; eventsImported: number; signalsImported: number; teamId: string | null }
  | { ok: false; error: string }
> {
  const limit = Math.min(
    Math.max(1, Math.trunc(input.limit ?? IMPORT_HARD_CAP)),
    IMPORT_HARD_CAP,
  );

  let events;
  let teamId: string | null;
  try {
    const result = await fetchRecentEvents({ sinceIso: input.sinceIso, limit });
    events = result.events;
    teamId = result.teamId;
  } catch (err) {
    const msg =
      err instanceof ClearApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "unknown error";
    return { ok: false, error: msg };
  }

  if (events.length === 0) {
    return { ok: true, eventsImported: 0, signalsImported: 0, teamId };
  }

  const eventRows = events.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    types: e.types,
    rank: e.rank,
    validFrom: new Date(e.validFrom),
    validTo: new Date(e.validTo),
    firstSignalCreatedAt: new Date(e.firstSignalCreatedAt),
    lastSignalCreatedAt: new Date(e.lastSignalCreatedAt),
    populationAffected: e.populationAffected,
    originLocationId: e.originLocation?.id ?? null,
    destinationLocationId: e.destinationLocation?.id ?? null,
    locationId: e.generalLocation?.id ?? null,
    rawEvent: e as unknown as Record<string, unknown>,
    teamId,
  }));

  const signalRows = events.flatMap((e) =>
    e.signals.map((s) => ({
      id: s.id,
      eventId: e.id,
      sourceId: s.source?.id ?? null,
      sourceName: s.source?.name ?? null,
      title: s.title,
      description: s.description,
      url: s.url,
      publishedAt: new Date(s.publishedAt),
      collectedAt: new Date(s.collectedAt),
      rawSignal: s as unknown as Record<string, unknown>,
    })),
  );

  await db()
    .insert(importedEvent)
    .values(eventRows)
    .onConflictDoUpdate({
      target: importedEvent.id,
      set: {
        title: sql`excluded.title`,
        description: sql`excluded.description`,
        types: sql`excluded.types`,
        rank: sql`excluded.rank`,
        validFrom: sql`excluded.valid_from`,
        validTo: sql`excluded.valid_to`,
        firstSignalCreatedAt: sql`excluded.first_signal_created_at`,
        lastSignalCreatedAt: sql`excluded.last_signal_created_at`,
        populationAffected: sql`excluded.population_affected`,
        originLocationId: sql`excluded.origin_location_id`,
        destinationLocationId: sql`excluded.destination_location_id`,
        locationId: sql`excluded.location_id`,
        rawEvent: sql`excluded.raw_event`,
        teamId: sql`excluded.team_id`,
        importedAt: sql`now()`,
      },
    });

  if (signalRows.length > 0) {
    await db()
      .insert(importedSignal)
      .values(signalRows)
      .onConflictDoUpdate({
        target: importedSignal.id,
        set: {
          eventId: sql`excluded.event_id`,
          sourceId: sql`excluded.source_id`,
          sourceName: sql`excluded.source_name`,
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          url: sql`excluded.url`,
          publishedAt: sql`excluded.published_at`,
          collectedAt: sql`excluded.collected_at`,
          rawSignal: sql`excluded.raw_signal`,
          importedAt: sql`now()`,
        },
      });
  }

  revalidatePath("/review/events");
  return {
    ok: true,
    eventsImported: eventRows.length,
    signalsImported: signalRows.length,
    teamId,
  };
}

export async function clearImports(): Promise<{ ok: true; cleared: number }> {
  const deleted = await db().delete(importedEvent).returning({ id: importedEvent.id });
  revalidatePath("/review/events");
  return { ok: true, cleared: deleted.length };
}

export async function rateEvent(input: {
  eventId: string;
  verdict: string;
  notes?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.eventId || typeof input.eventId !== "string") {
    return { ok: false, error: "eventId required" };
  }
  const verdict = input.verdict.trim();
  if (!verdict) {
    return { ok: false, error: "verdict required" };
  }
  const notes = input.notes?.trim() ? input.notes.trim() : null;
  const rater = "james";

  const existing = await db()
    .select({ id: eventRating.id })
    .from(eventRating)
    .where(and(eq(eventRating.eventId, input.eventId), eq(eventRating.rater, rater)))
    .limit(1);

  if (existing.length > 0) {
    await db()
      .update(eventRating)
      .set({ verdict, notes, createdAt: new Date() })
      .where(eq(eventRating.id, existing[0].id));
  } else {
    await db().insert(eventRating).values({
      eventId: input.eventId,
      rater,
      verdict,
      notes,
    });
  }

  revalidatePath("/review/events");
  return { ok: true };
}
