# Local development

First-time setup, the auth model, and the operational gotchas that surface when you try to run this app end-to-end on a fresh machine.

## Prerequisites

- Node 20+ (matches `@types/node@^20`)
- Postgres 14+ running locally on `:5432` (Homebrew, Docker, or whatever you use)
- A Postmark account if you want real magic-link emails (optional in dev)

## First-time setup

```bash
git clone <this repo>
cd clear-pipeline-insights
cp .env.example .env.local
```

Edit `.env.local` and set:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/clear_pipeline_insights
INSIGHTS_INGEST_TOKEN=<openssl rand -hex 32>
BETTER_AUTH_SECRET=<openssl rand -hex 32>
BETTER_AUTH_URL=http://localhost:3000
```

Then:

```bash
createdb clear_pipeline_insights      # or whatever DB name you used in DATABASE_URL
npm install
npm run db:migrate                     # applies all migrations under migrations/
npm run create-user -- you@example.com "Your Name" yourhandle
npm run dev
```

Open http://localhost:3000. The proxy will redirect to `/sign-in`. Type the email you just registered, click submit, then check the dev server terminal for a line like:

```
[magic-link] to=you@example.com url=http://localhost:3000/api/auth/magic-link/verify?token=...
```

Copy that URL into your browser to complete sign-in.

## Auth model

The dashboard is **invite-only**. There's no sign-up form. Users are created by an admin running `npm run create-user`, and existing users sign in via magic link.

- Cookie-auth pages (`/`, `/live`, `/review/*`, `/eval/*`, etc.) are gated by [src/proxy.ts](../src/proxy.ts), which redirects to `/sign-in` if no session cookie.
- Bearer-auth ingest routes (`/api/calls`, `/api/runs`, `/api/runs/:id/close`, `/api/evaluations/*`) are explicitly exempted from the proxy — never gated by cookies.
- `disableSignUp: true` in [src/lib/better-auth.ts](../src/lib/better-auth.ts) means submitting a magic-link form for an unrecognised email gets bounced with `error=new_user_signup_disabled`. Add the user via `create-user` first, then sign in.

### Creating users

```bash
npm run create-user -- <email> "<full name>" <username>
```

- `<username>` must match `^[a-z0-9_-]{3,32}$`. It becomes the URL handle for `/review/ratings/<username>`.
- Re-running with an email that already exists is a no-op (returns the existing UUID).
- A username collision with a *different* email errors out — pick a different username.

Optional `--backfill-rater=<old-rater-id>` migrates rows in `event_rating` and `call_rating` from a legacy string rater (e.g. `'james'`) to the new user's UUID. Only relevant if you have rating rows that predate Better Auth.

## Magic-link delivery

Two modes, controlled by env vars:

### Console fallback (default)

If `POSTMARK_SERVER_TOKEN` is unset, magic links are `console.log`-ed to the dev server terminal. Copy/paste the URL into your browser. Fine for local dev, useless in prod.

### Postmark

Set `POSTMARK_SERVER_TOKEN` and `POSTMARK_FROM` in `.env.local` and emails go through Postmark.

**Setup:**

1. Sign in to [postmarkapp.com](https://postmarkapp.com) → open or create a Server.
2. **API Tokens** → copy the **Server API token** (UUID-shaped).
3. **Sender Signatures** → add an email address you control → click the confirmation link Postmark sends. Use that exact address as `POSTMARK_FROM`. Or verify a whole domain via DKIM + Return-Path DNS records — more setup, lets you send from any address at that domain.
4. New Postmark accounts run in **Approval Pending** state and can only send to addresses on the team. Submit the approval form (Postmark dashboard banner) to send to arbitrary recipients.

**`.env.local`:**
```
POSTMARK_SERVER_TOKEN=<your-server-token>
POSTMARK_FROM=Clear Insights <you@yourdomain.com>
```

`POSTMARK_FROM` accepts either bare email or `Display Name <email>` format. The email portion must match a verified sender signature.

**Smoke test independent of the auth flow:**

```bash
curl -s -X POST https://api.postmarkapp.com/email \
  -H "Accept: application/json" -H "Content-Type: application/json" \
  -H "X-Postmark-Server-Token: $POSTMARK_SERVER_TOKEN" \
  -d "{\"From\":\"$POSTMARK_FROM\",\"To\":\"$POSTMARK_FROM\",\"Subject\":\"smoke\",\"TextBody\":\"hi\",\"MessageStream\":\"outbound\"}"
```

`200` with a `MessageID` means credentials work. `422` usually means the From address isn't a verified sender signature.

After any change to `POSTMARK_*` env vars, restart the dev server — Better Auth caches its config on first request.

## Database operations

| Need to... | Command |
| --- | --- |
| Apply pending migrations | `npm run db:migrate` |
| Generate a new migration after editing `src/db/schema.ts` | `npm run db:generate` (then commit the generated SQL + meta files) |
| Push schema diffs without a migration (dev only — never in prod) | `npm run db:push` |
| Open a GUI to browse the DB | `npm run db:studio` |

Drizzle reads `DATABASE_URL` from `.env.local` per [drizzle.config.ts](../drizzle.config.ts). The schema files are `src/db/schema.ts` (insights data) and `src/db/auth-schema.ts` (Better Auth tables).

### Migrations are append-only

Existing migration files (`migrations/0000_*.sql` onward) ship the production schema. **Never edit a committed migration** — generate a new one instead. The `migrations/meta/_journal.json` and per-migration snapshot files track what's been applied; editing them by hand will desync drizzle-kit.

If you need to roll back during dev: drop the DB and `npm run db:migrate` from scratch.

## Testing the eval flow

After first-time setup:

```bash
npm run seed-eval         # creates sitrep-classify-demo@v1 with 5 items + 2 sample runs
npm run dev
```

Open http://localhost:3000/eval — you should see two runs (claude-sonnet-4-6 and gemma-3-27b-instruct). Click `s-002` or `s-004` from a run's call list to see baked-in disagreement.

`npm run seed-eval -- --reset` wipes the demo data before reseeding.

For ingesting your own model outputs, see [docs/eval-harness.md](eval-harness.md).

## Common errors

### `ECONNREFUSED` on any DB operation
Postgres isn't running. Start it (`brew services start postgresql@16`, `docker compose up -d`, etc.) and verify with `psql "$DATABASE_URL" -c '\l'`.

### `npm run db:migrate` runs but prints no success line
It probably failed silently (drizzle-kit isn't loud). Verify the migration applied:
```bash
psql "$DATABASE_URL" -c '\dt'    # should list pipeline_run, llm_call, evaluation_*, user, ... 
```
If empty, retry with Postgres confirmed up.

### `invalid input syntax for type uuid: "<32-char-string>"` on sign-in
Pre-existing bug; fixed by setting `advanced.database.generateId: () => crypto.randomUUID()` in [src/lib/better-auth.ts](../src/lib/better-auth.ts). If you see this, your local copy is missing that config — pull and re-merge.

### Sign-in page shows `error=new_user_signup_disabled`
Magic link delivery worked, but the email isn't in the `user` table. Either sign in as a registered email or run `npm run create-user` for the email you want.

### `Postmark send failed: 422 ... is not a Sender Signature`
`POSTMARK_FROM` doesn't match a verified sender signature on your Postmark account. Verify the address in Postmark's dashboard (or unset the env vars to fall back to console logging).

### `duplicate key value violates unique constraint "user_username_unique"`
Username collision. Pick a different one.

### Port 3000 in use
Another `next dev` is already running. Kill it (the dev server output shows the PID) or use the new port (3001/3002/etc.) it bound to instead.

### TopNav shows nothing / sign-out loops
Session cookie was set with stale config (e.g. before the auth UUID fix). Clear cookies for `localhost:3000` and re-sign-in.

## Things to know

- **Two writers, one schema.** Both `clear-pipeline` (live pipeline) and the eval CLI in this repo write to `pipeline_run` + `llm_call`. The schema is the contract; additive changes only.
- **`db:push` will surprise you.** It reconciles the schema by ALTERing your DB to match `src/db/schema.ts` directly. Useful for fast local iteration; never run against prod, and prefer `db:generate` + `db:migrate` for anything that needs to ship.
- **The dev console is your friend.** Server-component errors, magic-link URLs, ingest validation errors — all show up in the terminal running `npm run dev`. If something fails silently in the UI, look there first.
- **`.env.local` doesn't hot-reload.** Next loads env vars at startup. Edit and restart.
