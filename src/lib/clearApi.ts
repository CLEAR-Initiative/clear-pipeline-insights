// Minimal GraphQL client for clear-api. Server-only.
// Env:
//   CLEAR_API_URL       e.g. http://localhost:4000/graphql
//   CLEAR_API_TOKEN     Bearer sk_live_... from a dedicated service user
//   CLEAR_API_TEAM_ID   optional — omit when the service user is admin

type GraphQLError = {
  message: string;
  path?: unknown;
  extensions?: Record<string, unknown>;
};

export class ClearApiError extends Error {
  constructor(
    message: string,
    public readonly errors?: GraphQLError[],
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ClearApiError";
  }
}

function requireEnv(): { url: string; token: string; teamId: string | null } {
  const url = process.env.CLEAR_API_URL;
  const token = process.env.CLEAR_API_TOKEN;
  if (!url) throw new ClearApiError("CLEAR_API_URL is not set");
  if (!token) throw new ClearApiError("CLEAR_API_TOKEN is not set");
  return {
    url,
    token,
    teamId: process.env.CLEAR_API_TEAM_ID?.trim() || null,
  };
}

export async function clearApiQuery<T>(
  query: string,
  variables: Record<string, unknown> = {},
  opts: { timeoutMs?: number } = {},
): Promise<T> {
  const { url, token } = requireEnv();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new ClearApiError(
        `clear-api HTTP ${res.status}: ${await res.text().catch(() => "")}`,
        undefined,
        res.status,
      );
    }
    const body = (await res.json()) as { data?: T; errors?: GraphQLError[] };
    if (body.errors && body.errors.length > 0) {
      throw new ClearApiError(
        `clear-api GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`,
        body.errors,
      );
    }
    if (body.data === undefined) {
      throw new ClearApiError("clear-api returned no data");
    }
    return body.data;
  } finally {
    clearTimeout(timer);
  }
}

// --- Typed query: recent events with members ---

export type ClearApiSignal = {
  id: string;
  title: string | null;
  description: string | null;
  url: string | null;
  publishedAt: string;
  collectedAt: string;
  source: { id: string; name: string } | null;
};

export type ClearApiEvent = {
  id: string;
  title: string | null;
  description: string | null;
  types: string[];
  rank: number | null;
  validFrom: string;
  validTo: string;
  firstSignalCreatedAt: string;
  lastSignalCreatedAt: string;
  populationAffected: string | null;
  originLocation: { id: string } | null;
  destinationLocation: { id: string } | null;
  generalLocation: { id: string } | null;
  signals: ClearApiSignal[];
};

const EVENTS_QUERY = /* GraphQL */ `
  query InsightsEvents($teamId: String) {
    events(teamId: $teamId) {
      id
      title
      description
      types
      rank
      validFrom
      validTo
      firstSignalCreatedAt
      lastSignalCreatedAt
      populationAffected
      originLocation { id }
      destinationLocation { id }
      generalLocation { id }
      signals {
        id
        title
        description
        url
        publishedAt
        collectedAt
        source { id name }
      }
    }
  }
`;

/**
 * Fetch events from clear-api, filter client-side by `validFrom >= sinceIso`,
 * sort desc, take up to `limit`. Client-side filtering is a temporary shim —
 * clear-api has no pagination or date filter yet (see bead `-l6p`).
 */
export async function fetchRecentEvents(params: {
  sinceIso: string;
  limit: number;
}): Promise<{ events: ClearApiEvent[]; teamId: string | null }> {
  const { teamId } = requireEnv();
  const data = await clearApiQuery<{ events: ClearApiEvent[] }>(EVENTS_QUERY, {
    teamId,
  });
  const since = new Date(params.sinceIso).getTime();
  const events = data.events
    .filter((e) => new Date(e.validFrom).getTime() >= since)
    .sort(
      (a, b) => new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime(),
    )
    .slice(0, params.limit);
  return { events, teamId };
}
