# clear-pipeline-insights

Engineering dashboard for the LLM calls made by the CLEAR humanitarian pipeline. It records every call (prompt, response, tokens, cost, latency), lets humans rate the model's decisions, and lets researchers compare candidate models against Claude on the same inputs.

It is a small Next.js app with its own Postgres. The audience is the pipeline engineers, not field teams, so the UI is deliberately plain and shows raw prompts and JSON.

- **Live app:** the pipeline's default target is `https://clear-pipeline-insights.vercel.app` (see `insights_api_url` in `clear-pipeline/src/config.py`).
- **Why it exists:** [SPEC.md](SPEC.md) (original build spec, April 2026) and `../clear-pipeline/docs/PIPELINE_INSIGHTS_PROPOSAL.md` (the motivating proposal). Both are historical; this README describes what is actually built.

## How it fits together

```
clear-pipeline (prod / staging / local-<user>)
    │  POST /api/runs, POST /api/calls        (bearer token)
    ▼
clear-pipeline-insights ── Postgres ──▶ dashboard pages   (magic-link cookie session)
    ▲                          ▲
    │  npm run run-eval        │  "Import" button on /review/events
    │  (JSONL of model outputs)│  reads events + signals from clear-api (GraphQL)
researcher's laptop         clear-api
```

Three things write into the database:

| Writer | How | `env` value |
| --- | --- | --- |
| `clear-pipeline` (live) | `src/clients/insights.py` in that repo wraps `call_claude()` and POSTs to the ingest API. Fire-and-forget: telemetry never breaks the pipeline. | `prod`, `staging`, or `local-<username>` |
| Eval CLI in this repo | `npm run run-eval` lifts a JSONL file of pre-computed model outputs into a closed run | `offline-eval` |
| Any future model (e.g. a self-hosted classifier) | Same ingest API, same bearer token | anything, e.g. `local-nikita` |

Because several repos write to the same tables, **schema changes are additive only**. Add nullable columns or new tables; never rename or drop a field without coordinating with every writer.

## Quick start (about 10 minutes)

Prerequisites: Node 20+, a local Postgres 14+.

```bash
git clone <this repo> && cd clear-pipeline-insights
cp .env.example .env.local
```

Edit `.env.local`: set `DATABASE_URL` to a **new, empty** database, and generate `INSIGHTS_INGEST_TOKEN` and `BETTER_AUTH_SECRET` with `openssl rand -hex 32`. Leave the Postmark and `CLEAR_API_*` lines blank for now.

```bash
createdb clear_pipeline_insights                          # or whatever name you put in DATABASE_URL
npm install
npm run db:migrate                                        # creates every table
npm run create-user -- you@example.com "Your Name" you    # the app is invite-only; this is the invite
npm run seed-eval                                         # optional: demo eval data so pages aren't empty
npm run dev                                               # http://localhost:3000
```

Open http://localhost:3000. You will be redirected to `/sign-in`. Enter the email you just created. With no Postmark configured, the magic link is printed in the `npm run dev` terminal as a `[magic-link]` line. Paste that URL into the browser and you are in.

