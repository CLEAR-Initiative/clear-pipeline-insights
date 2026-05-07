import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { pipelineRun } from "@/db/schema";
import { checkBearer } from "@/lib/auth";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = checkBearer(request);
  if (authError) return authError;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "id must be a uuid" }, { status: 400 });
  }

  const [updated] = await db()
    .update(pipelineRun)
    .set({ endedAt: new Date() })
    .where(and(eq(pipelineRun.id, id), isNull(pipelineRun.endedAt)))
    .returning({ id: pipelineRun.id, endedAt: pipelineRun.endedAt });

  if (updated && updated.endedAt) {
    return Response.json({
      id: updated.id,
      ended_at: updated.endedAt.toISOString(),
    });
  }

  const [existing] = await db()
    .select({ id: pipelineRun.id, endedAt: pipelineRun.endedAt })
    .from(pipelineRun)
    .where(eq(pipelineRun.id, id))
    .limit(1);

  if (!existing) {
    return Response.json({ error: "run not found" }, { status: 404 });
  }

  return Response.json({
    id: existing.id,
    ended_at: existing.endedAt ? existing.endedAt.toISOString() : null,
  });
}
