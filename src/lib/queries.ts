import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";

const envClause = (envs: string[]): SQL =>
  envs.length > 0
    ? sql`AND pr.env IN (${sql.join(
        envs.map((e) => sql`${e}`),
        sql`, `,
      )})`
    : sql``;

export async function fetchAvailableEnvs(): Promise<string[]> {
  const rows = await db().execute<{ env: string }>(
    sql`SELECT DISTINCT env FROM pipeline_run ORDER BY env`,
  );
  return rows.map((r) => r.env);
}

export type HeroStat = {
  current: number;
  prior: number;
  delta: number;
};

export async function fetchHeroStat(
  windowSeconds: number,
  envs: string[] = [],
): Promise<HeroStat> {
  const rows = await db().execute<{ current: string | null; prior: string | null }>(
    sql`
      SELECT
        COALESCE(SUM(CASE
          WHEN lc.created_at >= now() - (${windowSeconds}::int * interval '1 second')
          THEN lc.cost_usd ELSE 0 END), 0) AS current,
        COALESCE(SUM(CASE
          WHEN lc.created_at >= now() - (${windowSeconds * 2}::int * interval '1 second')
           AND lc.created_at <  now() - (${windowSeconds}::int * interval '1 second')
          THEN lc.cost_usd ELSE 0 END), 0) AS prior
      FROM llm_call lc
      JOIN pipeline_run pr ON pr.id = lc.run_id
      WHERE lc.created_at >= now() - (${windowSeconds * 2}::int * interval '1 second')
        ${envClause(envs)}
    `,
  );
  const r = rows[0] ?? { current: "0", prior: "0" };
  const current = Number(r.current ?? 0);
  const prior = Number(r.prior ?? 0);
  return { current, prior, delta: current - prior };
}

export type DailyBreakdownRow = {
  day: string;
  key: string;
  cost: number;
};

export async function fetchDailyByEnv(
  windowSeconds: number,
  envs: string[] = [],
): Promise<DailyBreakdownRow[]> {
  const rows = await db().execute<{ day: Date; key: string; cost: string | null }>(
    sql`
      SELECT
        date_trunc('day', lc.created_at AT TIME ZONE 'UTC')::date AS day,
        pr.env AS key,
        COALESCE(SUM(lc.cost_usd), 0) AS cost
      FROM llm_call lc
      JOIN pipeline_run pr ON pr.id = lc.run_id
      WHERE lc.created_at >= now() - (${windowSeconds}::int * interval '1 second')
        ${envClause(envs)}
      GROUP BY day, pr.env
      ORDER BY day ASC
    `,
  );
  return rows.map((r) => ({
    day: new Date(r.day).toISOString().slice(0, 10),
    key: r.key,
    cost: Number(r.cost ?? 0),
  }));
}

export async function fetchDailyByStage(
  windowSeconds: number,
  envs: string[] = [],
): Promise<DailyBreakdownRow[]> {
  const rows = await db().execute<{ day: Date; key: string; cost: string | null }>(
    sql`
      SELECT
        date_trunc('day', lc.created_at AT TIME ZONE 'UTC')::date AS day,
        lc.stage AS key,
        COALESCE(SUM(lc.cost_usd), 0) AS cost
      FROM llm_call lc
      JOIN pipeline_run pr ON pr.id = lc.run_id
      WHERE lc.created_at >= now() - (${windowSeconds}::int * interval '1 second')
        ${envClause(envs)}
      GROUP BY day, lc.stage
      ORDER BY day ASC
    `,
  );
  return rows.map((r) => ({
    day: new Date(r.day).toISOString().slice(0, 10),
    key: r.key,
    cost: Number(r.cost ?? 0),
  }));
}

export type TopRunRow = {
  id: string;
  name: string;
  env: string;
  model: string;
  calls: number;
  cost: number | null;
  startedAt: string;
};

export async function fetchTopRuns(
  windowSeconds: number,
  limit = 20,
  envs: string[] = [],
): Promise<TopRunRow[]> {
  const rows = await db().execute<{
    id: string;
    name: string;
    env: string;
    model: string;
    calls: string;
    cost: string | null;
    started_at: Date;
  }>(sql`
    SELECT
      pr.id,
      pr.name,
      pr.env,
      mode() WITHIN GROUP (ORDER BY lc.model) AS model,
      COUNT(lc.id)::text AS calls,
      SUM(lc.cost_usd) AS cost,
      pr.started_at
    FROM pipeline_run pr
    JOIN llm_call lc ON lc.run_id = pr.id
    WHERE lc.created_at >= now() - (${windowSeconds}::int * interval '1 second')
      ${envClause(envs)}
    GROUP BY pr.id
    ORDER BY SUM(lc.cost_usd) DESC NULLS LAST
    LIMIT ${limit}
  `);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    env: r.env,
    model: r.model,
    calls: Number(r.calls),
    cost: r.cost === null ? null : Number(r.cost),
    startedAt: new Date(r.started_at).toISOString(),
  }));
}

