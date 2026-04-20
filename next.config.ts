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
 // For all available options, see:
 // https://www.npmjs.com/package/@sentry/webpack-plugin#options

 org: "dude-dot-box-llc",

 project: "javascript-nextjs",

 // Only print logs for uploading source maps in CI
 silent: !process.env.CI,

 // For all available options, see:
 // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

 // Upload a larger set of source maps for prettier stack traces (increases build time)
 widenClientFileUpload: true,

 // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
 // This can increase your server load as well as your hosting bill.
 // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
 // side errors will fail.
 tunnelRoute: "/monitoring",

 webpack: {
   // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
   // See the following for more information:
   // https://docs.sentry.io/product/crons/
   // https://vercel.com/docs/cron-jobs
   automaticVercelMonitors: true,

   // Tree-shaking options for reducing bundle size
   treeshake: {
     // Automatically tree-shake Sentry logger statements to reduce bundle size
     removeDebugLogging: true,
   },
 },

 // Delete the raw `.map` files from the Vercel output after upload so we
 // don't ship source maps to end users (they stay on Sentry for stack-trace
 // symbolication).
 sourcemaps: {
   deleteSourcemapsAfterUpload: true,
 },

 // Create + finalize a Sentry release per build so deploys show up in the
 // release health dashboard and stack traces are tied to the right commit.
 release: {
   create: true,
   finalize: true,
 },
});
