import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { inArray } from "drizzle-orm";
import { auth } from "./better-auth";
import { db } from "@/db/client";
import { user as userTable } from "@/db/auth-schema";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  username: string;
};

export const getSession = cache(async () => {
  return auth().api.getSession({ headers: await headers() });
});

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const session = await requireSession();
  const u = session.user as { id: string; email: string; name: string; username?: string | null };
  if (!u.username) {
    // Should never happen — every user is created with a username via scripts/create-user.ts.
    // If it does, send the user back to sign-in rather than rendering with a bad rater id.
    redirect("/sign-in");
  }
  return { id: u.id, email: u.email, name: u.name, username: u.username };
}

export async function getRater(): Promise<string> {
  const { id } = await getCurrentUser();
  return id;
}

export async function usernamesByIds(
  ids: readonly string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const rows = await db()
    .select({ id: userTable.id, username: userTable.username })
    .from(userTable)
    .where(inArray(userTable.id, ids as string[]));
  for (const r of rows) {
    if (r.username) map.set(r.id, r.username);
  }
  return map;
}

export async function userIdByUsername(username: string): Promise<string | null> {
  const rows = await db()
    .select({ id: userTable.id })
    .from(userTable)
    .where(inArray(userTable.username, [username]))
    .limit(1);
  return rows[0]?.id ?? null;
}
