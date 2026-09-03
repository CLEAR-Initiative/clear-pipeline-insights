# Eval harness

The model evaluation system: how to compare candidate models (Claude variants, Gemma, fine-tuned BERT) against each other on the same inputs. This document describes what's actually built. The decision to extend this repo rather than build a separate harness is summarised below and belongs in an ADR under `docs/adr/` (not yet written; use `docs/adr/0000-template.md`).

## Why this exists

CLEAR's data strategy commits to systematically asking, per pipeline stage:

- **Classify.** Is fine-tuned BERT competitive with Claude on relevance and hazard-type classification?
- **Group.** Does LLM in-context reasoning beat embedding-based similarity for clustering signals into events?
- **Extract.** Does LLM extraction of structured fields beat task-specific NER models?

Answering those requires running candidate models on the same inputs and comparing outputs side-by-side, plus aggregate metrics (F1, cluster purity, field completeness). The harness is the substrate for that.

## Two modes

**Offline evaluation.** Candidate models run against a fixed evaluation set with known ground truth. Reproducible, fast, cheap. **This is what's currently built.**

**Production shadow comparison.** Candidate models run on live production traffic alongside the production model. Production decisions take effect; candidate decisions are logged but not acted on. **The data path is built** (shadow rows are just `llm_call` rows with a different `env`); the dispatcher that fans signals out to candidates lives in `clear-pipeline` and is a separate workstream.

Both modes write to the same comparison surface — `llm_call` joined on `signal_id` — so offline and shadow results can be analysed together.

## The decision: extend, don't fork

The harness extends `clear-pipeline-insights` rather than living as a separate system. The reasoning:

- `llm_call` already carries `(signal_id, prompt_version, model)` with nullable cost/tokens — the shape candidate models need.
- `nikita-v1` is already registered in [src/lib/prices.ts](../src/lib/prices.ts) at $0; the precedent for non-API self-hosted writers is shipped, not aspirational.
- The cookie/bearer auth split in [src/proxy.ts](../src/proxy.ts) lets `/api/evaluations/*` slot in with no auth-mixing risk.
- A separate harness would fork the schema, prices module, and ingest contract, then need a federation layer to answer the headline query "everything every model said about signal X."

## Data model

Three new tables (migration `0004_classy_the_enforcers.sql`). **No changes to `llm_call` or `pipeline_run`.**

### `evaluation_set`
Versioned ground-truth bundles, unique on `(name, version)`.
```
id           uuid PK
name         text NOT NULL          -- e.g. 'sitrep-classify'
version      text NOT NULL          -- e.g. 'v1', '2026-04-15'
stage        text NOT NULL          -- 'classify' | 'group' | 'extract'
description  text
created_at   timestamptz
```

### `evaluation_set_item`
One `(input, expected output)` pair per row.
```
id              uuid PK
set_id          uuid FK -> evaluation_set ON DELETE CASCADE
signal_id       text                       -- nullable; synthetic items have no real signal
input_payload   jsonb NOT NULL             -- shape varies per stage
ground_truth    jsonb NOT NULL             -- shape varies per stage
notes           text
created_at      timestamptz
```

`signal_id` is the join key back to `llm_call.signal_id`. Synthetic items (adversarial test cases, hand-crafted edge cases) are `NULL` here — see the open wart `clear-pipeline-insights-ryn` for adding `eval_item_id` to `llm_call` when synthetic items become a real flow.

### `evaluation_metric`
Aggregate per-run scores. Composite PK on `(run_id, metric_name, scope)`.
```
run_id         uuid FK -> pipeline_run ON DELETE CASCADE
metric_name    text NOT NULL              -- 'f1', 'precision', 'cluster_purity', ...
scope          text NOT NULL DEFAULT 'overall'   -- 'overall' | hazard_type | per-AO | ...
metric_value   numeric(20,8)              -- nullable for matrix-only metrics
details        jsonb                      -- confusion matrix, per-class breakdowns
created_at     timestamptz
```

`scope` is what lets the same metric appear multiple times per run — `f1` overall, `f1` for hazard_type=flood, `f1` for hazard_type=disease, etc.

### Convention, not schema

An eval run is a `pipeline_run` row with:
- `env = 'offline-eval'` (or `'shadow-<model>'` for shadow rows)
- `name` encoding `(set_name, set_version, model_id, timestamp)` for traceability
- `pipeline_repo = 'clear-pipeline-insights'`
- `config` (jsonb) carrying `{eval_set_id, eval_set_name, eval_set_version, eval_set_stage, model_id, description}`

Eval row outputs go to `llm_call` as-is. The existing FK from `llm_call.run_id` to `pipeline_run.id` works unchanged. **Eval scripts must close their run** via `POST /api/runs/:id/close` so the open-run dedup logic in [src/app/api/runs/route.ts](../src/app/api/runs/route.ts) doesn't reuse it.

## Write path

### `POST /api/evaluations/sets`

Idempotent on `(name, version)`. Bearer-gated.

```bash
curl -X POST http://localhost:3000/api/evaluations/sets \
  -H "Authorization: Bearer $INSIGHTS_INGEST_TOKEN" \
  -H "content-type: application/json" \
  -d '{"name":"sitrep-classify","version":"v1","stage":"classify","description":"100 SitRep-validated signals"}'
```

Returns `201 {id, name, version, stage, created_at}` on create, `200` on existing.

### `POST /api/evaluations/sets/:id/items`

Batch insert. 404 if set missing. 400 on malformed items.

