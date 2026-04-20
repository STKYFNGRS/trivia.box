import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { ApiError } from "@/lib/apiError";

/**
 * Rate-limiting presets + helpers for public / abusable endpoints.
 *
 * Fails open when `UPSTASH_REDIS_REST_URL` is unset (i.e. local dev and CI):
 * the helpers become no-ops. In production, set both env vars and every
 * guarded route will enforce the corresponding bucket.
 *
 * Buckets — tuned to be generous for real players but block naive scraping:
 * - `publicJoin` — 10 / min / IP. A real user hits this at most once per
 *   game, so 10/min leaves plenty of headroom for a flaky network.
 * - `publicAnswer` — 120 / min / player. Questions cap at ~60s, so a fast
 *   game is ~1 answer every 20s per player; 120/min is 40x headroom.
 * - `adminGenerate` — 30 / hour / admin. LLM calls are expensive; this
 *   protects the account from runaway cost if a UI glitch fires a loop.
 * - `anonymous` — 60 / min / IP. Generic fallback for unauthenticated
 *   GET/POST that we don't have a tighter key for.
 */

type LimiterName =
  | "publicJoin"
  | "publicAnswer"
  | "publicSoloStart"
  | "publicSoloAnswer"
  | "adminGenerate"
  | "anonymous";

type LimiterConfig = {
  limit: number;
  window: Parameters<typeof Ratelimit.slidingWindow>[1];
};

const CONFIGS: Record<LimiterName, LimiterConfig> = {
  publicJoin: { limit: 10, window: "1 m" },
  publicAnswer: { limit: 120, window: "1 m" },
  // Solo sessions have a cheap start, but runaway loops would flood `questions`.
  // 10/min/key is plenty for humans (tops out around one session every 6s).
  publicSoloStart: { limit: 10, window: "1 m" },
  publicSoloAnswer: { limit: 180, window: "1 m" },
  adminGenerate: { limit: 30, window: "1 h" },
  anonymous: { limit: 60, window: "1 m" },
};

const redis = getRedis();

function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  try {
    return Redis.fromEnv();
  } catch {
    return null;
  }
}

/**
 * Boot-time rate-limit configuration warning. Called from
 * `instrumentation.ts` at process start. In production without Upstash, logs
 * a loud warning but never throws — rate-limiting is an optional defense and
 * a missing Upstash client should not take the site down. Individual
 * `checkRateLimit` calls already fail open gracefully.
 *
 * Set `RATE_LIMIT_ALLOW_UNCONFIGURED=1` to suppress this boot warning.
 */
export function assertRateLimitConfigured(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.RATE_LIMIT_ALLOW_UNCONFIGURED === "1") return;
  if (!redis) {
    console.warn(
      "[rateLimit] Upstash not configured in production — rate-limiting " +
        "will fail open on every request. Set UPSTASH_REDIS_REST_URL + " +
        "UPSTASH_REDIS_REST_TOKEN to enforce limits, or set " +
        "RATE_LIMIT_ALLOW_UNCONFIGURED=1 to silence this warning."
    );
  }
}

/** Counter of fail-open invocations; reset by tests. Monitored by ops. */
let failOpenCount = 0;
export function getFailOpenCount(): number {
  return failOpenCount;
}

const cache: Partial<Record<LimiterName, Ratelimit>> = {};

function getLimiter(name: LimiterName): Ratelimit | null {
  if (!redis) return null;
  const cached = cache[name];
  if (cached) return cached;
  const cfg = CONFIGS[name];
  const rl = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(cfg.limit, cfg.window),
    analytics: false,
    prefix: `tb:rl:${name}`,
  });
  cache[name] = rl;
  return rl;
}

export type RateLimitResult = {
  /** `true` if the request should be allowed. */
  allowed: boolean;
  /** Remaining budget in the current window. `null` when limiter disabled. */
  remaining: number | null;
  /** Unix ms when the window resets. `null` when limiter disabled. */
  reset: number | null;
};

/**
 * Low-level check; does not throw. Useful in code paths that want to record
 * metrics or degrade gracefully instead of rejecting the request.
 */
export async function checkRateLimit(
  name: LimiterName,
  key: string
): Promise<RateLimitResult> {
  const limiter = getLimiter(name);
  if (!limiter) {
    // Fail open — no Upstash env means no enforcement. Track and log once
    // per minute so ops can spot a production misconfiguration even when
    // `RATE_LIMIT_ALLOW_UNCONFIGURED=1` is set.
    failOpenCount += 1;
    maybeWarnFailOpen(name);
    return { allowed: true, remaining: null, reset: null };
  }
  const res = await limiter.limit(key);
  return { allowed: res.success, remaining: res.remaining, reset: res.reset };
}

let lastWarnAt = 0;
function maybeWarnFailOpen(name: LimiterName) {
  const now = Date.now();
  if (now - lastWarnAt < 60_000) return;
  lastWarnAt = now;
  console.warn(
    `[rateLimit] fail-open on "${name}" — Upstash client unavailable. ` +
      `Total fail-opens this process: ${failOpenCount}.`
  );
}

/**
 * Throws `ApiError(429, "Rate limit exceeded", "RATE_LIMITED")` when the
 * bucket is exhausted, otherwise returns normally. Most route handlers
 * should call this at the top of the body.
 */
export async function enforceRateLimit(name: LimiterName, key: string): Promise<void> {
  const { allowed } = await checkRateLimit(name, key);
  if (!allowed) {
    throw new ApiError(429, "Too many requests — slow down and try again.", "RATE_LIMITED");
  }
}

/**
 * Best-effort IP extraction for rate-limit keys. Prefers the leftmost
 * `X-Forwarded-For` entry (the original client on a proxied request),
 * falls back to `X-Real-IP`, then a literal sentinel so two anonymous
 * requests hitting the same box still share a bucket.
 */
export function clientIpFromRequest(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

/** Exported for test introspection. */
export const __testing = { CONFIGS, getRedis: () => redis };
