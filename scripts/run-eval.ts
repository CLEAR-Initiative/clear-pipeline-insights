/**
 * Offline-eval ingest: takes a JSONL file of pre-computed model outputs and
 * lands them as a closed pipeline_run + N llm_call rows tagged for evaluation.
 *
 * Usage:
 *   tsx scripts/run-eval.ts \
 *     --set <name> --set-version <v> --model <model_id> \
 *     --inputs <path-to-jsonl> \
 *     [--git-sha <sha>] [--description <txt>]
 *
 * JSONL line shape:
 *   {
 *     "signal_id": "...",         // optional; joins to llm_call.signal_id
 *     "eval_item_id": "...",      // optional; reserved for future use
 *     "stage": "classify",        // optional; defaults to set.stage
 *     "system_prompt": "...",     // required by llm_call NOT NULL — pass "" for non-LLM candidates
 *     "user_prompt": "...",       // required by llm_call NOT NULL
 *     "raw_response": "...",      // required by llm_call NOT NULL — JSON-stringify for non-LLM
 *     "parsed_response": {...},   // optional jsonb
 *     "parse_error": "...",       // optional
 *     "input_tokens": 100,        // optional
 *     "output_tokens": 50,        // optional
 *     "cache_read_tokens": 0,     // optional
 *     "cache_create_tokens": 0,   // optional
 *     "latency_ms": 1234          // optional
 *   }
 *
 * Behavior: creates one pipeline_run with env='offline-eval', name encoding
 * the (set, version, model, timestamp). Inserts one llm_call per line. Closes
 * the run on success. computeCost runs server-side as in /api/calls; null for
 * unpriced models (Gemma, BERT). Each invocation creates a fresh run — re-run
 * idempotency is wart clear-pipeline-insights-e6g.
 */

import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";

config({ path: [".env.local", ".env"] });

import { db } from "../src/db/client";
import { evaluationSet, llmCall, pipelineRun } from "../src/db/schema";
import { computeCost } from "../src/lib/prices";

type CliArgs = {
  setName: string;
  setVersion: string;
  model: string;
  inputs: string;
  gitSha: string | null;
  description: string | null;
};

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string): string | null => {
    const idx = argv.indexOf(flag);
    return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : null;
  };

  const setName = get("--set");
  const setVersion = get("--set-version");
  const model = get("--model");
  const inputs = get("--inputs");

  if (!setName || !setVersion || !model || !inputs) {
    console.error(
      "Usage: tsx scripts/run-eval.ts --set <name> --set-version <v> --model <id> --inputs <jsonl> [--git-sha <sha>] [--description <txt>]",
    );
    process.exit(1);
  }

  return {
    setName,
    setVersion,
    model,
    inputs,
    gitSha: get("--git-sha"),
    description: get("--description"),
  };
}

type JsonlRow = {
  signal_id?: unknown;
  eval_item_id?: unknown;
  stage?: unknown;
  system_prompt?: unknown;
  user_prompt?: unknown;
  raw_response?: unknown;
  parsed_response?: unknown;
  parse_error?: unknown;
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_read_tokens?: unknown;
  cache_create_tokens?: unknown;
  latency_ms?: unknown;
};

function parseJsonl(path: string): JsonlRow[] {
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  return lines.map((line, i) => {
    try {
      return JSON.parse(line) as JsonlRow;
    } catch (err) {
      throw new Error(`invalid JSON on line ${i + 1}: ${(err as Error).message}`);
    }
  });
}

function reqString(v: unknown, field: string, line: number): string {
  if (typeof v !== "string") {
    throw new Error(`line ${line}: ${field} must be a string`);
  }
  return v;
}

function optInt(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const [set] = await db()
    .select({
      id: evaluationSet.id,
      name: evaluationSet.name,
      version: evaluationSet.version,
      stage: evaluationSet.stage,
    })
    .from(evaluationSet)
    .where(
      and(
        eq(evaluationSet.name, args.setName),
        eq(evaluationSet.version, args.setVersion),
      ),
    )
    .limit(1);

  if (!set) {
    console.error(
      `Evaluation set not found: name=${args.setName} version=${args.setVersion}`,
    );
    process.exit(1);
  }

  const rows = parseJsonl(args.inputs);
  if (rows.length === 0) {
    console.error(`No input rows in ${args.inputs}`);
    process.exit(1);
  }

  const isoNow = new Date().toISOString();
  const runName = `eval-${args.setName}-${args.setVersion}-${args.model}-${isoNow}`;

  const [run] = await db()
    .insert(pipelineRun)
    .values({
      name: runName,
      env: "offline-eval",
      pipelineRepo: "clear-pipeline-insights",
      gitSha: args.gitSha,
      config: {
        eval_set_id: set.id,
        eval_set_name: set.name,
        eval_set_version: set.version,
        eval_set_stage: set.stage,
        model_id: args.model,
        description: args.description,
      },
    })
    .returning({ id: pipelineRun.id, startedAt: pipelineRun.startedAt });

  console.log(`Created run ${run.id} (${runName})`);

  const callValues: typeof llmCall.$inferInsert[] = rows.map((row, i) => {
    const lineNo = i + 1;
    const stage =
      typeof row.stage === "string" && row.stage.length > 0 ? row.stage : set.stage;
    const inputTokens = optInt(row.input_tokens);
    const outputTokens = optInt(row.output_tokens);
    const cacheReadTokens = optInt(row.cache_read_tokens);
    const cacheCreateTokens = optInt(row.cache_create_tokens);
    const cost = computeCost(args.model, {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_tokens: cacheReadTokens,
      cache_create_tokens: cacheCreateTokens,
    });

    return {
      runId: run.id,
      stage,
      promptVersion: `${set.name}@${set.version}`,
      model: args.model,
      signalId: typeof row.signal_id === "string" ? row.signal_id : null,
      eventId: null,
      systemPrompt: reqString(row.system_prompt, "system_prompt", lineNo),
      userPrompt: reqString(row.user_prompt, "user_prompt", lineNo),
      rawResponse: reqString(row.raw_response, "raw_response", lineNo),
      parsedResponse:
        row.parsed_response === undefined
          ? null
          : (row.parsed_response as typeof llmCall.$inferInsert.parsedResponse),
      parseError: typeof row.parse_error === "string" ? row.parse_error : null,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreateTokens,
      costUsd: cost === null ? null : cost.toString(),
      latencyMs: optInt(row.latency_ms),
    };
  });

  const inserted = await db()
    .insert(llmCall)
    .values(callValues)
    .returning({ id: llmCall.id });

  console.log(`Inserted ${inserted.length} llm_call rows`);

  await db()
    .update(pipelineRun)
    .set({ endedAt: new Date() })
    .where(eq(pipelineRun.id, run.id));

  console.log(`Closed run ${run.id}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
