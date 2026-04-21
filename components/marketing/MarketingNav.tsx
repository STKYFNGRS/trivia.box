"use client";

import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ManageBillingMenuItem } from "@/components/billing/ManageBillingMenuItem";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/play", label: "Play" },
  { href: "/decks", label: "Decks" },
  { href: "/leaderboards", label: "Leaderboards" },
  { href: "/games/upcoming", label: "Upcoming" },
];

/**
 * Site-wide marketing nav. Sticky at the top, shrinks its padding after a
 * small scroll threshold. The brand mark is a neon gradient chip + wordmark;
 * the right-side CTAs swap between "Sign in / Play now" (visitors) and
 * "Dashboard + avatar menu" (signed-in users) via Clerk's
 * `<SignedIn>/<SignedOut>` primitives so we never show a "Sign in" button to
 * someone already authenticated.
 *
 * Also renders a visually-hidden skip-link that becomes visible on focus,
 * targeting `#main` on the wrapping `MarketingShell` `<main>` for keyboard
 * accessibility.
 */
export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full transition-all duration-300",
        scrolled
          ? "border-b border-white/10 bg-[color-mix(in_oklab,var(--stage-bg)_82%,transparent)] backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-1.5 focus:text-sm focus:font-semibold focus:text-black"
      >
        Skip to content
      </a>
      <div
        className={cn(
          "mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 transition-all duration-300",
          scrolled ? "h-20" : "h-24"
        )}
      >
        <Link
          href="/"
          className="group inline-flex items-center text-white"
          aria-label="trivia.box home"
        >
          <Image
            src="/logo.png"
            alt="trivia.box"
            width={320}
            height={64}
            priority
            className="h-16 w-auto transition-opacity group-hover:opacity-90"
          />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <SignedOut>
            <Link
              href="/sign-in"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "hidden text-white/80 hover:bg-white/10 hover:text-white sm:inline-flex"
              )}
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className={cn(
                buttonVariants({ size: "sm" }),
                "h-8 px-3 text-[0.8rem] font-bold uppercase tracking-[0.14em] text-[color:var(--primary-foreground)]"
              )}
              style={{
                background:
                  "linear-gradient(135deg, var(--neon-magenta), var(--neon-violet))",
                boxShadow:
                  "0 0 0 1px color-mix(in oklab, var(--neon-magenta) 45%, transparent), 0 8px 24px -8px color-mix(in oklab, var(--neon-magenta) 70%, transparent)",
              }}
            >
              Play now
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "hidden text-white/80 hover:bg-white/10 hover:text-white sm:inline-flex"
              )}
            >
              Dashboard
            </Link>
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  avatarBox: "size-8 ring-1 ring-white/20",
                },
              }}
            >
              <UserButton.MenuItems>
                <ManageBillingMenuItem />
              </UserButton.MenuItems>
            </UserButton>
          </SignedIn>
        </div>
      </div>
    </header>
  );
}
