"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AccountRow } from "@/lib/accounts";
import { SubscribeButton } from "@/components/billing/SubscribeButton";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export function SiteAdminDashboardShell(props: {
  account: AccountRow;
  isAdmin: boolean;
  /** Includes dev-only bypass for `site_admin`. */
  organizerSubscriptionEffective: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = props.organizerSubscriptionEffective;

  return (
    <div className="min-h-screen">
      <header className="bg-card border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <Link href="/dashboard" className="font-semibold tracking-tight">
              trivia.box
            </Link>
            <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs font-medium">
              site admin
            </span>
            <nav className="text-muted-foreground flex flex-wrap items-center gap-3 text-sm sm:gap-4">
              <Link
                href="/dashboard"
                className={cn(pathname === "/dashboard" && "text-foreground font-medium")}
              >
                Organizer
              </Link>
              <Link
                href="/dashboard/games"
                className={cn(pathname?.startsWith("/dashboard/games") && "text-foreground font-medium")}
              >
                Games
              </Link>
              <Link
                href="/dashboard/games/new"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8")}
              >
                New game setup
              </Link>
              <Link
                href="/dashboard/decks"
                className={cn(pathname?.startsWith("/dashboard/decks") && "text-foreground font-medium")}
              >
                My decks
              </Link>
              <Link
                href="/dashboard/stats"
                className={cn(pathname?.startsWith("/dashboard/stats") && "text-foreground font-medium")}
              >
                Stats
              </Link>
              <Link
                href="/dashboard/player"
                className={cn(pathname?.startsWith("/dashboard/player") && "text-foreground font-medium")}
              >
                Player test
              </Link>
              {props.isAdmin ? (
                <Link href="/admin" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8")}>
                  Admin
                </Link>
              ) : null}
            </nav>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {!active ? (
        <div className="bg-amber-500/10 text-amber-900 ring-1 ring-amber-500/30 border-y border-amber-500/20 dark:text-amber-200">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              Organizer subscription is inactive (Stripe). Enable{" "}
              <code className="rounded bg-black/5 px-1 dark:bg-white/10">SITE_ADMIN_DEV_BYPASS=1</code> in dev to
              run sessions without billing.
            </div>
            <SubscribeButton returnPath={pathname ?? "/dashboard"} />
          </div>
        </div>
      ) : null}

      <main id="main-content" className="mx-auto max-w-5xl px-4 py-8">
        {props.children}
      </main>
    </div>
  );
}
