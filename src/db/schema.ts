import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const pipelineRun = pgTable("pipeline_run", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  env: text().notNull(),
  pipelineRepo: text().notNull(),
  gitSha: text(),
  startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp({ withTimezone: true }),
  config: jsonb().notNull().default(sql`'{}'::jsonb`),
});

export const llmCall = pgTable(
  "llm_call",
  {
    id: uuid().primaryKey().defaultRandom(),
    runId: uuid()
      .notNull()
      .references(() => pipelineRun.id),
    stage: text().notNull(),
    promptVersion: text().notNull(),
    model: text().notNull(),
    signalId: text(),
    eventId: text(),
    systemPrompt: text().notNull(),
    userPrompt: text().notNull(),
    rawResponse: text().notNull(),
    parsedResponse: jsonb(),
    parseError: text(),
    inputTokens: integer(),
    outputTokens: integer(),
    cacheReadTokens: integer(),
    cacheCreateTokens: integer(),
    costUsd: numeric({ precision: 10, scale: 6 }),
    latencyMs: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("llm_call_run_stage_created_idx").on(
      t.runId,
      t.stage,
      t.createdAt.desc(),
    ),
    index("llm_call_signal_idx")
      .on(t.signalId)
      .where(sql`${t.signalId} IS NOT NULL`),
    index("llm_call_created_idx").on(t.createdAt.desc()),
  ],
);

export const callRating = pgTable(
  "call_rating",
  {
    id: uuid().primaryKey().defaultRandom(),
    callId: uuid()
      .notNull()
      .references(() => llmCall.id, { onDelete: "cascade" }),
    rater: text().notNull().default("james"),
    verdict: text().notNull(),
    confidence: smallint(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("call_rating_call_rater_key").on(t.callId, t.rater),
    index("call_rating_created_idx").on(t.createdAt.desc()),
    index("call_rating_call_idx").on(t.callId),
  ],
);

export const importedEvent = pgTable(
  "imported_event",
  {
    id: text().primaryKey(),
    title: text(),
    description: text(),
    types: text().array(),
    rank: real(),
    validFrom: timestamp({ withTimezone: true }).notNull(),
    validTo: timestamp({ withTimezone: true }).notNull(),
    firstSignalCreatedAt: timestamp({ withTimezone: true }).notNull(),
    lastSignalCreatedAt: timestamp({ withTimezone: true }).notNull(),
    populationAffected: text(),
    originLocationId: text(),
    destinationLocationId: text(),
    locationId: text(),
    rawEvent: jsonb().notNull(),
    teamId: text(),
    importedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("imported_event_valid_from_idx").on(t.validFrom.desc()),
    index("imported_event_imported_at_idx").on(t.importedAt.desc()),
  ],
);

export const importedSignal = pgTable(
  "imported_signal",
  {
    id: text().primaryKey(),
    eventId: text()
      .notNull()
      .references(() => importedEvent.id, { onDelete: "cascade" }),
    sourceId: text(),
    sourceName: text(),
    title: text(),
    description: text(),
    url: text(),
    publishedAt: timestamp({ withTimezone: true }).notNull(),
    collectedAt: timestamp({ withTimezone: true }).notNull(),
    rawSignal: jsonb().notNull(),
    importedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("imported_signal_event_idx").on(t.eventId)],
);

export const eventRating = pgTable(
  "event_rating",
  {
    id: uuid().primaryKey().defaultRandom(),
    eventId: text().notNull(),
    rater: text().notNull().default("james"),
    verdict: text().notNull(),
    confidence: smallint(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("event_rating_event_rater_key").on(t.eventId, t.rater),
    index("event_rating_event_idx").on(t.eventId),
    index("event_rating_created_idx").on(t.createdAt.desc()),
  ],
);

export type PipelineRun = typeof pipelineRun.$inferSelect;
export type NewPipelineRun = typeof pipelineRun.$inferInsert;
export type LlmCall = typeof llmCall.$inferSelect;
export type NewLlmCall = typeof llmCall.$inferInsert;
export type CallRating = typeof callRating.$inferSelect;
export type NewCallRating = typeof callRating.$inferInsert;
export type ImportedEvent = typeof importedEvent.$inferSelect;
export type NewImportedEvent = typeof importedEvent.$inferInsert;
export type ImportedSignal = typeof importedSignal.$inferSelect;
export type NewImportedSignal = typeof importedSignal.$inferInsert;
export type EventRating = typeof eventRating.$inferSelect;
export type NewEventRating = typeof eventRating.$inferInsert;

export const VERDICTS = [
  "correct",
  "wrong_group",
  "should_be_new",
  "should_have_merged",
  "unclear",
] as const;
export type Verdict = (typeof VERDICTS)[number];