The cost dashboard will be empty until something POSTs calls. To see data straight away, either run `npm run seed-eval` and open `/eval`, or send the two `curl` requests in [How data gets in](#how-data-gets-in).

Full setup detail, Postmark configuration, and a troubleshooting list are in [docs/local-development.md](docs/local-development.md).

## Tour of the app

Every page below requires a signed-in session. The top nav ([src/components/top-nav.tsx](src/components/top-nav.tsx)) links them all.

| Route | What it shows | Source file |
| --- | --- | --- |
| `/` | **Cost dashboard.** 24h spend with delta, $/day stacked by env and by stage, top-20 most expensive runs, parse-error rate, p50/p95/p99 latency by stage, prompt-cache hit ratio, and a "models seen" table. Filters: `?days=30&env=prod`. | [src/app/page.tsx](src/app/page.tsx) |
| `/live` | Same tiles for the last 60 minutes, auto-refreshing every 30s. The "is it running right now" view. | [src/app/live/page.tsx](src/app/live/page.tsx) |
| `/review/group` | **Call review.** Lists `stage='group'` calls (the LLM deciding whether a signal joins an existing event). Rate each with a verdict and 1–5 confidence; keyboard hotkeys 1–5. | [src/app/review/group/](src/app/review/group/) |
| `/review/events` | **Cluster review.** Import recent events + their signals from clear-api, then rate whether each cluster hangs together. Clearing imports keeps the ratings. | [src/app/review/events/](src/app/review/events/) |
| `/review/ratings/<username>` | One rater's event ratings, filterable by verdict and window. | [src/app/review/ratings/[username]/page.tsx](src/app/review/ratings/[username]/page.tsx) |
| `/review/ratings/aggregate` | All raters side by side per event, so disagreements are visible. | [src/app/review/ratings/aggregate/page.tsx](src/app/review/ratings/aggregate/page.tsx) |
| `/eval` | **Eval harness.** List of `offline-eval` runs with call count, errors, cost, latency. | [src/app/eval/page.tsx](src/app/eval/page.tsx) |
| `/eval/runs/<id>` | One eval run: metadata plus every call. | [src/app/eval/runs/[id]/page.tsx](src/app/eval/runs/[id]/page.tsx) |
| `/eval/compare/<signalId>` | Everything every model said about one signal, next to the ground truth if an eval set has it. | [src/app/eval/compare/[signalId]/page.tsx](src/app/eval/compare/[signalId]/page.tsx) |
| `/sign-in` | Magic-link form. No sign-up; users are created by an admin with `npm run create-user`. | [src/app/sign-in/](src/app/sign-in/) |

Verdict vocabularies are fixed lists. Call ratings use `correct`, `wrong_group`, `should_be_new`, `should_have_merged`, `unclear` (`VERDICTS` in [src/db/schema.ts](src/db/schema.ts)). Event ratings use `coherent`, `should_split`, `should_merge`, `should_dissolve`, `unclear`.

## How data gets in

### Ingest API (bearer token)

All routes under `/api/calls`, `/api/runs`, and `/api/evaluations` require `Authorization: Bearer $INSIGHTS_INGEST_TOKEN` and are exempt from cookie auth (see the matcher in [src/proxy.ts](src/proxy.ts)). Request bodies are snake_case JSON.

| Route | Purpose |
| --- | --- |
| `POST /api/runs` | Create or reuse a `pipeline_run`. If a run with the same `(name, env, pipeline_repo)` is still open (`ended_at IS NULL`) it is returned as-is, otherwise a new one is inserted. The live pipeline never closes its runs, so one run persists across restarts per env. |
| `POST /api/runs/:id/close` | Set `ended_at`. Idempotent. Eval runs must be closed so they are not reused. |
| `POST /api/calls` | Insert one `llm_call`. **The server computes `cost_usd`** from `model` plus token counts; clients never send cost. Unknown models get `cost_usd = NULL` and show up in the dashboard's "models seen" table so a missing price is obvious. |
| `POST /api/evaluations/sets` | Create a versioned ground-truth set, idempotent on `(name, version)`. |
| `POST /api/evaluations/sets/:id/items` | Batch-attach `(input_payload, ground_truth)` items to a set. |

Smoke test against a local server:

```bash
curl -s -X POST http://localhost:3000/api/runs \
  -H "Authorization: Bearer $INSIGHTS_INGEST_TOKEN" -H "content-type: application/json" \
  -d '{"name":"live","env":"local-me","pipeline_repo":"clear-pipeline","git_sha":"abc1234","config":{"claude_model":"claude-sonnet-4-6"}}'
# → {"id":"<run uuid>","name":"live","started_at":"..."}

curl -s -X POST http://localhost:3000/api/calls \
  -H "Authorization: Bearer $INSIGHTS_INGEST_TOKEN" -H "content-type: application/json" \
  -d '{"run_id":"<run uuid>","stage":"classify","prompt_version":"classify-v1","model":"claude-sonnet-4-6",
       "signal_id":"sig-1","system_prompt":"...","user_prompt":"...","raw_response":"{\"label\":\"relevant\"}",
       "parsed_response":{"label":"relevant"},"input_tokens":800,"output_tokens":120,"latency_ms":1843}'
# → {"id":"<call uuid>"}   and cost_usd is filled in server-side
```

Required fields on `/api/calls`: `run_id`, `stage`, `prompt_version`, `model`, `system_prompt`, `user_prompt`, `raw_response`. Everything else (`signal_id`, `event_id`, `parsed_response`, `parse_error`, the four token counts, `latency_ms`) is optional and nullable.

### From the live pipeline

`clear-pipeline/src/clients/insights.py` calls `ensure_run()` once per process and `record_call()` after every Claude call. It is enabled only when that repo has `INSIGHTS_INGEST_TOKEN` set; `PIPELINE_ENV` sets the `env` tag, defaulting to `local-<username>`.

### From a researcher's model run

Run your candidate model yourself, write one JSON line per input, then:

```bash
npm run run-eval -- --set sitrep-classify --set-version v1 --model gemma-3-27b-instruct --inputs results.jsonl
```

That creates a closed `offline-eval` run and one `llm_call` per line, so the outputs appear in `/eval` and join with other models on `signal_id` in `/eval/compare/<signalId>`. Line shape and the full workflow are in [docs/eval-harness.md](docs/eval-harness.md).

## Data model

Schema lives in [src/db/schema.ts](src/db/schema.ts) (app tables) and [src/db/auth-schema.ts](src/db/auth-schema.ts) (Better Auth). Column names are snake_case in Postgres and camelCase in TypeScript via Drizzle's `casing: "snake_case"`.

| Table | One row per | Notes |
| --- | --- | --- |
| `pipeline_run` | Process or experiment that made calls | Keyed by `(name, env, pipeline_repo)` while open. `config` jsonb holds model, thresholds, eval-set metadata. |
| `llm_call` | Single model call | The core table. Full prompts and response, token counts, `cost_usd`, `latency_ms`, `signal_id` / `event_id` for joining. |
| `call_rating` | Human verdict on one `llm_call` | Unique per `(call_id, rater)`. `rater` is the user's UUID. |
| `imported_event`, `imported_signal` | Snapshot of a clear-api event cluster | Read-only mirror pulled on demand by `/review/events`. Safe to clear and re-import. |
| `event_rating` | Human verdict on one cluster | Keyed by clear-api `event_id`, not the mirror row, so it survives a re-import. |
| `evaluation_set`, `evaluation_set_item` | Versioned ground-truth bundle and its items | Items join to `llm_call.signal_id`. |
| `evaluation_metric` | Aggregate score per run | Table exists; no ingest endpoint or UI yet. |
| `user`, `session`, `account`, `verification` | Better Auth | Same database; code keeps an explicit lookup boundary (`usernamesByIds()` in [src/lib/session.ts](src/lib/session.ts)) so the tables could be split out later. |

Migrations are plain SQL under [migrations/](migrations/), generated by drizzle-kit and append-only. `0000` is the original two-table contract; `0001`–`0002` add ratings and the clear-api mirror; `0003` adds auth; `0004` adds the eval tables; `0005` enforces lowercase emails.

## Auth, in one paragraph

Two independent mechanisms. **Pages** use Better Auth with magic-link sign-in and `disableSignUp: true`, so only emails inserted by `npm run create-user` can sign in ([src/lib/better-auth.ts](src/lib/better-auth.ts)); [src/proxy.ts](src/proxy.ts) redirects any page request without a session cookie to `/sign-in`, and server components call `requireSession()` or `getRater()` from [src/lib/session.ts](src/lib/session.ts). **Ingest routes** use a single shared bearer token checked by `checkBearer()` in [src/lib/auth.ts](src/lib/auth.ts) and never touch cookies. Do not mix them.

## Environment variables

Template: [.env.example](.env.example). Next.js reads `.env.local` at startup; scripts and drizzle-kit load `.env.local` then `.env` via dotenv. Changes need a restart.

| Variable | Required | Used for |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres for everything, including auth tables. A dedicated database, never clear-api's. |
| `INSIGHTS_INGEST_TOKEN` | yes | Shared bearer token for the ingest API. Same value goes into clear-pipeline. |
| `BETTER_AUTH_SECRET` | yes | Signs session cookies and magic-link tokens. |
| `BETTER_AUTH_URL` | yes in prod | Public origin; magic links are built from it. Defaults to `http://localhost:3000`. |
| `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM` | no | Real magic-link email. Unset means links are logged to the server console. `POSTMARK_FROM` must be a verified sender. |
| `CLEAR_API_URL`, `CLEAR_API_TOKEN`, `CLEAR_API_TEAM_ID` | only for `/review/events` | GraphQL endpoint and a clear-api API key for importing clusters. Everything else works without them. |

## Repository layout

```
src/
  app/
    page.tsx, live/               cost dashboards (server components)
    stacked-bar.tsx               the one Recharts client component
    review/group|events|ratings   human rating UI; each folder has page.tsx + actions.ts (server actions) + row.tsx (client)
    eval/                         eval runs list, run detail, per-signal comparison
    api/runs, api/calls,
    api/evaluations               bearer-token ingest routes
    api/auth/[...all]             Better Auth handler
    sign-in/                      magic-link form
  components/top-nav.tsx          shared nav
  db/schema.ts, auth-schema.ts    Drizzle schema (the cross-repo contract)
  db/client.ts                    lazy postgres-js + Drizzle singleton, db()
  lib/queries.ts                  every aggregate query the pages use (raw SQL via drizzle sql``)
  lib/dashboard.ts                pure formatting/pivot helpers for the dashboard
  lib/prices.ts                   MODEL_PRICES table + computeCost()
  lib/auth.ts                     checkBearer()
  lib/better-auth.ts, auth-client.ts, session.ts
                                  cookie auth server + client + helpers
  lib/clearApi.ts                 minimal GraphQL client for clear-api (import feature only)
  proxy.ts                        Next.js middleware: cookie gate, bearer routes exempted
scripts/
  create-user.ts                  invite a user (also can backfill legacy rater ids)
  run-eval.ts                     ingest a JSONL of model outputs as an eval run
  seed-eval.ts                    demo eval set + two runs with baked-in disagreement
  check-data.mjs                  ad-hoc row-count sanity check against DATABASE_URL
migrations/                       drizzle-kit SQL + meta snapshots
docs/                             longer docs (see below)
SPEC.md, CLAUDE.md, AGENTS.md     original spec; guidance for AI coding agents
```

Conventions: TypeScript strict, `@/*` maps to `src/*`, Tailwind v4 configured in [src/app/globals.css](src/app/globals.css) with no config file, ESLint flat config. Every page sets `export const dynamic = "force-dynamic"` because everything is live data. **There is no test suite**; verify with `npm run lint`, `npx tsc --noEmit`, and by clicking through locally.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server / production build / serve the build |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Apply pending SQL migrations to `DATABASE_URL` |
| `npm run db:generate` | Diff `src/db/*.ts` against the last snapshot and write a new migration. Commit the SQL and the `meta/` files. |
| `npm run db:push` | Alter the database to match the schema with no migration file. Local throwaway databases only. |
| `npm run db:studio` | Drizzle Studio GUI |
| `npm run create-user -- <email> "<name>" <username>` | Invite a user. Username is `^[a-z0-9_-]{3,32}$` and becomes the `/review/ratings/<username>` handle. |
| `npm run run-eval -- --set … --set-version … --model … --inputs file.jsonl` | Ingest an eval run |
| `npm run seed-eval [-- --reset]` | Create or reset the demo eval data |

## Common tasks

**Add a price for a new model.** Edit `MODEL_PRICES` in [src/lib/prices.ts](src/lib/prices.ts) ($ per million tokens, including cache read and cache create) and deploy. Calls already stored keep their old `cost_usd`; new calls are priced at ingest time. Models with no API price (self-hosted) go in `UNPRICED_KNOWN_MODELS` so they are recognised but stay `NULL`.

**Change the schema.** Edit [src/db/schema.ts](src/db/schema.ts), run `npm run db:generate`, review the SQL, commit both the `.sql` and `migrations/meta/*`, then `npm run db:migrate` locally and against production. Additive only; see the writers table at the top.

**Add a dashboard tile.** Write a query in [src/lib/queries.ts](src/lib/queries.ts) that returns plain rows, call it from the page's `Promise.all`, and render it server-side. Only reach for a client component when you need Recharts or interaction (see [src/app/stacked-bar.tsx](src/app/stacked-bar.tsx) and the `row.tsx` files).

**Add a rating surface.** Copy the `/review/group` pattern: a server page that queries, a `"use server"` actions file that validates and upserts keyed on `(thing_id, rater)`, and a client row that calls the action and shows optimistic state.

## Deployment

The app is linked to a Vercel project and clear-pipeline defaults to `https://clear-pipeline-insights.vercel.app`. (SPEC.md and older notes say Railway; Vercel is what is wired up today.) Set every required variable from the table above in the Vercel project, plus `BETTER_AUTH_URL` = the public origin and the Postmark pair if you want real emails. Nothing runs migrations automatically: after merging a migration, run `npm run db:migrate` locally with `DATABASE_URL` pointed at the production database. Ingest requests from the pipeline are unaffected by dashboard auth, so an expired session never drops telemetry.

## Gotchas

- **Next.js 16, not 15.** `package.json` pins Next 16.2 and React 19.2; `SPEC.md` predates that. Route params and `searchParams` are Promises, and middleware lives in `src/proxy.ts`. When in doubt read `node_modules/next/dist/docs/`.
- **Eval rows count as spend.** `env='offline-eval'` runs show on the cost dashboard unless you filter by env. A default prod-only filter is on the wish list.
- **Runs are per env, not per restart.** Because the live pipeline never closes runs, "top runs" on the dashboard is effectively "top envs" until that changes.
- **`db:push` will happily alter a real database.** Use it only on a local scratch DB.
- **Magic links expire in 5 minutes** and Better Auth caches its config on first request, so restart `npm run dev` after changing auth or Postmark variables.
- **`.env.example` is committed on purpose**; every other `.env*` file is ignored. Never put real values in the example.

## Where work is tracked

Tickets for this repo live in Exponential under workspace `syntrofi`, product `clear-pipeline` (this is the one CLEAR project not under the `clear` workspace). Conventions are in [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md). The `.beads/` directory is an older local tracker; its open items are mostly the "warts" listed at the end of [docs/eval-harness.md](docs/eval-harness.md) and are not the team's source of truth.

## Further reading

- [docs/local-development.md](docs/local-development.md): first-time setup, Postmark, database operations, error-by-error troubleshooting.
- [docs/eval-harness.md](docs/eval-harness.md): why the eval harness lives here, the eval tables, write and read paths, what is not built yet.
- [docs/review-strategy.md](docs/review-strategy.md): the thinking behind call-level vs cluster-level review and why ratings live in this repo rather than clear-api.
- [SPEC.md](SPEC.md): the original Phase 1 spec. Useful for the API contract's origin; superseded on scope and hosting.
- [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md): instructions for AI coding agents working in this repo.
