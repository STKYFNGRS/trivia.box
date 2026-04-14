"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AccountRow } from "@/lib/accounts";
import { SubscribeButton } from "@/components/billing/SubscribeButton";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DashboardShell(props: {
  account: AccountRow;
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = props.account.subscriptionActive;

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
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {props.isAdmin ? (
              <Link href="/admin" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Admin
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {!active ? (
        <div className="bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              Your subscription is inactive. You can review past activity, but live games require an active
              subscription.
            </div>
            <SubscribeButton returnPath={pathname ?? "/dashboard"} />
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-5xl px-4 py-8">{props.children}</main>
    </div>
  );
}
