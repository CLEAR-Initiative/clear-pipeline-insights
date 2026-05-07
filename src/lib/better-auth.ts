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
          if (process.env.RESEND_API_KEY) {
            await sendViaResend(email, url);
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

async function sendViaResend(to: string, url: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY!;
  const from = process.env.RESEND_FROM ?? "no-reply@insights.local";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Sign in to clear-pipeline-insights",
      text: `Click to sign in: ${url}\n\nThis link expires in 5 minutes.`,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend send failed: ${res.status} ${body}`);
  }
}
