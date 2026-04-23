export function checkBearer(request: Request): Response | null {
  const expected = process.env.INSIGHTS_INGEST_TOKEN;
  if (!expected) {
    return Response.json(
      { error: "server not configured: INSIGHTS_INGEST_TOKEN missing" },
      { status: 500 },
    );
  }
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || !timingSafeEqual(match[1], expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
