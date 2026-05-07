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
  rater: string;
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
    LEFT JOIN call_rating cr ON cr.call_id = lc.id AND cr.rater = ${params.rater}
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
  rater: string;
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
    LEFT JOIN call_rating cr ON cr.call_id = lc.id AND cr.rater = ${params.rater}
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

export type EvalRunRow = {
  id: string;
  name: string;
  modelId: string | null;
  evalSetName: string | null;
  evalSetVersion: string | null;
  evalSetStage: string | null;
  startedAt: Date;
  endedAt: Date | null;
  callCount: number;
  parseErrorCount: number;
  totalCostUsd: number | null;
  avgLatencyMs: number | null;
};

export async function fetchEvalRuns(): Promise<EvalRunRow[]> {
  const rows = await db().execute<{
    id: string;
    name: string;
    model_id: string | null;
    eval_set_name: string | null;
    eval_set_version: string | null;
    eval_set_stage: string | null;
    started_at: Date;
    ended_at: Date | null;
    call_count: string;
    parse_error_count: string;
    total_cost_usd: string | null;
    avg_latency_ms: string | null;
  }>(sql`
    SELECT
      pr.id,
      pr.name,
      pr.config->>'model_id' AS model_id,
      pr.config->>'eval_set_name' AS eval_set_name,
      pr.config->>'eval_set_version' AS eval_set_version,
      pr.config->>'eval_set_stage' AS eval_set_stage,
      pr.started_at,
      pr.ended_at,
      COUNT(lc.id)::text AS call_count,
      COUNT(lc.id) FILTER (WHERE lc.parse_error IS NOT NULL)::text AS parse_error_count,
      SUM(lc.cost_usd)::text AS total_cost_usd,
      AVG(lc.latency_ms)::text AS avg_latency_ms
    FROM pipeline_run pr
    LEFT JOIN llm_call lc ON lc.run_id = pr.id
    WHERE pr.env = 'offline-eval'
    GROUP BY pr.id
    ORDER BY pr.started_at DESC
    LIMIT 200
  `);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    modelId: r.model_id,
    evalSetName: r.eval_set_name,
    evalSetVersion: r.eval_set_version,
    evalSetStage: r.eval_set_stage,
    startedAt: new Date(r.started_at),
    endedAt: r.ended_at ? new Date(r.ended_at) : null,
    callCount: Number(r.call_count),
    parseErrorCount: Number(r.parse_error_count),
    totalCostUsd: r.total_cost_usd === null ? null : Number(r.total_cost_usd),
    avgLatencyMs: r.avg_latency_ms === null ? null : Number(r.avg_latency_ms),
  }));
}

export type EvalRunCallRow = {
  callId: string;
  signalId: string | null;
  parsedResponse: unknown;
  parseError: string | null;
  latencyMs: number | null;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: Date;
};

export type EvalRunDetail = {
  id: string;
  name: string;
  env: string;
  modelId: string | null;
  evalSetId: string | null;
  evalSetName: string | null;
  evalSetVersion: string | null;
  evalSetStage: string | null;
  description: string | null;
  startedAt: Date;
  endedAt: Date | null;
  gitSha: string | null;
  calls: EvalRunCallRow[];
};

