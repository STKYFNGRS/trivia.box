"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export function PlayerDashboardShell(props: { username: string; children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <header className="bg-card border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard/player" className="font-semibold tracking-tight">
              trivia.box
            </Link>
            <nav className="text-muted-foreground flex items-center gap-4 text-sm">
              <Link
                href="/dashboard/player"
                className={cn(pathname === "/dashboard/player" && "text-foreground font-medium")}
              >
                Home
              </Link>
              <Link
                href="/play/solo"
                className={cn(pathname?.startsWith("/play/solo") && "text-foreground font-medium")}
              >
                Play solo
              </Link>
              <Link
                href="/play"
                className={cn(
                  pathname === "/play" && "text-foreground font-medium",
                  "hidden sm:inline"
                )}
              >
                House games
              </Link>
              <Link
                href="/games/upcoming"
                className={cn(
                  pathname?.startsWith("/games/upcoming") && "text-foreground font-medium",
                  "hidden md:inline"
                )}
              >
                Upcoming
              </Link>
              <Link
                href={`/u/${encodeURIComponent(props.username)}`}
                className={cn(
                  pathname?.startsWith("/u/") && "text-foreground font-medium",
                  "hidden md:inline"
                )}
              >
                Profile
              </Link>
              <Link href="/join" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8 px-2")}>
                Join a game
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{props.children}</main>
    </div>
  );
}
