"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";

export function SignInForm({ callbackURL }: { callbackURL: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await signIn.magicLink({ email, callbackURL });
    setPending(false);
    if (res.error) {
      setError(res.error.message ?? "Could not send sign-in link.");
      return;
    }
    router.replace(`/sign-in?sent=1`);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>
      <button
        type="submit"
        disabled={pending || !email}
        className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {pending ? "Sending…" : "Send magic link"}
      </button>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </form>
  );
}