```bash
curl -X POST http://localhost:3000/api/evaluations/sets/<set-id>/items \
  -H "Authorization: Bearer $INSIGHTS_INGEST_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "items": [
      {
        "signal_id":"s-001",
        "input_payload":{"title":"Floods displace 12,000","body":"...","source":"ReliefWeb"},
        "ground_truth":{"hazard_types":["flood"],"relevance":0.95}
      },
      ...
    ]
  }'
```

Returns `201 {count, ids}`.

### `POST /api/runs/:id/close`

Idempotent. Sets `ended_at` if currently null; returns the existing `ended_at` otherwise. 404 if the run doesn't exist.

### `npm run run-eval`

Researcher-facing CLI. Ingests a JSONL of pre-computed model outputs as a complete eval run. **Note**: the CLI does not invoke models — model invocation happens in the researcher's own script (Python or whatever); this CLI just lifts the JSONL into the database with proper `pipeline_run` lifecycle.

```bash
npm run run-eval -- \
  --set sitrep-classify --set-version v1 \
  --model gemma-3-27b-instruct \
  --inputs results.jsonl \
  [--git-sha <sha>] [--description <txt>]
```

JSONL line shape:
```json
{
  "signal_id": "s-001",
  "system_prompt": "…",
  "user_prompt": "…",
  "raw_response": "…",
  "parsed_response": {"hazard_types":["flood"],"relevance":0.91},
  "input_tokens": 220,
  "output_tokens": 22,
  "latency_ms": 320
}
```

`system_prompt`, `user_prompt`, `raw_response` are required (NOT NULL on `llm_call` — see wart `clear-pipeline-insights-uj1`). For non-LLM candidates pass empty strings + JSON-stringified structured input/output. Cost is computed server-side via [computeCost](../src/lib/prices.ts).

## Read path

### `/eval` — runs list
Server component reading `pipeline_run WHERE env='offline-eval'`, joined with `llm_call` aggregates (call count, parse error count, total cost, avg latency). Sorted by `started_at DESC`, capped at 200 runs.

### `/eval/runs/:id` — run detail
Run metadata (model, eval set, started/ended, git sha, total cost) plus the per-call table. Each `signal_id` links to the comparison page.

### `/eval/compare/:signal_id` — side-by-side model comparison
All `llm_call` rows for a given `signal_id`, rendered as one card per call. Pulls ground truth from `evaluation_set_item` if it exists. The pivot pattern is borrowed from [src/app/review/ratings/aggregate/page.tsx](../src/app/review/ratings/aggregate/page.tsx) — same idea, different dimension (model instead of rater).

### Query helpers

In [src/lib/queries.ts](../src/lib/queries.ts):
- `fetchEvalRuns()` — runs list
- `fetchEvalRunDetail(runId)` — run + calls
- `fetchModelDisagreement(signalId)` — calls + ground truth on a signal

These are intentionally narrow — extend them as new eval views land.

## End-to-end test flow

```bash
npm run db:migrate     # migration 0004 applies the eval tables
npm run seed-eval      # creates sitrep-classify-demo@v1 with 5 items + 2 sample runs
npm run dev
```

Open http://localhost:3000/eval. You'll see two runs (claude-sonnet-4-6 and gemma-3-27b-instruct). Click into a run to see calls; click `s-002` or `s-004` for the side-by-side comparison — disagreements are baked into the seed data on those two signals.

`npm run seed-eval -- --reset` wipes demo data and reseeds.

## Open warts (parked)

These are real but not blocking; tracked as beads, prioritized to be tackled when they actually bite:

| Bead | Wart | Trigger to fix |
|---|---|---|
| `clear-pipeline-insights-uj1` | `system_prompt` / `user_prompt` / `raw_response` are NOT NULL on `llm_call` | First non-LLM candidate ingest |
| `clear-pipeline-insights-qcj` | No zod-style validation of `parsed_response` shape per `(stage, prompt_version)` | When two candidates write incompatible shapes |
| `clear-pipeline-insights-4uj` | No `compare_group` convention to bind multiple runs as one comparison set | Before `/eval/compare` needs to scope to specific runs |
| `clear-pipeline-insights-ryn` | No `eval_item_id` on `llm_call` for synthetic items with no `signal_id` | First synthetic item is created |
| `clear-pipeline-insights-e6g` | No idempotency on re-running an eval (duplicate `llm_call` rows) | When duplicate-run pain shows up; depends on `ryn` |

## What's not built yet

- **`POST /api/evaluations/runs/:id/metrics`** — `evaluation_metric` has no ingest endpoint. The CLI doesn't compute or post F1 scores. Run-detail page derives aggregates from `llm_call` directly.
- **Hide eval/shadow envs from the cost dashboard.** Eval rows under `env='offline-eval'` will appear in `fetchDailyByEnv`. A default-on filter to keep cost numbers prod-only is on the to-do list.
- **Shadow dispatcher.** Lives in `clear-pipeline`; this repo only ingests the resulting rows.
- **Model invocation.** The CLI ingests pre-computed outputs. The "actually call Gemma on each input" step is the researcher's responsibility.

## Schema reproducibility

Two practical reproducibility caveats:

1. **`prompt_version` doubles as the stage interface version.** Today nothing distinguishes "I changed the prompt wording" from "I changed the input/output shape." If the contract changes, bump `prompt_version` so old and new outputs aren't averaged together.
2. **Sampler config is not captured.** Stochastic models (`temperature > 0`) produce different outputs on re-run. For eval runs, pin `temperature=0` by convention; the schema does not enforce this.
