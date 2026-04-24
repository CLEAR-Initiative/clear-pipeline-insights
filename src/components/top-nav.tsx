import Link from "next/link";

type NavItem = { href: string; label: string };

const ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/live", label: "Live" },
  { href: "/review/group", label: "Call review" },
  { href: "/review/events", label: "Cluster review" },
  { href: "/review/ratings/james", label: "My ratings" },
  { href: "/review/ratings/aggregate", label: "All ratings" },
];

function isActive(currentPath: string, itemHref: string): boolean {
  if (itemHref === "/") return currentPath === "/";
  if (itemHref === "/review/ratings/james") {
    return (
      currentPath.startsWith("/review/ratings/") &&
      currentPath !== "/review/ratings/aggregate"
    );
  }
  return currentPath === itemHref;
}

export function TopNav({ currentPath }: { currentPath: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {ITEMS.map((item) =>
        isActive(currentPath, item.href) ? (
          <span
            key={item.href}
            aria-current="page"
            className="font-semibold text-neutral-900 dark:text-neutral-100"
          >
            {item.label}
          </span>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}