export type ParseErrorRateRow = {
  stage: string;
  errors: number;
  total: number;
  rate: number;
};

export async function fetchParseErrorRate(
  windowSeconds: number,
  envs: string[] = [],
): Promise<ParseErrorRateRow[]> {
  const rows = await db().execute<{
    stage: string;
    errors: string;
    total: string;
  }>(sql`
    SELECT
      lc.stage,
      COUNT(*) FILTER (WHERE lc.parse_error IS NOT NULL)::text AS errors,
      COUNT(*)::text AS total
    FROM llm_call lc
    JOIN pipeline_run pr ON pr.id = lc.run_id
    WHERE lc.created_at >= now() - (${windowSeconds}::int * interval '1 second')
      ${envClause(envs)}
    GROUP BY lc.stage
    ORDER BY lc.stage
  `);
  return rows.map((r) => {
    const errors = Number(r.errors);
    const total = Number(r.total);
    return {
      stage: r.stage,
      errors,
      total,
      rate: total > 0 ? errors / total : 0,
    };
  });
}

export type LatencyByStageRow = {
  stage: string;
  calls: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
};

export async function fetchLatencyByStage(
  windowSeconds: number,
  envs: string[] = [],
): Promise<LatencyByStageRow[]> {
  const rows = await db().execute<{
    stage: string;
    calls: string;
    p50: number | null;
    p95: number | null;
    p99: number | null;
  }>(sql`
    SELECT
      lc.stage,
      COUNT(*)::text AS calls,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY lc.latency_ms)::int AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY lc.latency_ms)::int AS p95,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY lc.latency_ms)::int AS p99
    FROM llm_call lc
    JOIN pipeline_run pr ON pr.id = lc.run_id
    WHERE lc.latency_ms IS NOT NULL
      AND lc.created_at >= now() - (${windowSeconds}::int * interval '1 second')
      ${envClause(envs)}
    GROUP BY lc.stage
    ORDER BY lc.stage
  `);
  return rows.map((r) => ({
    stage: r.stage,
    calls: Number(r.calls),
    p50: r.p50 === null ? null : Number(r.p50),
    p95: r.p95 === null ? null : Number(r.p95),
    p99: r.p99 === null ? null : Number(r.p99),
  }));
}

export type CacheStatsRow = {
  model: string;
  input: number;
  cacheRead: number;
  cacheCreate: number;
};

export async function fetchCacheStats(
  windowSeconds: number,
  envs: string[] = [],
): Promise<CacheStatsRow[]> {
  const rows = await db().execute<{
    model: string;
    input: string | null;
    cache_read: string | null;
    cache_create: string | null;
  }>(sql`
    SELECT
      lc.model,
      SUM(lc.input_tokens) AS input,
      SUM(lc.cache_read_tokens) AS cache_read,
      SUM(lc.cache_create_tokens) AS cache_create
    FROM llm_call lc
    JOIN pipeline_run pr ON pr.id = lc.run_id
    WHERE lc.created_at >= now() - (${windowSeconds}::int * interval '1 second')
      ${envClause(envs)}
    GROUP BY lc.model
  `);
  return rows.map((r) => ({
    model: r.model,
    input: Number(r.input ?? 0),
    cacheRead: Number(r.cache_read ?? 0),
    cacheCreate: Number(r.cache_create ?? 0),
  }));
}

export type ModelSeenRow = {
  model: string;
  calls: number;
  cost: number | null;
};

export type GroupCallReviewRow = {
  callId: string;
  createdAt: string;
  env: string;
  promptVersion: string;
  model: string;
  signalId: string | null;
  eventId: string | null;
  parsedResponse: unknown;
  parseError: string | null;
  userPrompt: string;
  rawResponse: string;
  verdict: string | null;
  confidence: number | null;
  notes: string | null;
  ratingCreatedAt: string | null;
};

