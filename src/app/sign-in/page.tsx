import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; sent?: string }>;
}) {
  const { from, sent } = await searchParams;
  const callbackURL = from && from.startsWith("/") ? from : "/";

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Insights is invite-only. Enter the email your account was created with;
        we&apos;ll send a magic link.
      </p>
      {sent === "1" ? (
        <div className="rounded border border-green-500/40 bg-green-50 px-4 py-3 text-sm text-green-900 dark:bg-green-950 dark:text-green-200">
          Check your email for the sign-in link. It expires in 5 minutes.
        </div>
      ) : (
        <SignInForm callbackURL={callbackURL} />
      )}
    </main>
  );
}
