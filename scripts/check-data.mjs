// Ad-hoc row-count sanity check. Usage: node scripts/check-data.mjs
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: ['.env.local', '.env'] });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL is not set (checked .env.local and .env)');
  process.exit(1);
}
// sslmode, if needed, is carried in the URL itself.
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
