/**
 * Invite-only user bootstrap.
 *
 * Usage:
 *   tsx scripts/create-user.ts <email> <name> <username> [--backfill-rater=<old>]
 *
 * Inserts a Better Auth user row directly in the insights DB. The new user
 * gets a fresh UUID and can immediately sign in via magic link (no extra steps).
 *
 * --backfill-rater=<old>  Optional. After insert, runs:
 *   UPDATE event_rating SET rater = <new-uuid> WHERE rater = <old>;
 *   UPDATE call_rating  SET rater = <new-uuid> WHERE rater = <old>;
 * Used once to migrate existing rater='james' rows to James's UUID.
 */

import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: [".env.local", ".env"] });

import { db } from "../src/db/client";
import { user as userTable } from "../src/db/auth-schema";
import { callRating, eventRating } from "../src/db/schema";

const USERNAME_RE = /^[a-z0-9_-]{3,32}$/;

async function main() {
  const args = process.argv.slice(2);
  const flagIndex = args.findIndex((a) => a.startsWith("--backfill-rater="));
  const backfillFrom =
    flagIndex >= 0 ? args[flagIndex].split("=")[1] : null;
  const positional = args.filter((a) => !a.startsWith("--"));

  const [email, name, username] = positional;
  if (!email || !name || !username) {
    console.error(
      "Usage: tsx scripts/create-user.ts <email> <name> <username> [--backfill-rater=<old>]",
    );
    process.exit(1);
  }
  if (!USERNAME_RE.test(username)) {
    console.error(
      `Invalid username: ${username}. Must match ${USERNAME_RE.source}`,
    );
    process.exit(1);
  }

  const existing = await db()
    .select({ id: userTable.id, username: userTable.username })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);

  let userId: string;
  if (existing.length > 0) {
    userId = existing[0].id;
    console.log(`User already exists: ${email} (${userId})`);
  } else {
    const [inserted] = await db()
      .insert(userTable)
      .values({
        email,
        name,
        username,
        displayUsername: username,
        emailVerified: true,
      })
      .returning({ id: userTable.id });
    userId = inserted.id;
    console.log(`Created user: ${email} username=${username} id=${userId}`);
  }

  if (backfillFrom) {
    const eventRows = await db()
      .update(eventRating)
      .set({ rater: userId })
      .where(eq(eventRating.rater, backfillFrom))
      .returning({ id: eventRating.id });
    const callRows = await db()
      .update(callRating)
      .set({ rater: userId })
      .where(eq(callRating.rater, backfillFrom))
      .returning({ id: callRating.id });
    console.log(
      `Backfilled rater='${backfillFrom}' → ${userId}: ` +
        `event_rating=${eventRows.length}, call_rating=${callRows.length}`,
    );
  }

  // postgres-js doesn't auto-close; force exit so the script terminates.
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
