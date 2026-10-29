# Contributing to clear-pipeline-insights

Thanks for helping. This repo is the LLM-call observability dashboard and ingest API for `clear-pipeline`. The [README](README.md) explains what it is and how it fits together; this file covers how to get set up and how to get a change merged.

## Two ways in

### Explore on your own (no account needed)

You can run the whole app locally without anything from the team. You need Node 20+ and a local Postgres 14+.

```bash
git clone https://github.com/CLEAR-Initiative/clear-pipeline-insights.git
cd clear-pipeline-insights
cp .env.example .env.local
```

Edit `.env.local`:

- `DATABASE_URL`: point it at a new, empty local database.
- `INSIGHTS_INGEST_TOKEN` and `BETTER_AUTH_SECRET`: generate each with `openssl rand -hex 32`.
- Leave `BETTER_AUTH_URL` as `http://localhost:3000`.
- Leave the Postmark and `CLEAR_API_*` lines blank.

Then:

```bash
createdb clear_pipeline_insights                          # or the name you put in DATABASE_URL
npm install
npm run db:migrate                                        # applies every migration under migrations/
npm run create-user -- you@example.com "Your Name" you    # the app is invite-only; this is your invite
npm run seed-eval                                         # optional: demo eval data so /eval isn't empty
npm run dev                                               # http://localhost:3000
```

Open http://localhost:3000 and you are sent to `/sign-in`. Enter the email you just created. With no Postmark configured, the app does not send email. It prints the magic link in the `npm run dev` terminal as a `[magic-link]` line. Paste that URL into your browser and you are signed in. Links expire after 5 minutes.

`npm run db:push` also exists, but it alters the database directly with no migration file. Only use it on a throwaway local database, never anywhere else.

The cost dashboard stays empty until something posts calls. The README's [How data gets in](README.md#how-data-gets-in) section has two `curl` requests that send a run and a call using your local token. [docs/local-development.md](docs/local-development.md) has a troubleshooting list.

**What needs credentials from the team**

| Variable | What it's for | Without it |
| --- | --- | --- |
| `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM` | Sending magic-link emails | Links are printed to the dev server terminal instead. Local sign-in works fine. |
| `CLEAR_API_URL`, `CLEAR_API_TOKEN`, `CLEAR_API_TEAM_ID` | The "Import" button on `/review/events`, which reads events and signals from clear-api | Import fails with "CLEAR_API_TOKEN is not set". Every other page works. You can also point these at a clear-api you run yourself. |
| `INSIGHTS_INGEST_TOKEN` for the deployed app | Sending telemetry to the shared instance | Not needed locally. Generate your own token for your own server. |

### Join the team

1. Register at https://api.clearinitiative.io/portal/login.
2. The team will get in touch with next steps, including access to the tracker and any dev credentials you need. Credentials are shared privately.

Never ask for credentials in an issue or a pull request.

## Making a change

**Branches and PRs.** Branch off `main` and open your pull request against `main`. There are no long-lived branches.

**Checks to run before pushing.** There is no CI workflow in this repo and no test suite. Run these locally:

```bash
npm run lint        # ESLint
npx tsc --noEmit    # type check
npm run build       # the same Next.js build Vercel runs on your PR
```

Then click through the pages you touched with `npm run dev`. Every pull request also gets a Vercel preview build, which shows up as checks on the PR.

**Commit messages.** The history uses [Conventional Commits](https://www.conventionalcommits.org/): `feat(dashboard): …`, `fix(auth): …`, `docs: …`, `chore: …`. Please follow the same style.

**Review.** A maintainer reviews and merges. Vercel's GitHub integration posts its build and review checks on the PR, but nothing merges automatically.

**The contract rule.** Several repos write to this app, so these are shared contracts:

- the `llm_call` and `pipeline_run` tables, and
- the ingest API: `POST /api/runs`, `POST /api/runs/:id/close`, `POST /api/calls`.

Changes to them are **additive only**. Add nullable columns, new tables, or new optional fields. Never rename or remove a field without coordinating with every writer (see the writers table in the [README](README.md#how-it-fits-together)).

**Schema changes.** Edit `src/db/schema.ts`, run `npm run db:generate`, review the SQL, and commit both the `.sql` file and `migrations/meta/*`. Apply it locally with `npm run db:migrate`. Never edit a committed migration; generate a new one. Nothing runs migrations on deploy, so say in your PR that it adds a migration and the team will apply it to production.

**Where work is tracked.** Tickets for this repo live in Exponential, under a different workspace from the rest of CLEAR: https://www.exponential.im/w/syntrofi/products/clear-pipeline (workspace `syntrofi`, product `clear-pipeline`). Team members get access after registering. Conventions are in [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md). The `.beads/` directory is an older local tracker; its open items are mostly the "warts" listed at the end of [docs/eval-harness.md](docs/eval-harness.md) and are not the team's source of truth.

**Outside contributors.** Small fixes are welcome as pull requests. For anything bigger, register first (see [Join the team](#join-the-team)) so it can be discussed before you build it.

## Environment variables

To add a new variable:

1. Add it to [.env.example](.env.example) with a comment saying what it's for and whether it's optional. Never put a real value there.
2. Add it to the environment variables table in the [README](README.md#environment-variables).
3. Read it with `process.env` where you need it. There is no central env validation module, so handle the unset case yourself (see `requireEnv()` in [src/lib/clearApi.ts](src/lib/clearApi.ts) for the pattern).

The deployed app runs on Vercel, with its Postgres on Railway. Values for the deployed environment are set by the team privately in the Vercel project. If your change adds a variable, say so in the PR so it gets added there before or alongside the merge. Next.js reads env vars at startup, so restart `npm run dev` after editing `.env.local`.

## Secrets

- Never commit `.env`, `.env.local` or any secret. Every `.env*` file except `.env.example` is gitignored.
- Never paste secret values into issues, PRs, chat or AI tools.
- If a secret leaks, tell the team immediately so it can be rotated.
- Credentials only ever come from the team, privately.

## Reporting a security issue

Don't open a public issue. Use GitHub's private vulnerability reporting instead: https://github.com/CLEAR-Initiative/clear-pipeline-insights/security/advisories/new (Security tab, then "Report a vulnerability").

## Licence

clear-pipeline-insights is licensed under the [GNU Affero General Public License v3.0 or later](./LICENSE).
By contributing, you agree your contribution is licensed the same way.
