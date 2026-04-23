import { db } from "@/db/client";
import { llmCall } from "@/db/schema";
import { checkBearer } from "@/lib/auth";
import { computeCost } from "@/lib/prices";

export const dynamic = "force-dynamic";

type CallBody = {
  run_id?: unknown;
  stage?: unknown;
  prompt_version?: unknown;
  model?: unknown;
  signal_id?: unknown;
  event_id?: unknown;
  system_prompt?: unknown;
  user_prompt?: unknown;
  raw_response?: unknown;
  parsed_response?: unknown;
  parse_error?: unknown;
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_read_tokens?: unknown;
  cache_create_tokens?: unknown;
  latency_ms?: unknown;
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

function optString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function optInt(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
}

export async function POST(request: Request) {
  const authError = checkBearer(request);
  if (authError) return authError;

  let body: CallBody;
  try {
    body = (await request.json()) as CallBody;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const runId = reqString(body.run_id, "run_id");
  if (runId instanceof Response) return runId;
  const stage = reqString(body.stage, "stage");
  if (stage instanceof Response) return stage;
  const promptVersion = reqString(body.prompt_version, "prompt_version");
  if (promptVersion instanceof Response) return promptVersion;
  const model = reqString(body.model, "model");
  if (model instanceof Response) return model;
  const systemPrompt = reqString(body.system_prompt, "system_prompt");
  if (systemPrompt instanceof Response) return systemPrompt;
  const userPrompt = reqString(body.user_prompt, "user_prompt");
  if (userPrompt instanceof Response) return userPrompt;
  const rawResponse = reqString(body.raw_response, "raw_response");
  if (rawResponse instanceof Response) return rawResponse;

  const inputTokens = optInt(body.input_tokens);
  const outputTokens = optInt(body.output_tokens);
  const cacheReadTokens = optInt(body.cache_read_tokens);
  const cacheCreateTokens = optInt(body.cache_create_tokens);

  const costUsd = computeCost(model, {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_tokens: cacheReadTokens,
    cache_create_tokens: cacheCreateTokens,
  });

  const parsedResponse =
    body.parsed_response === undefined ? null : body.parsed_response;

  const [inserted] = await db()
    .insert(llmCall)
    .values({
      runId,
      stage,
      promptVersion,
      model,
      signalId: optString(body.signal_id),
      eventId: optString(body.event_id),
      systemPrompt,
      userPrompt,
      rawResponse,
      parsedResponse: parsedResponse as typeof llmCall.$inferInsert.parsedResponse,
      parseError: optString(body.parse_error),
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreateTokens,
      costUsd: costUsd === null ? null : costUsd.toString(),
      latencyMs: optInt(body.latency_ms),
    })
    .returning({ id: llmCall.id });

  return Response.json({ id: inserted.id }, { status: 201 });
}
