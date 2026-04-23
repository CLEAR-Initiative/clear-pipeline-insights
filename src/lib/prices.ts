export type ModelPrice = {
  input: number;
  output: number;
  cacheRead?: number;
  cacheCreate?: number;
};

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-sonnet-4-6": { input: 3.0, output: 15.0, cacheRead: 0.3, cacheCreate: 3.75 },
  "claude-opus-4-7": { input: 15.0, output: 75.0, cacheRead: 1.5, cacheCreate: 18.75 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0, cacheRead: 0.1, cacheCreate: 1.25 },
  "nikita-v1": { input: 0, output: 0 },
};

export type Usage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_tokens?: number | null;
  cache_create_tokens?: number | null;
};

export function computeCost(model: string, usage: Usage): number | null {
  const p = MODEL_PRICES[model];
  if (!p) return null;
  const cost =
    ((usage.input_tokens ?? 0) * p.input +
      (usage.output_tokens ?? 0) * p.output +
      (usage.cache_read_tokens ?? 0) * (p.cacheRead ?? 0) +
      (usage.cache_create_tokens ?? 0) * (p.cacheCreate ?? 0)) /
    1_000_000;
  return Number(cost.toFixed(6));
}
