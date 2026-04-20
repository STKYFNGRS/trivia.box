import { PostHog } from "posthog-node";

/**
 * Server-side PostHog client + `track()` helper.
 *
 * Server-side emission is the default (not client) because:
 *   - ad-blockers can hide the client SDK but not a server call,
 *   - the critical funnel (join → answer → complete → subscribe) has
 *     server-side source-of-truth events anyway, and
 *   - we can attribute a distinctId from DB context instead of trusting
 *     whatever the browser cookie happens to be.
 *
 * Fails open when `NEXT_PUBLIC_POSTHOG_KEY` is unset: all calls no-op so
 * local dev, CI, and `npm run verify` don't need PostHog configured.
 *
 * We intentionally reuse the publishable key (NEXT_PUBLIC_POSTHOG_KEY) on
 * the server too — PostHog supports it and it keeps config simple.
 */

type Props = Record<string, string | number | boolean | null | undefined>;

let client: PostHog | null = null;
let initialized = false;

function getClient(): PostHog | null {
  if (initialized) return client;
  initialized = true;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    client = null;
    return null;
  }
  client = new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    // Short flush interval on serverless so events aren't lost to cold invocations.
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

/**
 * Fire-and-forget event emit. Never throws — analytics must never break
 * the user-facing request path. Callers typically don't `await` this.
 */
export async function track(
  event: string,
  opts: { distinctId: string; properties?: Props }
): Promise<void> {
  const ph = getClient();
  if (!ph) return;
  try {
    ph.capture({
      distinctId: opts.distinctId,
      event,
      properties: opts.properties ?? {},
    });
  } catch {
    // swallow — analytics must not break handlers.
  }
}

/**
 * Explicit identify for DB-known user metadata (email, account_type, etc).
 * Typically only called once per session, e.g. in a profile API route.
 */
export async function identify(
  distinctId: string,
  properties: Props
): Promise<void> {
  const ph = getClient();
  if (!ph) return;
  try {
    ph.identify({ distinctId, properties });
  } catch {
    // swallow
  }
}
