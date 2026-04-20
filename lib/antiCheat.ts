import { createHash } from "node:crypto";

/**
 * Phase 4.3 cheat-prevention helpers.
 *
 * These functions never store raw PII. IP and user-agent are one-way
 * hashed with a server-side salt before they touch the database; an admin
 * can cluster suspicious rows (same ipHash, same session, many corrects)
 * without us ever being able to reverse the fingerprint.
 */

const SALT = process.env.FINGERPRINT_SALT ?? "trivia-box-fingerprint-v1";

function h(prefix: string, value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return (
    prefix +
    ":" +
    createHash("sha256").update(`${SALT}:${normalized}`).digest("hex").slice(0, 24)
  );
}

export function hashIp(ip: string | null | undefined): string | null {
  return h("ip", ip);
}

export function hashUserAgent(ua: string | null | undefined): string | null {
  return h("ua", ua);
}

/**
 * Normalize client-sent device IDs (short cookie/localStorage strings).
 * Hashed the same way for storage so a compromised DB doesn't leak the
 * raw cookie value, and truncated to 24 bytes.
 */
export function hashDeviceId(deviceId: string | null | undefined): string | null {
  return h("dev", deviceId);
}

/** Best-effort client IP extraction for serverless edge/nodes. */
export function clientIpFromHeaders(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") || null;
}

/**
 * Derive elapsed ms on the server from the stored `timerStartedAtMs` and
 * the timer length, clamping to [0, timerSeconds*1000]. Returns null when
 * we don't have a trusted start timestamp — the caller can fall back to
 * the client value but should flag the score for review.
 */
export function deriveServerElapsedMs(input: {
  timerStartedAtMs: number | null | undefined;
  timerSeconds: number | null | undefined;
  nowMs?: number;
}): number | null {
  if (
    typeof input.timerStartedAtMs !== "number" ||
    input.timerStartedAtMs <= 0
  ) {
    return null;
  }
  const now = input.nowMs ?? Date.now();
  const raw = Math.max(0, now - input.timerStartedAtMs);
  if (typeof input.timerSeconds === "number" && input.timerSeconds > 0) {
    return Math.min(raw, input.timerSeconds * 1000);
  }
  return raw;
}
