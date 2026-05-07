import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { username as usernamePlugin } from "better-auth/plugins/username";
import { db } from "@/db/client";
import * as authSchema from "@/db/auth-schema";

function build() {
  const trustedOrigin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: trustedOrigin,
    trustedOrigins: [trustedOrigin],
    database: drizzleAdapter(db(), {
      provider: "pg",
      schema: authSchema,
    }),
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
    emailAndPassword: { enabled: false },
    user: {
      changeEmail: { enabled: false },
    },
    plugins: [
      magicLink({
        // Disable account creation on a fresh email — the dashboard is invite-only.
        // Existing users can still sign in via magic link; new emails are rejected.
        disableSignUp: true,
        sendMagicLink: async ({ email, url }) => {
          if (process.env.POSTMARK_SERVER_TOKEN) {
            await sendViaPostmark(email, url);
            return;
          }
          // Dev fallback: log the link so a dev can copy/paste it.
          console.log(`[magic-link] to=${email} url=${url}`);
        },
      }),
      usernamePlugin({
        minUsernameLength: 3,
        maxUsernameLength: 32,
        usernameValidator: (u) => /^[a-z0-9_-]{3,32}$/.test(u),
      }),
      nextCookies(),
    ],
  });
}

type AuthInstance = ReturnType<typeof build>;

let cached: AuthInstance | null = null;

export function auth(): AuthInstance {
  if (!cached) cached = build();
  return cached;
}

async function sendViaPostmark(to: string, url: string): Promise<void> {
  const token = process.env.POSTMARK_SERVER_TOKEN!;
  const from = process.env.POSTMARK_FROM ?? "no-reply@insights.local";
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": token,
    },
    body: JSON.stringify({
      From: from,
      To: to,
      Subject: "Sign in to clear-pipeline-insights",
      TextBody: `Click to sign in: ${url}\n\nThis link expires in 5 minutes.`,
      MessageStream: "outbound",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Postmark send failed: ${res.status} ${body}`);
  }
}
