"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { callRating, VERDICTS, type Verdict } from "@/db/schema";

const VERDICT_SET = new Set<string>(VERDICTS);

function isVerdict(v: string): v is Verdict {
  return VERDICT_SET.has(v);
}

export async function saveRating(input: {
  callId: string;
  verdict: string;
  confidence?: number | null;
  notes?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.callId || typeof input.callId !== "string") {
    return { ok: false, error: "callId required" };
  }
  if (!isVerdict(input.verdict)) {
    return { ok: false, error: `invalid verdict: ${input.verdict}` };
  }
  const confidence =
    input.confidence == null
      ? null
      : Math.max(1, Math.min(5, Math.trunc(input.confidence)));
  const notes = input.notes?.trim() ? input.notes.trim() : null;
  const rater = "james";

  const existing = await db()
    .select({ id: callRating.id })
    .from(callRating)
    .where(and(eq(callRating.callId, input.callId), eq(callRating.rater, rater)))
    .limit(1);

  if (existing.length > 0) {
    await db()
      .update(callRating)
      .set({ verdict: input.verdict, confidence, notes, createdAt: new Date() })
      .where(eq(callRating.id, existing[0].id));
  } else {
    await db().insert(callRating).values({
      callId: input.callId,
      rater,
      verdict: input.verdict,
      confidence,
      notes,
    });
  }

  revalidatePath("/review/group");
  return { ok: true };
}
