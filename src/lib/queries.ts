import { sql } from "drizzle-orm";
import { db } from "@/db/client";

export type HeroStat = {
  last24h: number;
  prior24h: number;
  delta: number;
};

export async function fetchHeroStat(): Promise<HeroStat> {
  const rows = await db().execute<{ last_24h: string | null; prior_24h: string | null }>(
    sql`
      SELECT
        COALESCE(SUM(CASE WHEN created_at >= now() - interval '24 hours' THEN cost_usd ELSE 0 END), 0) AS last_24h,
        COALESCE(SUM(CASE
          WHEN created_at >= now() - interval '48 hours'
           AND created_at <  now() - interval '24 hours'
          THEN cost_usd ELSE 0 END), 0) AS prior_24h
      FROM llm_call
      WHERE created_at >= now() - interval '48 hours'
    `,
  );
  const r = rows[0] ?? { last_24h: "0", prior_24h: "0" };
  const last24h = Number(r.last_24h ?? 0);
  const prior24h = Number(r.prior_24h ?? 0);
  return { last24h, prior24h, delta: last24h - prior24h };
}

export type DailyBreakdownRow = {
  day: string;
  key: string;
  cost: number;
};

export async function fetchDailyByEnv(days: number): Promise<DailyBreakdownRow[]> {
  const rows = await db().execute<{ day: Date; key: string; cost: string | null }>(
    sql`
      SELECT
        date_trunc('day', lc.created_at AT TIME ZONE 'UTC')::date AS day,
        pr.env AS key,
        COALESCE(SUM(lc.cost_usd), 0) AS cost
      FROM llm_call lc
      JOIN pipeline_run pr ON pr.id = lc.run_id
      WHERE lc.created_at >= now() - (${days}::int * interval '1 day')
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

export async function fetchDailyByStage(days: number): Promise<DailyBreakdownRow[]> {
  const rows = await db().execute<{ day: Date; key: string; cost: string | null }>(
    sql`
      SELECT
        date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
        stage AS key,
        COALESCE(SUM(cost_usd), 0) AS cost
      FROM llm_call
      WHERE created_at >= now() - (${days}::int * interval '1 day')
      GROUP BY day, stage
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

export async function fetchTopRuns(days: number, limit = 20): Promise<TopRunRow[]> {
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
    WHERE lc.created_at >= now() - (${days}::int * interval '1 day')
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

export type ModelSeenRow = {
  model: string;
  calls: number;
  cost: number | null;
};

export async function fetchModelsSeen(days: number): Promise<ModelSeenRow[]> {
  const rows = await db().execute<{
    model: string;
    calls: string;
    cost: string | null;
  }>(sql`
    SELECT
      model,
      COUNT(*)::text AS calls,
      SUM(cost_usd) AS cost
    FROM llm_call
    WHERE created_at >= now() - (${days}::int * interval '1 day')
    GROUP BY model
    ORDER BY COUNT(*) DESC
  `);
  return rows.map((r) => ({
    model: r.model,
    calls: Number(r.calls),
    cost: r.cost === null ? null : Number(r.cost),
  }));
}
