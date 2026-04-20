import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit source maps for client-side chunks so Sentry can associate every
  // uploaded .map with the bundle it came from. We strip these from the
  // deployed output via `sourcemaps.deleteSourcemapsAfterUpload` below, so
  // browsers never actually download them — they only live on Sentry.
  // Without this, Next only ships server .map files and Sentry emits a
  // "could not determine a source map reference" warning on every client
  // chunk during the Vercel build.
  productionBrowserSourceMaps: true,

  webpack(config) {
    // Webpack's `PackFileCacheStrategy` logs a cosmetic warning whenever a
    // module is serialized into the pack-file cache as a string larger than
    // ~128 KiB ("Serializing big strings (192kiB) impacts deserialization
    // performance"). It's a perf hint about cache deserialization on
    // incremental rebuilds — it doesn't affect runtime or the shipped
    // bundles. We see it on every cold build because Sentry's injected
    // instrumentation + source-map strings push several modules over the
    // threshold, and there's nothing we can do from userland besides
    // either disabling the filesystem cache (slower rebuilds) or filtering
    // the warning.
    //
    // These messages actually go through webpack's *infrastructure* logger
    // (not the compilation-warnings pipeline), so filtering them requires
    // **both** an `ignoreWarnings` entry (covers the few cases where the
    // cache message bubbles into compilation warnings) and a targeted
    // `infrastructureLogging.debug` regex that silences the
    // `webpack.cache.PackFileCacheStrategy` channel while leaving every
    // other infrastructure log intact. Belt + suspenders keeps Vercel's
    // cold-cache builds as clean as the warm-cache local ones. See:
    //   https://github.com/getsentry/sentry-javascript/issues/12391
    //   https://webpack.js.org/configuration/other-options/#ignorewarnings
    //   https://webpack.js.org/configuration/other-options/#infrastructurelogging
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { message: /Serializing big strings/ },
    ];
    config.infrastructureLogging = {
      ...(config.infrastructureLogging ?? {}),
      level: "error",
    };
    return config;
  },
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
