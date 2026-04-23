@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical: Next.js version mismatch

`package.json` pins **Next.js 16.2.4** and **React 19.2.4**, but `SPEC.md` was written against "Next.js 15 App Router." Trust `package.json`. Before writing App Router, route-handler, or caching code, read the relevant page under [node_modules/next/dist/docs/01-app/](node_modules/next/dist/docs/01-app/) — APIs and defaults differ from older Next.js and from your training data (see [AGENTS.md](AGENTS.md)).

## Commands

```bash
npm run dev     # next dev — local server on :3000
npm run build   # next build
npm run start   # next start — run the production build
npm run lint    # eslint (flat config in eslint.config.mjs)
```

There is **no test runner installed**. Do not invent one; if tests are needed, ask first.

## What this repo is (and isn't yet)

`clear-pipeline-insights` is the observability dashboard + ingest API for LLM calls made by the sibling `clear-pipeline` repo. See [SPEC.md](SPEC.md) for the full build plan — it is the source of truth for *what* to build. The proposal at `../clear-pipeline/docs/PIPELINE_INSIGHTS_PROPOSAL.md` is the source of truth for *why*.

**Current state:** freshly scaffolded by `create-next-app`. [src/app/page.tsx](src/app/page.tsx) is still the default splash page. None of the schema, API routes, Drizzle setup, prices module, or dashboard described in SPEC.md has been built yet. When asked to "add X," first check whether X is step 1–8 of SPEC.md's build order and follow that order unless the user says otherwise.

## Why this exists (origin context)

This repo was conceived in a meeting on 2026-04-23 between James (lead) and Prajava (pipeline engineer). Three pains drove it:

1. **Anthropic credits were burning faster than expected** and nobody could say why — staging and prod were suspected of sharing a key, signal volume per Claude call was unknown, and Railway logs vanish on restart so historical analysis was impossible.
2. **The pipeline was "guarded by specialty knowledge."** To know what was happening you had to read the database. Prajava's analogy: every productive factory has one big board everyone glances at — green/yellow/blocked, throughput per station. The pipeline had nothing equivalent.
3. **Nikita (data scientist) is building a proprietary classifier intended to replace Claude.** The team had no substrate to compare his model against Claude on the same inputs.

**Build to enable measurement, not to define "quality."** Nobody on the team has yet defined what "good" looks like for the classify/group/assess stages. The dashboard's job is to expose calls, costs, and outputs so the team can sit down and *develop* a definition by example. Resist any temptation to compute opinionated quality scores — surface the raw data and the rating UI (Phase 3) lets humans label.

## Three expected writers, one schema

The `llm_call` table will receive rows from at least three sources:

1. **`clear-pipeline` prod** — `model='claude-sonnet-4-6'`, `env='prod'`, `run_id` per pipeline restart.
2. **`clear-pipeline` staging** — same shape, `env='staging'`.
3. **Nikita's classifier, run from his laptop** — `model='nikita-v1'`, `env='local-nikita'`, `run_id` per experiment. He writes via `POST /api/calls` from a Python script, **not** from inside the pipeline. He uses the same bearer token (or his own — TBD).

Architectural implications:
- **`cost_usd` may be null.** Self-hosted models have no per-call API price. The prices module returns `null` for unknown / zero-priced models; the dashboard shows them but doesn't crash.
- **`input_tokens`/`output_tokens` may be null** for the same reason.
- **`prompt_version` and `signal_id` are how we join.** The run-comparison page (Phase 4) joins Nikita's row and Claude's row on `signal_id` to show per-signal disagreement.
- Schema/API changes affect at least two repos (this one + clear-pipeline) and one independent script (Nikita's). Treat the API contract in SPEC.md as load-bearing — add fields, don't rename or remove them without coordinating.

## The audience is engineers, not field teams

Different user group from the main CLEAR app. James + Prajava + Nikita + whoever else picks up the pipeline. No NGO field workers will look at this. That's why Phase 1 has no auth on the dashboard, why we tolerate rough Tailwind UI, and why we can show raw prompts and JSON responses on the call-browser page later. Optimize for engineering legibility, not visual polish.

## Architecture (target, per SPEC.md)

The shape to build toward, not what's in the repo yet:

- **Ingest contract** — two API routes the pipeline POSTs to:
  - `POST /api/runs` at `src/app/api/runs/route.ts` — upserts a `pipeline_run` keyed on `(name, env, pipeline_repo)` while `ended_at IS NULL`.
  - `POST /api/calls` at `src/app/api/calls/route.ts` — inserts one `llm_call` row. **The server computes `cost_usd`** from the model + token counts; the pipeline never sends cost. This is deliberate so new model prices roll out by deploying this repo, not the pipeline.
  - Both routes require `Authorization: Bearer $INSIGHTS_INGEST_TOKEN`.
- **Prices** — `src/lib/prices.ts` holds a hand-maintained `MODEL_PRICES` map ($/1M tokens, including cache read/create) and a `computeCost(model, usage)` helper that returns `null` for unknown models. The dashboard surfaces unknown models in a "models seen" table so missing prices are immediately visible.
- **DB** — Postgres via Drizzle ORM (`drizzle-orm`, `drizzle-kit`, `postgres`/`pg`). Schema in `src/db/schema.ts`; SQL migrations in `migrations/` (starting with `0001_init.sql`). Two tables in Phase 1: `pipeline_run` and `llm_call`. `signal_processing` and `rating` are Phase 2/3 — do not add them preemptively.
- **Dashboard** — single page at `/` (server component pulling aggregates directly from Drizzle) with Recharts client components for the bar charts. Phase 1 scope is strictly: 24h hero stat, two 30-day stacked bar charts ($/day by env, $/day by stage), top-20-runs table, and the "models seen" table. **Do not** build call browser, ratings, prompt diffs, or run comparison — those are Phases 3 and 4.
- **Auth** — none on the dashboard in Phase 1. Only the ingest routes are token-gated.
- **Hosting** — Railway (Next app + Postgres on the same).

## Env vars (to document in `.env.example` when created)

- `DATABASE_URL` — Postgres connection string. Dedicated DB, **not** the clear-api production DB.
- `INSIGHTS_INGEST_TOKEN` — shared bearer token the pipeline uses for `/api/runs` and `/api/calls`.

## Conventions

- TypeScript `strict: true`, path alias `@/* → ./src/*` (see [tsconfig.json](tsconfig.json)).
- Tailwind v4 via `@tailwindcss/postcss` (see [postcss.config.mjs](postcss.config.mjs)). No `tailwind.config.*` file — Tailwind v4 uses CSS-first config in [src/app/globals.css](src/app/globals.css).
- ESLint flat config extending `next/core-web-vitals` and `next/typescript` (see [eslint.config.mjs](eslint.config.mjs)).
- Keep the ingest API permissive of additive schema changes, but the current field list in SPEC.md is the contract `clear-pipeline` is coding against — do not rename or remove fields without updating both sides.
