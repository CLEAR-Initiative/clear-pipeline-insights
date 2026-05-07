import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: [".env.local", ".env"] });

export default defineConfig({
  schema: ["./src/db/schema.ts", "./src/db/auth-schema.ts"],
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  casing: "snake_case",
});
