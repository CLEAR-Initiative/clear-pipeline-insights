/**
 * Seed sample eval data for end-to-end testing.
 *
 * Creates:
 *   1× evaluation_set "sitrep-classify-demo@v1" with 5 items (signals s-001..s-005)
 *   2× pipeline_run (env='offline-eval') — one for claude-sonnet-4-6, one for
 *      gemma-3-27b-instruct — each with 5 llm_call rows. Outputs differ on 2
 *      of the 5 signals so the comparison view shows real disagreement.
 *
 * Usage:
 *   npm run seed-eval                  # idempotent on (set name, set version)
 *   npm run seed-eval -- --reset       # delete demo data first, then reseed
 *
 * After running: open http://localhost:3000/eval to see the runs, then click
 * a signal_id (e.g. s-002) for the side-by-side comparison.
 */

import { config } from "dotenv";
import { and, eq, like } from "drizzle-orm";

config({ path: [".env.local", ".env"] });

import { db } from "../src/db/client";
import {
  evaluationSet,
  evaluationSetItem,
  llmCall,
  pipelineRun,
} from "../src/db/schema";
import { computeCost } from "../src/lib/prices";

const SET_NAME = "sitrep-classify-demo";
const SET_VERSION = "v1";
const STAGE = "classify";

type SeedItem = {
  signalId: string;
  inputPayload: Record<string, unknown>;
  groundTruth: Record<string, unknown>;
};

const ITEMS: SeedItem[] = [
  {
    signalId: "s-001",
    inputPayload: {
      title: "Floods displace 12,000 in Gedaref state",
      body: "Heavy rains overnight caused flash flooding across three localities...",
      source: "ReliefWeb",
    },
    groundTruth: { hazard_types: ["flood"], relevance: 0.95 },
  },
  {
    signalId: "s-002",
    inputPayload: {
      title: "Cholera outbreak reported in displaced persons camp",
      body: "Health officials confirmed 47 cholera cases over the past week...",
      source: "WHO bulletin",
    },
    groundTruth: { hazard_types: ["disease_outbreak"], relevance: 0.98 },
  },
  {
    signalId: "s-003",
    inputPayload: {
      title: "Local football match cancelled due to weather",
      body: "The Saturday match between two regional clubs was postponed...",
      source: "Sports daily",
    },
    groundTruth: { hazard_types: [], relevance: 0.05 },
  },
  {
    signalId: "s-004",
    inputPayload: {
      title: "Armed clashes near border, civilians flee",
      body: "Fighting broke out between two militia groups; UNHCR estimates 3,000 displaced...",
      source: "OCHA flash update",
    },
    groundTruth: {
      hazard_types: ["armed_conflict", "displacement"],
      relevance: 0.92,
    },
  },
  {
    signalId: "s-005",
    inputPayload: {
      title: "Drought conditions worsening across northern provinces",
      body: "Rainfall 60% below seasonal average; FAO warns of food security impact...",
      source: "FAO situation report",
    },
    groundTruth: { hazard_types: ["drought", "food_insecurity"], relevance: 0.9 },
  },
];

type ModelOutput = {
  parsed: Record<string, unknown>;
  rawResponse: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  parseError?: string | null;
};

