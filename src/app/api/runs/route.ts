import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { pipelineRun } from "@/db/schema";
import { checkBearer } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RunBody = {
  name?: unknown;
  env?: unknown;
  pipeline_repo?: unknown;
  git_sha?: unknown;
  config?: unknown;
};

export async function POST(request: Request) {
  const authError = checkBearer(request);
  if (authError) return authError;

  let body: RunBody;
  try {
    body = (await request.json()) as RunBody;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name : null;
  const env = typeof body.env === "string" ? body.env : null;
  const pipelineRepo =
    typeof body.pipeline_repo === "string" ? body.pipeline_repo : null;
  if (!name || !env || !pipelineRepo) {
    return Response.json(
      { error: "name, env, and pipeline_repo are required strings" },
      { status: 400 },
    );
  }

  const gitSha = typeof body.git_sha === "string" ? body.git_sha : null;
  const config =
    body.config && typeof body.config === "object" && !Array.isArray(body.config)
      ? (body.config as Record<string, unknown>)
      : {};

  const existing = await db()
    .select({
      id: pipelineRun.id,
      name: pipelineRun.name,
      startedAt: pipelineRun.startedAt,
    })
    .from(pipelineRun)
    .where(
      and(
        eq(pipelineRun.name, name),
        eq(pipelineRun.env, env),
        eq(pipelineRun.pipelineRepo, pipelineRepo),
        isNull(pipelineRun.endedAt),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const r = existing[0];
    return Response.json({
      id: r.id,
      name: r.name,
      started_at: r.startedAt.toISOString(),
    });
  }

  const [inserted] = await db()
    .insert(pipelineRun)
    .values({ name, env, pipelineRepo, gitSha, config })
    .returning({
      id: pipelineRun.id,
      name: pipelineRun.name,
      startedAt: pipelineRun.startedAt,
    });

  return Response.json(
    {
      id: inserted.id,
      name: inserted.name,
      started_at: inserted.startedAt.toISOString(),
    },
    { status: 201 },
  );
}
