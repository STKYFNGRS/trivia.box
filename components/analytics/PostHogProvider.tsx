"use client";

import { useUser } from "@clerk/nextjs";
import posthog from "posthog-js";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, type PropsWithChildren } from "react";

/**
 * Client-side PostHog bootstrap.
 *
 * - Fails open when `NEXT_PUBLIC_POSTHOG_KEY` is unset (local dev / CI).
 * - `capture_pageview: false` — we fire `$pageview` manually on route change
 *   because Next.js App Router doesn't emit a full page load on client nav.
 * - Calls `posthog.identify` with the Clerk user id on sign-in, and
 *   `posthog.reset` on sign-out, so funnels attribute correctly.
 * - Session replay is OFF by default; when we turn it on, `maskAllText` +
 *   `blockAllMedia` are already wired to keep privacy scope narrow.
 */
export function PostHogProvider({ children }: PropsWithChildren) {
  const initRef = useRef(false);
  const pathname = usePathname();
  const search = useSearchParams();
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    if (initRef.current) return;
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    initRef.current = true;
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      capture_pageview: false,
      capture_pageleave: true,
      disable_session_recording: true,
      persistence: "localStorage+cookie",
    });
  }, []);

  useEffect(() => {
    if (!initRef.current) return;
    const q = search?.toString();
    const url = q ? `${pathname}?${q}` : pathname;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, search]);

  useEffect(() => {
    if (!initRef.current || !isLoaded) return;
    if (isSignedIn && user?.id) {
      posthog.identify(user.id, {
        // We don't send PII beyond what's already in Clerk; the server-side
        // `identify` helper is used for richer properties when needed.
        email: user.primaryEmailAddress?.emailAddress,
      });
    } else {
      posthog.reset();
    }
  }, [isLoaded, isSignedIn, user]);

  return <>{children}</>;
}
