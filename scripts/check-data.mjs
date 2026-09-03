import postgres from 'postgres';
import { readFileSync } from 'fs';

const envFile = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const dbUrl = envFile.match(/^DATABASE_URL=(.+)$/m)?.[1];
// sslmode is already in the URL
const sql = postgres(dbUrl);

const rows = await sql`
  SELECT 'call_ratings' as t, count(*)::int as n FROM call_rating
  UNION ALL SELECT 'llm_calls', count(*)::int FROM llm_call
  UNION ALL SELECT 'eval_sets', count(*)::int FROM evaluation_set
  UNION ALL SELECT 'eval_items', count(*)::int FROM evaluation_set_item
  UNION ALL SELECT 'event_ratings', count(*)::int FROM event_rating
`;
console.log("=== Table counts ===");
rows.forEach(r => console.log(`  ${r.t}: ${r.n}`));

const rated = await sql`
  SELECT cr.verdict, count(*)::int as n 
  FROM call_rating cr 
  JOIN llm_call lc ON cr.call_id = lc.id 
  GROUP BY cr.verdict ORDER BY n DESC
`;
console.log("\n=== Verdicts on rated calls ===");
if (rated.length === 0) console.log("  (none)");
rated.forEach(r => console.log(`  ${r.verdict}: ${r.n}`));

const stages = await sql`SELECT stage, count(*)::int as n FROM llm_call GROUP BY stage ORDER BY n DESC`;
console.log("\n=== LLM call stages ===");
stages.forEach(r => console.log(`  ${r.stage}: ${r.n}`));

const classifyWithParsed = await sql`
  SELECT count(*)::int as n FROM llm_call 
  WHERE stage = 'classify' AND parsed_response IS NOT NULL
`;
console.log(`\n=== Classify calls with parsed_response: ${classifyWithParsed[0].n} ===`);

// Sample a classify call to see the shape
const sample = await sql`
  SELECT signal_id, parsed_response FROM llm_call 
  WHERE stage = 'classify' AND parsed_response IS NOT NULL 
  LIMIT 2
`;
console.log("\n=== Sample classify parsed_response ===");
sample.forEach(r => console.log(JSON.stringify(r, null, 2)));

await sql.end();
