/**
 * Sentry — Node.js (server) runtime config.
 *
 * Loaded via `instrumentation.ts` on the server. Fails open when
 * `SENTRY_DSN` is unset so local dev doesn't pay the init cost.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    profilesSampleRate: 0.1,
    environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV,
  });
}
