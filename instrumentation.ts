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
    const { assertRateLimitConfigured } = await import("./lib/rateLimit");
    assertRateLimitConfigured();
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