export async function fetchGroupCallsForReview(params: {
  envs: string[];
  fromSeconds: number;
  unratedOnly: boolean;
  promptVersion?: string | null;
  limit: number;
}): Promise<GroupCallReviewRow[]> {
  const envClauseLocal =
    params.envs.length > 0
      ? sql`AND pr.env IN (${sql.join(
          params.envs.map((e) => sql`${e}`),
          sql`, `,
        )})`
      : sql``;
  const unratedClause = params.unratedOnly ? sql`AND cr.id IS NULL` : sql``;
  const promptClause = params.promptVersion
    ? sql`AND lc.prompt_version = ${params.promptVersion}`
    : sql``;

  const rows = await db().execute<{
    call_id: string;
    created_at: Date;
    env: string;
    prompt_version: string;
    model: string;
    signal_id: string | null;
    event_id: string | null;
    parsed_response: unknown;
    parse_error: string | null;
    user_prompt: string;
    raw_response: string;
    verdict: string | null;
    confidence: number | null;
    notes: string | null;
    rating_created_at: Date | null;
  }>(sql`
    SELECT
      lc.id AS call_id,
      lc.created_at,
      pr.env,
      lc.prompt_version,
      lc.model,
      lc.signal_id,
      lc.event_id,
      lc.parsed_response,
      lc.parse_error,
      lc.user_prompt,
      lc.raw_response,
      cr.verdict,
      cr.confidence,
      cr.notes,
      cr.created_at AS rating_created_at
    FROM llm_call lc
    JOIN pipeline_run pr ON pr.id = lc.run_id
    LEFT JOIN call_rating cr ON cr.call_id = lc.id AND cr.rater = 'james'
    WHERE lc.stage = 'group'
      AND lc.created_at >= now() - (${params.fromSeconds}::int * interval '1 second')
      ${envClauseLocal}
      ${promptClause}
      ${unratedClause}
    ORDER BY lc.created_at DESC
    LIMIT ${params.limit}
  `);

  return rows.map((r) => ({
    callId: r.call_id,
    createdAt: new Date(r.created_at).toISOString(),
    env: r.env,
    promptVersion: r.prompt_version,
    model: r.model,
    signalId: r.signal_id,
    eventId: r.event_id,
    parsedResponse: r.parsed_response,
    parseError: r.parse_error,
    userPrompt: r.user_prompt,
    rawResponse: r.raw_response,
    verdict: r.verdict,
    confidence: r.confidence === null ? null : Number(r.confidence),
    notes: r.notes,
    ratingCreatedAt:
      r.rating_created_at === null
        ? null
        : new Date(r.rating_created_at).toISOString(),
  }));
}

export type GroupReviewCounts = {
  total: number;
  unrated: number;
};

export async function fetchGroupReviewCounts(params: {
  envs: string[];
  fromSeconds: number;
  promptVersion?: string | null;
}): Promise<GroupReviewCounts> {
  const envClauseLocal =
    params.envs.length > 0
      ? sql`AND pr.env IN (${sql.join(
          params.envs.map((e) => sql`${e}`),
          sql`, `,
        )})`
      : sql``;
  const promptClause = params.promptVersion
    ? sql`AND lc.prompt_version = ${params.promptVersion}`
    : sql``;

  const rows = await db().execute<{ total: string; unrated: string }>(sql`
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE cr.id IS NULL)::text AS unrated
    FROM llm_call lc
    JOIN pipeline_run pr ON pr.id = lc.run_id
    LEFT JOIN call_rating cr ON cr.call_id = lc.id AND cr.rater = 'james'
    WHERE lc.stage = 'group'
      AND lc.created_at >= now() - (${params.fromSeconds}::int * interval '1 second')
      ${envClauseLocal}
      ${promptClause}
  `);
  const r = rows[0] ?? { total: "0", unrated: "0" };
  return { total: Number(r.total), unrated: Number(r.unrated) };
}

export async function fetchGroupPromptVersions(
  fromSeconds: number,
): Promise<string[]> {
  const rows = await db().execute<{ prompt_version: string }>(sql`
    SELECT DISTINCT prompt_version
    FROM llm_call
    WHERE stage = 'group'
      AND created_at >= now() - (${fromSeconds}::int * interval '1 second')
    ORDER BY prompt_version
  `);
  return rows.map((r) => r.prompt_version);
}

export async function fetchModelsSeen(
  windowSeconds: number,
  envs: string[] = [],
): Promise<ModelSeenRow[]> {
  const rows = await db().execute<{
    model: string;
    calls: string;
    cost: string | null;
  }>(sql`
    SELECT
      lc.model,
      COUNT(*)::text AS calls,
      SUM(lc.cost_usd) AS cost
    FROM llm_call lc
    JOIN pipeline_run pr ON pr.id = lc.run_id
    WHERE lc.created_at >= now() - (${windowSeconds}::int * interval '1 second')
      ${envClause(envs)}
    GROUP BY lc.model
    ORDER BY COUNT(*) DESC
  `);
  return rows.map((r) => ({
    model: r.model,
    calls: Number(r.calls),
    cost: r.cost === null ? null : Number(r.cost),
  }));
}
