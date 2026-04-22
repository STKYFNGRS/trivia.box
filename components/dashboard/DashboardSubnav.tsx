"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type SubnavRole = "host" | "site_admin" | "player";

type SubnavLink = {
  href: string;
  label: string;
  /**
   * When present, the link's active state only matches exact path equality.
   * Otherwise we match `startsWith(href)` so deep pages highlight the parent
   * tab. Useful for "Home" links where a plain `startsWith` would match
   * every dashboard route.
   */
  exact?: boolean;
};

/**
 * Role-specific link sets. Hosts see the organizer tabs; site admins get a
 * superset including the game setup shortcut, player-test toggle and the
 * admin console; players get a streamlined player-focused row.
 */
const LINKS: Record<SubnavRole, SubnavLink[]> = {
  host: [
    { href: "/dashboard", label: "Home", exact: true },
    { href: "/dashboard/games", label: "Games" },
    { href: "/dashboard/decks", label: "My decks" },
    { href: "/dashboard/stats", label: "Stats" },
    { href: "/dashboard/venues", label: "Venues" },
  ],
  site_admin: [
    { href: "/dashboard", label: "Organizer", exact: true },
    { href: "/dashboard/games", label: "Games" },
    { href: "/dashboard/games/new", label: "New game" },
    { href: "/dashboard/decks", label: "My decks" },
    { href: "/dashboard/stats", label: "Stats" },
    { href: "/dashboard/venues", label: "Venues" },
    { href: "/dashboard/player", label: "Player test" },
  ],
  player: [
    { href: "/dashboard/player", label: "Home", exact: true },
    { href: "/play/solo", label: "Play solo" },
    { href: "/play", label: "House games", exact: true },
    { href: "/games/upcoming", label: "Upcoming" },
    { href: "/dashboard/player/achievements", label: "Achievements" },
    { href: "/dashboard/player/friends", label: "Friends" },
    { href: "/join", label: "Join a game" },
  ],
};

/**
 * Horizontal dashboard tab bar rendered directly beneath the marketing nav
 * inside `app/dashboard/layout.tsx`. Replaces the bespoke per-role header
 * rows that used to live in `DashboardShell` / `SiteAdminDashboardShell` /
 * `PlayerDashboardShell`, so signed-in users see the same chrome (nav +
 * footer) as the rest of the site, with a context-aware tab row just for
 * dashboard navigation.
 *
 * Active tab detection respects `exact` on entries whose href would otherwise
 * swallow every descendant route (e.g. `/dashboard` matching `/dashboard/games`).
 */
export function DashboardSubnav({
  role,
  isAdmin,
}: {
  role: SubnavRole;
  /** Show the `/admin` console link for users with site-admin clerk role. */
  isAdmin?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const items = LINKS[role];

  return (
    <div className="border-b border-white/10 bg-[color-mix(in_oklab,var(--stage-bg)_80%,transparent)]">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-1 overflow-x-auto px-6 py-2 scrollbar-none">
        {items.map((l) => {
          const active = l.exact
            ? pathname === l.href
            : pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-white/10 text-white"
                  : "text-white/65 hover:bg-white/5 hover:text-white"
              )}
              style={
                active
                  ? {
                      boxShadow:
                        "inset 0 -2px 0 0 var(--neon-lime), 0 0 0 1px color-mix(in oklab, var(--neon-lime) 30%, transparent)",
                    }
                  : undefined
              }
            >
              {l.label}
            </Link>
          );
        })}
        {isAdmin ? (
          <Link
            href="/admin"
            className="ml-auto whitespace-nowrap rounded-md border border-white/15 px-3 py-1.5 text-sm font-medium text-white/75 transition-colors hover:bg-white/5 hover:text-white"
          >
            Admin
          </Link>
        ) : null}
      </div>
    </div>
  );
}
