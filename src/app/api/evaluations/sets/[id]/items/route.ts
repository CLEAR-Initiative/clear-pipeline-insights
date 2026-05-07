import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { evaluationSet, evaluationSetItem } from "@/db/schema";
import { checkBearer } from "@/lib/auth";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ItemsBody = {
  items?: unknown;
};

type ItemInput = {
  signal_id?: unknown;
  input_payload?: unknown;
  ground_truth?: unknown;
  notes?: unknown;
};

function isJsonObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = checkBearer(request);
  if (authError) return authError;

  const { id: setId } = await params;
  if (!UUID_RE.test(setId)) {
    return Response.json({ error: "id must be a uuid" }, { status: 400 });
  }

  let body: ItemsBody;
  try {
    body = (await request.json()) as ItemsBody;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return Response.json(
      { error: "items must be a non-empty array" },
      { status: 400 },
    );
  }

  const rawItems = body.items as ItemInput[];
  const rows: typeof evaluationSetItem.$inferInsert[] = [];

  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    if (!isJsonObject(item.input_payload)) {
      return Response.json(
        { error: `items[${i}].input_payload must be an object` },
        { status: 400 },
      );
    }
    if (!isJsonObject(item.ground_truth)) {
      return Response.json(
        { error: `items[${i}].ground_truth must be an object` },
        { status: 400 },
      );
    }
    rows.push({
      setId,
      signalId: typeof item.signal_id === "string" ? item.signal_id : null,
      inputPayload: item.input_payload,
      groundTruth: item.ground_truth,
      notes: typeof item.notes === "string" ? item.notes : null,
    });
  }

  const [setExists] = await db()
    .select({ id: evaluationSet.id })
    .from(evaluationSet)
    .where(eq(evaluationSet.id, setId))
    .limit(1);

  if (!setExists) {
    return Response.json(
      { error: "evaluation set not found" },
      { status: 404 },
    );
  }

  const inserted = await db()
    .insert(evaluationSetItem)
    .values(rows)
    .returning({ id: evaluationSetItem.id });

  return Response.json(
    {
      count: inserted.length,
      ids: inserted.map((r) => r.id),
    },
    { status: 201 },
  );
}