export async function fetchEvalRunDetail(
  runId: string,
): Promise<EvalRunDetail | null> {
  const runRows = await db().execute<{
    id: string;
    name: string;
    env: string;
    model_id: string | null;
    eval_set_id: string | null;
    eval_set_name: string | null;
    eval_set_version: string | null;
    eval_set_stage: string | null;
    description: string | null;
    started_at: Date;
    ended_at: Date | null;
    git_sha: string | null;
  }>(sql`
    SELECT
      pr.id,
      pr.name,
      pr.env,
      pr.config->>'model_id' AS model_id,
      pr.config->>'eval_set_id' AS eval_set_id,
      pr.config->>'eval_set_name' AS eval_set_name,
      pr.config->>'eval_set_version' AS eval_set_version,
      pr.config->>'eval_set_stage' AS eval_set_stage,
      pr.config->>'description' AS description,
      pr.started_at,
      pr.ended_at,
      pr.git_sha
    FROM pipeline_run pr
    WHERE pr.id = ${runId}
    LIMIT 1
  `);
  if (runRows.length === 0) return null;
  const run = runRows[0];

  const callRows = await db().execute<{
    id: string;
    signal_id: string | null;
    parsed_response: unknown;
    parse_error: string | null;
    latency_ms: number | null;
    cost_usd: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    created_at: Date;
  }>(sql`
    SELECT
      lc.id,
      lc.signal_id,
      lc.parsed_response,
      lc.parse_error,
      lc.latency_ms,
      lc.cost_usd,
      lc.input_tokens,
      lc.output_tokens,
      lc.created_at
    FROM llm_call lc
    WHERE lc.run_id = ${runId}
    ORDER BY lc.created_at ASC
    LIMIT 1000
  `);

  return {
    id: run.id,
    name: run.name,
    env: run.env,
    modelId: run.model_id,
    evalSetId: run.eval_set_id,
    evalSetName: run.eval_set_name,
    evalSetVersion: run.eval_set_version,
    evalSetStage: run.eval_set_stage,
    description: run.description,
    startedAt: new Date(run.started_at),
    endedAt: run.ended_at ? new Date(run.ended_at) : null,
    gitSha: run.git_sha,
    calls: callRows.map((c) => ({
      callId: c.id,
      signalId: c.signal_id,
      parsedResponse: c.parsed_response,
      parseError: c.parse_error,
      latencyMs: c.latency_ms,
      costUsd: c.cost_usd === null ? null : Number(c.cost_usd),
      inputTokens: c.input_tokens,
      outputTokens: c.output_tokens,
      createdAt: new Date(c.created_at),
    })),
  };
}

export type ModelDisagreementRow = {
  callId: string;
  runId: string;
  runName: string;
  env: string;
  model: string;
  stage: string;
  promptVersion: string;
  parsedResponse: unknown;
  parseError: string | null;
  latencyMs: number | null;
  costUsd: number | null;
  createdAt: Date;
};

export type ModelDisagreement = {
  signalId: string;
  groundTruth: unknown | null;
  evalSetName: string | null;
  evalSetVersion: string | null;
  rows: ModelDisagreementRow[];
};

export async function fetchModelDisagreement(
  signalId: string,
): Promise<ModelDisagreement> {
  const callRows = await db().execute<{
    call_id: string;
    run_id: string;
    run_name: string;
    env: string;
    model: string;
    stage: string;
    prompt_version: string;
    parsed_response: unknown;
    parse_error: string | null;
    latency_ms: number | null;
    cost_usd: string | null;
    created_at: Date;
  }>(sql`
    SELECT
      lc.id AS call_id,
      lc.run_id,
      pr.name AS run_name,
      pr.env,
      lc.model,
      lc.stage,
      lc.prompt_version,
      lc.parsed_response,
      lc.parse_error,
      lc.latency_ms,
      lc.cost_usd,
      lc.created_at
    FROM llm_call lc
    JOIN pipeline_run pr ON pr.id = lc.run_id
    WHERE lc.signal_id = ${signalId}
    ORDER BY lc.created_at DESC
    LIMIT 100
  `);

  const groundTruthRows = await db().execute<{
    ground_truth: unknown;
    set_name: string;
    set_version: string;
  }>(sql`
    SELECT
      esi.ground_truth,
      es.name AS set_name,
      es.version AS set_version
    FROM evaluation_set_item esi
    JOIN evaluation_set es ON es.id = esi.set_id
    WHERE esi.signal_id = ${signalId}
    ORDER BY esi.created_at DESC
    LIMIT 1
  `);
  const gt = groundTruthRows[0] ?? null;

  return {
    signalId,
    groundTruth: gt ? gt.ground_truth : null,
    evalSetName: gt ? gt.set_name : null,
    evalSetVersion: gt ? gt.set_version : null,
    rows: callRows.map((c) => ({
      callId: c.call_id,
      runId: c.run_id,
      runName: c.run_name,
      env: c.env,
      model: c.model,
      stage: c.stage,
      promptVersion: c.prompt_version,
      parsedResponse: c.parsed_response,
      parseError: c.parse_error,
      latencyMs: c.latency_ms,
      costUsd: c.cost_usd === null ? null : Number(c.cost_usd),
      createdAt: new Date(c.created_at),
    })),
  };
}
