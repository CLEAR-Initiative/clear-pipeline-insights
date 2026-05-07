"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

type NavItem = { href: string; label: string; key: string };

function buildItems(username: string): NavItem[] {
  const myRatings = `/review/ratings/${encodeURIComponent(username)}`;
  return [
    { href: "/", label: "Dashboard", key: "dashboard" },
    { href: "/live", label: "Live", key: "live" },
    { href: "/review/group", label: "Call review", key: "call-review" },
    { href: "/review/events", label: "Cluster review", key: "cluster-review" },
    { href: myRatings, label: "My ratings", key: "my-ratings" },
    {
      href: "/review/ratings/aggregate",
      label: "All ratings",
      key: "all-ratings",
    },
    { href: "/eval", label: "Eval", key: "eval" },
  ];
}

function isActive(currentPath: string, item: NavItem): boolean {
  if (item.key === "dashboard") return currentPath === "/";
  if (item.key === "my-ratings") {
    return (
      currentPath.startsWith("/review/ratings/") &&
      currentPath !== "/review/ratings/aggregate"
    );
  }
  if (item.key === "eval") return currentPath.startsWith("/eval");
  return currentPath === item.href;
}

export function TopNav({ username }: { username: string | null }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  if (!username) return null;
  const items = buildItems(username);

  async function onSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    router.replace("/sign-in");
  }

  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-6 py-4 text-sm">
        {items.map((item) =>
          isActive(pathname, item) ? (
            <span
              key={item.key}
              aria-current="page"
              className="font-semibold text-neutral-900 dark:text-neutral-100"
            >
              {item.label}
            </span>
          ) : (
            <Link
              key={item.key}
              href={item.href}
              className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              {item.label}
            </Link>
          ),
        )}
        <span className="ml-auto flex items-center gap-3 text-xs text-neutral-500">
          <span className="font-mono">@{username}</span>
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            className="text-neutral-500 hover:text-neutral-900 disabled:opacity-50 dark:hover:text-neutral-100"
          >
            {signingOut ? "signing out…" : "sign out"}
          </button>
        </span>
      </nav>
    </header>
  );
}
