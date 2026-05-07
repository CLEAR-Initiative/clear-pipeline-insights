import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { evaluationSet } from "@/db/schema";
import { checkBearer } from "@/lib/auth";

export const dynamic = "force-dynamic";

type SetBody = {
  name?: unknown;
  version?: unknown;
  stage?: unknown;
  description?: unknown;
};

function reqString(v: unknown, field: string): string | Response {
  if (typeof v !== "string" || v.length === 0) {
    return Response.json(
      { error: `${field} is required` },
      { status: 400 },
    );
  }
  return v;
}

export async function POST(request: Request) {
  const authError = checkBearer(request);
  if (authError) return authError;

  let body: SetBody;
  try {
    body = (await request.json()) as SetBody;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const name = reqString(body.name, "name");
  if (name instanceof Response) return name;
  const version = reqString(body.version, "version");
  if (version instanceof Response) return version;
  const stage = reqString(body.stage, "stage");
  if (stage instanceof Response) return stage;

  const description =
    typeof body.description === "string" ? body.description : null;

  const existing = await db()
    .select({
      id: evaluationSet.id,
      name: evaluationSet.name,
      version: evaluationSet.version,
      stage: evaluationSet.stage,
      createdAt: evaluationSet.createdAt,
    })
    .from(evaluationSet)
    .where(
      and(eq(evaluationSet.name, name), eq(evaluationSet.version, version)),
    )
    .limit(1);

  if (existing.length > 0) {
    const r = existing[0];
    return Response.json({
      id: r.id,
      name: r.name,
      version: r.version,
      stage: r.stage,
      created_at: r.createdAt.toISOString(),
    });
  }

  const [inserted] = await db()
    .insert(evaluationSet)
    .values({ name, version, stage, description })
    .returning({
      id: evaluationSet.id,
      name: evaluationSet.name,
      version: evaluationSet.version,
      stage: evaluationSet.stage,
      createdAt: evaluationSet.createdAt,
    });

  return Response.json(
    {
      id: inserted.id,
      name: inserted.name,
      version: inserted.version,
      stage: inserted.stage,
      created_at: inserted.createdAt.toISOString(),
    },
    { status: 201 },
  );
}