const CLAUDE_OUTPUTS: Record<string, ModelOutput> = {
  "s-001": {
    parsed: { hazard_types: ["flood"], relevance: 0.94 },
    rawResponse:
      '{"hazard_types": ["flood"], "relevance": 0.94, "reasoning": "Clear flood signal"}',
    inputTokens: 220,
    outputTokens: 35,
    latencyMs: 850,
  },
  "s-002": {
    parsed: { hazard_types: ["disease_outbreak"], relevance: 0.97 },
    rawResponse: '{"hazard_types": ["disease_outbreak"], "relevance": 0.97}',
    inputTokens: 195,
    outputTokens: 28,
    latencyMs: 720,
  },
  "s-003": {
    parsed: { hazard_types: [], relevance: 0.03 },
    rawResponse: '{"hazard_types": [], "relevance": 0.03}',
    inputTokens: 150,
    outputTokens: 18,
    latencyMs: 410,
  },
  "s-004": {
    parsed: {
      hazard_types: ["armed_conflict", "displacement"],
      relevance: 0.93,
    },
    rawResponse:
      '{"hazard_types": ["armed_conflict", "displacement"], "relevance": 0.93}',
    inputTokens: 240,
    outputTokens: 38,
    latencyMs: 920,
  },
  "s-005": {
    parsed: { hazard_types: ["drought", "food_insecurity"], relevance: 0.88 },
    rawResponse:
      '{"hazard_types": ["drought", "food_insecurity"], "relevance": 0.88}',
    inputTokens: 210,
    outputTokens: 32,
    latencyMs: 800,
  },
};

const GEMMA_OUTPUTS: Record<string, ModelOutput> = {
  "s-001": {
    parsed: { hazard_types: ["flood"], relevance: 0.91 },
    rawResponse: '{"hazard_types": ["flood"], "relevance": 0.91}',
    inputTokens: 220,
    outputTokens: 22,
    latencyMs: 320,
  },
  // disagreement: Gemma misses cholera signal entirely
  "s-002": {
    parsed: { hazard_types: [], relevance: 0.4 },
    rawResponse: '{"hazard_types": [], "relevance": 0.4}',
    inputTokens: 195,
    outputTokens: 16,
    latencyMs: 280,
  },
  "s-003": {
    parsed: { hazard_types: [], relevance: 0.08 },
    rawResponse: '{"hazard_types": [], "relevance": 0.08}',
    inputTokens: 150,
    outputTokens: 14,
    latencyMs: 220,
  },
  // disagreement: Gemma classifies armed conflict only as "displacement"
  "s-004": {
    parsed: { hazard_types: ["displacement"], relevance: 0.85 },
    rawResponse: '{"hazard_types": ["displacement"], "relevance": 0.85}',
    inputTokens: 240,
    outputTokens: 20,
    latencyMs: 360,
  },
  "s-005": {
    parsed: { hazard_types: ["drought"], relevance: 0.82 },
    rawResponse: '{"hazard_types": ["drought"], "relevance": 0.82}',
    inputTokens: 210,
    outputTokens: 18,
    latencyMs: 310,
  },
};

async function reset() {
  // delete in dep order: llm_call → pipeline_run (eval-only) → set_item → set
  const demoRuns = await db()
    .select({ id: pipelineRun.id })
    .from(pipelineRun)
    .where(
      and(
        eq(pipelineRun.env, "offline-eval"),
        like(pipelineRun.name, `eval-${SET_NAME}-${SET_VERSION}-%`),
      ),
    );
  for (const r of demoRuns) {
    await db().delete(llmCall).where(eq(llmCall.runId, r.id));
    await db().delete(pipelineRun).where(eq(pipelineRun.id, r.id));
  }
  const [demoSet] = await db()
    .select({ id: evaluationSet.id })
    .from(evaluationSet)
    .where(
      and(
        eq(evaluationSet.name, SET_NAME),
        eq(evaluationSet.version, SET_VERSION),
      ),
    )
    .limit(1);
  if (demoSet) {
    await db()
      .delete(evaluationSetItem)
      .where(eq(evaluationSetItem.setId, demoSet.id));
    await db().delete(evaluationSet).where(eq(evaluationSet.id, demoSet.id));
  }
  console.log(
    `Reset: removed ${demoRuns.length} demo run(s) and demo eval_set if present.`,
  );
}

