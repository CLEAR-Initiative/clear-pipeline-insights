import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
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

export type PipelineRun = typeof pipelineRun.$inferSelect;
export type NewPipelineRun = typeof pipelineRun.$inferInsert;
export type LlmCall = typeof llmCall.$inferSelect;
export type NewLlmCall = typeof llmCall.$inferInsert;
