import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  var __pgClient: ReturnType<typeof postgres> | undefined;
  var __drizzleDb: DrizzleDb | undefined;
}

export function db(): DrizzleDb {
  if (!globalThis.__drizzleDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const client = globalThis.__pgClient ?? postgres(url, { prepare: false });
    globalThis.__pgClient = client;
    globalThis.__drizzleDb = drizzle(client, { schema, casing: "snake_case" });
  }
  return globalThis.__drizzleDb;
}
