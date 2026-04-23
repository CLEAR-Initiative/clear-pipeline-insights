# clear-pipeline-insights

Dashboard + ingest API for observing every LLM call made by the CLEAR pipeline (and, eventually, Nikita's classifier). One deployed dashboard the team bookmarks; same code runs locally.

**Why this exists:** see `SPEC.md` for the what, and the proposal at `../clear-pipeline/docs/PIPELINE_INSIGHTS_PROPOSAL.md` for the why.

## Stack

- Next.js 16 App Router + React 19 + TypeScript
- Tailwind v4
- Postgres + Drizzle ORM
- Recharts

## Run locally

```bash
cp .env.example .env.local
# edit .env.local: set DATABASE_URL and INSIGHTS_INGEST_TOKEN

npm install
npm run db:migrate          # apply migrations/0000_init.sql
npm run dev                 # http://localhost:3000
```

The dashboard is the `/` route. Data appears once the pipeline starts POSTing to `/api/runs` and `/api/calls`.

## Ingest API

Both endpoints require `Authorization: Bearer $INSIGHTS_INGEST_TOKEN`.

### `POST /api/runs`

Upsert behaviour: if a run with the same `(name, env, pipeline_repo)` has `ended_at IS NULL`, returns the existing one; otherwise inserts a new one.

```bash
curl -X POST http://localhost:3000/api/runs \
  -H "Authorization: Bearer $INSIGHTS_INGEST_TOKEN" \
  -H "content-type: application/json" \
  -d '{"name":"live-prod","env":"prod","pipeline_repo":"clear-pipeline","git_sha":"2d196b3","config":{"claude_model":"claude-sonnet-4-6"}}'
```

### `POST /api/calls`

The server computes `cost_usd` from `model` + token counts via [`src/lib/prices.ts`](src/lib/prices.ts) — the pipeline does **not** send cost. New models are added by editing that file and redeploying this repo.

```bash
curl -X POST http://localhost:3000/api/calls \
  -H "Authorization: Bearer $INSIGHTS_INGEST_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "run_id":"<uuid>",
    "stage":"classify",
    "prompt_version":"classify-v1",
    "model":"claude-sonnet-4-6",
    "signal_id":"abc123",
    "system_prompt":"…",
    "user_prompt":"…",
    "raw_response":"…",
    "parsed_response":{"label":"relevant"},
    "input_tokens":800,
    "output_tokens":120,
    "latency_ms":1843
  }'
```

Unknown models insert with `cost_usd = NULL` and are surfaced on the dashboard's "models seen" table so the gap is immediately visible.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate a new migration from `src/db/schema.ts` diffs |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:push` | Push schema directly without a migration (dev only) |
| `npm run db:studio` | Drizzle Studio |

## Layout

```
src/
  app/
    page.tsx                # Phase 1 dashboard
    stacked-bar.tsx         # Recharts client component
    api/
      runs/route.ts         # POST /api/runs
      calls/route.ts        # POST /api/calls
  db/
    schema.ts               # Drizzle schema — contract with clear-pipeline
    client.ts               # Lazy singleton postgres-js + Drizzle client
  lib/
    auth.ts                 # Bearer-token check
    prices.ts               # MODEL_PRICES + computeCost
    queries.ts              # Dashboard aggregate queries
migrations/                 # drizzle-kit migrations
```

## Deploy

Railway: Postgres + the Next app alongside. Set `DATABASE_URL` and `INSIGHTS_INGEST_TOKEN`, then run `npm run db:migrate` as a release step.

## Scope guardrails

Phase 1 is intentionally small: cost dashboard only. **Do not** build a call browser, rating UI, prompt-version diffs, or run comparison yet — those are Phases 3 and 4 in `SPEC.md`. Schema changes affect at least three writers (`clear-pipeline` prod, staging, and Nikita's classifier), so additive-only.