async function ensureSet(): Promise<{ id: string; created: boolean }> {
  const [existing] = await db()
    .select({ id: evaluationSet.id })
    .from(evaluationSet)
    .where(
      and(
        eq(evaluationSet.name, SET_NAME),
        eq(evaluationSet.version, SET_VERSION),
      ),
    )
    .limit(1);
  if (existing) return { id: existing.id, created: false };

  const [inserted] = await db()
    .insert(evaluationSet)
    .values({
      name: SET_NAME,
      version: SET_VERSION,
      stage: STAGE,
      description: "Sample sitrep classification set for end-to-end testing",
    })
    .returning({ id: evaluationSet.id });

  await db()
    .insert(evaluationSetItem)
    .values(
      ITEMS.map((it) => ({
        setId: inserted.id,
        signalId: it.signalId,
        inputPayload: it.inputPayload,
        groundTruth: it.groundTruth,
        notes: null,
      })),
    );
  return { id: inserted.id, created: true };
}

async function ingestRun(
  setId: string,
  setStage: string,
  modelId: string,
  outputs: Record<string, ModelOutput>,
): Promise<string> {
  const isoNow = new Date().toISOString();
  const runName = `eval-${SET_NAME}-${SET_VERSION}-${modelId}-${isoNow}`;

  const [run] = await db()
    .insert(pipelineRun)
    .values({
      name: runName,
      env: "offline-eval",
      pipelineRepo: "clear-pipeline-insights",
      gitSha: null,
      config: {
        eval_set_id: setId,
        eval_set_name: SET_NAME,
        eval_set_version: SET_VERSION,
        eval_set_stage: setStage,
        model_id: modelId,
        description: `seed-eval demo run for ${modelId}`,
      },
    })
    .returning({ id: pipelineRun.id });

  const callValues: typeof llmCall.$inferInsert[] = ITEMS.map((it) => {
    const out = outputs[it.signalId];
    const cost = computeCost(modelId, {
      input_tokens: out.inputTokens,
      output_tokens: out.outputTokens,
    });
    return {
      runId: run.id,
      stage: setStage,
      promptVersion: `${SET_NAME}@${SET_VERSION}`,
      model: modelId,
      signalId: it.signalId,
      eventId: null,
      systemPrompt: "You classify humanitarian signals into hazard types.",
      userPrompt: JSON.stringify(it.inputPayload),
      rawResponse: out.rawResponse,
      parsedResponse: out.parsed as typeof llmCall.$inferInsert.parsedResponse,
      parseError: out.parseError ?? null,
      inputTokens: out.inputTokens,
      outputTokens: out.outputTokens,
      cacheReadTokens: null,
      cacheCreateTokens: null,
      costUsd: cost === null ? null : cost.toString(),
      latencyMs: out.latencyMs,
    };
  });

  await db().insert(llmCall).values(callValues);

  await db()
    .update(pipelineRun)
    .set({ endedAt: new Date() })
    .where(eq(pipelineRun.id, run.id));

  return run.id;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--reset")) {
    await reset();
  }

  const set = await ensureSet();
  if (set.created) {
    console.log(
      `Created evaluation_set ${SET_NAME}@${SET_VERSION} (${set.id}) with ${ITEMS.length} items.`,
    );
  } else {
    console.log(
      `Reusing existing evaluation_set ${SET_NAME}@${SET_VERSION} (${set.id}).`,
    );
  }

  const claudeRunId = await ingestRun(
    set.id,
    STAGE,
    "claude-sonnet-4-6",
    CLAUDE_OUTPUTS,
  );
  console.log(`Created run for claude-sonnet-4-6: ${claudeRunId}`);

  const gemmaRunId = await ingestRun(
    set.id,
    STAGE,
    "gemma-3-27b-instruct",
    GEMMA_OUTPUTS,
  );
  console.log(`Created run for gemma-3-27b-instruct: ${gemmaRunId}`);

  console.log("");
  console.log("Done. Next:");
  console.log("  npm run dev");
  console.log("  open http://localhost:3000/eval");
  console.log(
    "  click a signal_id (e.g. s-002 or s-004 — disagreements) to see the side-by-side view.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
