/**
 * Sentry — browser runtime config.
 *
 * Loaded automatically by `@sentry/nextjs`. Intentionally fails open when
 * `NEXT_PUBLIC_SENTRY_DSN` is unset so local dev and `npm run verify` stay
 * silent. Session replay is armed for errors only to keep privacy scope
 * narrow — we can widen it once we've shipped a consent surface.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 1.0,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  });
}
