/**
 * Next.js App Router instrumentation hook.
 *
 * `register()` is invoked once per server process (Node + edge) before any
 * routes run. We branch on `NEXT_RUNTIME` so the heavier Node SDK doesn't
 * try to load on the edge.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    // Fail-closed rate-limit boot check (Phase 4.4). Running in production
    // without Upstash configured should crash the process unless an operator
    // sets `RATE_LIMIT_ALLOW_UNCONFIGURED=1` as an explicit escape hatch.
    const { assertRateLimitConfigured } = await import("./lib/rateLimit");
    assertRateLimitConfigured();
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
