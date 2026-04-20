/**
 * Sentry - browser runtime config (Next.js 15 + Turbopack canonical location).
 *
 * Replaces the legacy `sentry.client.config.ts` per the Sentry/Next.js
 * deprecation notice (Turbopack refuses to load `sentry.client.config.ts`).
 *
 * Intentionally fails open when `NEXT_PUBLIC_SENTRY_DSN` is unset so local
 * dev, `npm run verify`, and CI builds without Sentry credentials stay
 * silent. Session replay is armed on errors only (0% baseline) to keep the
 * privacy scope narrow until we ship a consent surface - we mask all text
 * and block all media defensively on top of that.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  });
}

/**
 * Exported so Next.js can hook client-side router transitions into Sentry
 * traces. No-op when `Sentry.init` above was skipped (DSN unset).
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
