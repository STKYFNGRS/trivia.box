/**
 * Sentry — edge runtime config (middleware + edge route handlers).
 *
 * Loaded via `instrumentation.ts` on the edge runtime. No profiling
 * here — it isn't supported on the edge and would throw.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV,
  });
}
