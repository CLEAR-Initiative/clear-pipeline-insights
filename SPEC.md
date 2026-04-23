# clear-pipeline-insights — Build Spec

> **Read first:** [`../clear-pipeline/docs/PIPELINE_INSIGHTS_PROPOSAL.md`](../clear-pipeline/docs/PIPELINE_INSIGHTS_PROPOSAL.md). That proposal is the **source of truth for the why**. This file is the **source of truth for the what** — concrete tasks for building this repo.
>
> Owner: James. Created: 2026-04-23. Phase: 1 (the leak detector).

## What this repo is

A Next.js dashboard + Postgres-backed API for observing every LLM call made by `clear-pipeline` (and, eventually, by Nikita's classifier). One deployed dashboard the team bookmarks; same code runs locally. See proposal §2 for the architecture diagram.

## Decisions already made (do not relitigate, just build)

- **Stack:** Next.js 15 App Router, TypeScript, Tailwind. Already scaffolded by `create-next-app`.
- **DB:** Postgres. New dedicated database (not the clear-api production DB).
- **DB client:** Drizzle ORM (lighter than Prisma, SQL-first which suits an analytics workload).
- **Charts:** Recharts. (Tremor is also fine but adds weight; Recharts is what we need for Phase 1.)
- **Pipeline → DB path:** Pipeline writes via a Next.js API route (`POST /api/calls`), not direct DB. The API doubles as the contract for any future pipeline (IFRC, Nikita's classifier) that wants to write into the same store.
- **Auth:** none for Phase 1. Add basic auth or NextAuth in Phase 3 when we add the rating UI.
- **Hosting:** Railway (consistent with the rest of the CLEAR stack). Postgres on the same.

## Schema — `migrations/0001_init.sql`

Build this exactly. It is the contract between this repo and `clear-pipeline`.

```sql
CREATE TABLE pipeline_run (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  env             text NOT NULL,
  pipeline_repo   text NOT NULL,
  git_sha         text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  config          jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE llm_call (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              uuid NOT NULL REFERENCES pipeline_run(id),
  stage               text NOT NULL,            -- 'classify' | 'group' | 'assess' | other
  prompt_version      text NOT NULL,
  model               text NOT NULL,
  signal_id           text,
  event_id            text,
  system_prompt       text NOT NULL,
  user_prompt         text NOT NULL,
  raw_response        text NOT NULL,
  parsed_response     jsonb,
  parse_error         text,
  input_tokens        int,
  output_tokens       int,
  cache_read_tokens   int,
  cache_create_tokens int,
  cost_usd            numeric(10,6),
  latency_ms          int,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX llm_call_run_stage_created_idx ON llm_call (run_id, stage, created_at DESC);
CREATE INDEX llm_call_signal_idx ON llm_call (signal_id) WHERE signal_id IS NOT NULL;
CREATE INDEX llm_call_created_idx ON llm_call (created_at DESC);
```

`signal_processing` and `rating` tables come in Phase 2 and Phase 3 — do **not** build them now.

## API contract — what `clear-pipeline` will call

### `POST /api/runs`

Create or upsert a run. Pipeline calls this on startup (or per-restart, depending on the open question we still owe an answer on — for now, on every pipeline boot).

Request:
```json
{
  "name": "live-prod",
  "env": "prod",
  "pipeline_repo": "clear-pipeline",
  "git_sha": "2d196b3",
  "config": { "claude_model": "claude-sonnet-4-6", "relevance_threshold": 0.5 }
}
```
Response:
```json
{ "id": "uuid", "name": "live-prod", "started_at": "..." }
```

Behaviour: if a run with the same `(name, env, pipeline_repo)` already has `ended_at IS NULL`, return the existing one. Otherwise insert a new one.

### `POST /api/calls`

Insert one LLM call row.

Request (all fields except optional ones are required):
```json
{
  "run_id": "uuid",
  "stage": "classify",
  "prompt_version": "classify-v1",
  "model": "claude-sonnet-4-6",
  "signal_id": "abc123",       // optional
  "event_id": null,            // optional
  "system_prompt": "...",
  "user_prompt": "...",
  "raw_response": "...",
  "parsed_response": { ... },  // optional, jsonb
  "parse_error": null,         // optional
  "input_tokens": 800,
  "output_tokens": 120,
  "cache_read_tokens": 0,
  "cache_create_tokens": 0,
  "latency_ms": 1843
}
```

Response: `201` with `{ "id": "uuid" }`.

**The server computes `cost_usd`** from `model` + tokens via the prices module — pipeline does not send cost. This means new models can be added by editing the prices module without redeploying the pipeline.

Auth for v0: a shared bearer token in `INSIGHTS_INGEST_TOKEN`, passed as `Authorization: Bearer ...`. Reject without it. Document the token in `.env.example`.

## Prices module

`src/lib/prices.ts` — a hand-maintained map of model → input/output $/Mtoken. Used server-side only.

```ts
export const MODEL_PRICES: Record<string, { input: number; output: number; cacheRead?: number; cacheCreate?: number }> = {
  // $ per 1M tokens. Sourced from anthropic.com/pricing — update as needed.
  "claude-sonnet-4-6":   { input: 3.00, output: 15.00, cacheRead: 0.30, cacheCreate: 3.75 },
  "claude-opus-4-7":     { input: 15.00, output: 75.00, cacheRead: 1.50, cacheCreate: 18.75 },
  "claude-haiku-4-5":    { input: 1.00, output: 5.00, cacheRead: 0.10, cacheCreate: 1.25 },
  "nikita-v1":           { input: 0,    output: 0 }, // self-hosted, no API cost
};

export function computeCost(model: string, usage: {
  input_tokens?: number; output_tokens?: number;
  cache_read_tokens?: number; cache_create_tokens?: number;
}): number | null {
  const p = MODEL_PRICES[model];
  if (!p) return null;
  const cost =
    ((usage.input_tokens ?? 0)        * p.input        +
     (usage.output_tokens ?? 0)       * p.output       +
     (usage.cache_read_tokens ?? 0)   * (p.cacheRead   ?? 0) +
     (usage.cache_create_tokens ?? 0) * (p.cacheCreate ?? 0)) / 1_000_000;
  return Number(cost.toFixed(6));
}
```

## Phase 1 dashboard — one page only

Route `/` (or `/cost`). Shows:

1. **Hero stat:** total $ spent in the last 24h, with delta vs the previous 24h.
2. **Stacked bar chart:** $/day for the last 30 days, stacked by `env` (prod, staging, local-*).
3. **Stacked bar chart:** $/day for the last 30 days, stacked by `stage` (classify, group, assess).
4. **Table:** top 20 most expensive runs (sum of cost_usd grouped by run_id) with name, env, model, calls, $, started_at.
5. **Tiny table at bottom:** "models seen" — each `model` value with call count + total $ — so we immediately notice if a model string is unrecognized in the prices module (cost will be null).

Filters: date range (default last 30d), env multi-select.

Do not build call-browser, ratings, prompt diffs, or run comparison. Those are Phases 3 and 4.

## What to build, in order

1. **Drizzle setup** — install `drizzle-orm`, `drizzle-kit`, `postgres` (or `pg`). Define the schema in `src/db/schema.ts` matching the SQL above. Generate the migration into `migrations/`. Wire `drizzle.config.ts`.
2. **`.env.example`** — `DATABASE_URL`, `INSIGHTS_INGEST_TOKEN`. Plus a README note that local dev should hit a Postgres on `localhost:5432` or whatever shared dev DB we agree on.
3. **`POST /api/runs`** in `src/app/api/runs/route.ts`. Auth-checked.
4. **`POST /api/calls`** in `src/app/api/calls/route.ts`. Auth-checked. Computes cost server-side.
5. **Prices module** at `src/lib/prices.ts`.
6. **Cost dashboard page** at `src/app/page.tsx` (replace the create-next-app default). Server component fetching aggregates directly from Drizzle. Recharts client component for the bars.
7. **README** rewrite — what the app is, how to run locally (`npm run dev`), how to point at a DB, link back to the proposal and this spec.
8. **Deploy to Railway** — Postgres + the Next app. Provision the bearer token. Hand off the API URL + token to whoever wires up the pipeline side.

## What clear-pipeline will do once the API exists

A separate session in `/Users/james/code/clear-pipeline` will then:
- Add `INSIGHTS_API_URL` and `INSIGHTS_INGEST_TOKEN` to `src/config.py`.
- Add `src/clients/insights.py` with `record_call(...)` and `ensure_run()`. Synchronous HTTP POST in a try/except that swallows errors (telemetry must never break the pipeline).
- Add `*_PROMPT_VERSION` constants to each file in `src/prompts/`.
- Modify `src/clients/claude.py:22` (`call_claude`) to accept `stage`, `signal_id`, `event_id` kwargs, capture `response.usage` + latency + parse outcome, and call `record_call(...)`.
- Update callsites in `src/services/event.py`, `src/services/alert.py`, `src/tasks/process.py` to pass stage/signal context.

Schema and API are the contract. Get them right here first; the pipeline side is mechanical once the contract is stable.

## Open questions still owed back to James (proposal §9)

These do not block Phase 1 but should be answered before we wire production:
1. Where does the insights DB live? (Lean: Railway Postgres alongside this app.)
2. Should Nikita be looped in on the schema? (Lean: yes, 20-min call before we mark schema stable.)
3. One run per env, or one per pipeline restart? (Lean: per restart for now — easier to see deploy boundaries.)
4. Prompt versioning style? (Lean: explicit version string in prompt module, e.g. `CLASSIFY_PROMPT_VERSION = "v1"`.)
5. Auth on the dashboard? (Lean: none for Phase 1, basic auth in Phase 3.)
