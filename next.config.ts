import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

/**
 * `withSentryConfig` uploads source maps and wires the tunnel route.
 * All options below are opt-in: the wrapper is a no-op at runtime when
 * `SENTRY_DSN` / `SENTRY_AUTH_TOKEN` aren't set, so local dev and CI are
 * unaffected.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
});
