"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AccountRow } from "@/lib/accounts";
import { SubscribeButton } from "@/components/billing/SubscribeButton";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export function DashboardShell(props: {
  account: AccountRow;
  isAdmin: boolean;
  /** When set, drives subscription banner (e.g. dev bypass for `site_admin`). Defaults to Stripe flag. */
  subscriptionEffective?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = props.subscriptionEffective ?? props.account.subscriptionActive;
  // Only hosts need a live subscription — players get the "become a host"
  // card, and site admins get dev-bypass coverage. Showing a scary "your
  // subscription is inactive" banner to everyone created onboarding anxiety.
  const showSubscribeBanner = !active && props.account.accountType === "host";

  return (
    <div className="min-h-screen">
      <header className="bg-card border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-semibold tracking-tight">
              trivia.box
            </Link>
            <nav className="text-muted-foreground flex items-center gap-4 text-sm">
              <Link
                href="/dashboard"
                className={cn(pathname === "/dashboard" && "text-foreground font-medium")}
              >
                Home
              </Link>
              <Link
                href="/dashboard/games"
                className={cn(pathname?.startsWith("/dashboard/games") && "text-foreground font-medium")}
              >
                Games
              </Link>
              <Link
                href="/dashboard/decks"
                className={cn(pathname?.startsWith("/dashboard/decks") && "text-foreground font-medium")}
              >
                My decks
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {props.isAdmin ? (
              <Link href="/admin" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Admin
              </Link>
            ) : null}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {showSubscribeBanner ? (
        <div className="bg-amber-500/10 text-amber-900 ring-1 ring-amber-500/30 border-y border-amber-500/20 dark:text-amber-200">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              Your host subscription is inactive. You can review past activity, but launching live games requires
              an active subscription.
            </div>
            <SubscribeButton returnPath={pathname ?? "/dashboard"} />
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-5xl px-4 py-8">{props.children}</main>
    </div>
  );
}
