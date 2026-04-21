import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed tokens for one-click unsubscribe links. The token is a URL-safe
 * string `${payloadJsonBase64}.${hmacBase64}` signed with the shared
 * `EMAIL_UNSUBSCRIBE_SECRET` (falls back to `CRON_SECRET` → a fixed
 * dev-only literal so `npm run dev` doesn't require secret setup).
 *
 * Scope granularity is deliberately coarse — `all` stops *every* future
 * email from us; `kind` stops a single category (`prize_won`,
 * `weekly_digest`, `upcoming_sessions`, `marketing`). That matches the
 * checkbox UI in `/dashboard/player/notifications` and keeps the token
 * payload tiny.
 */

export type UnsubscribeScope =
  | "all"
  | "prize_won"
  | "weekly_digest"
  | "upcoming_sessions"
  | "marketing";

export type UnsubscribePayload = {
  accountId: string;
  scope: UnsubscribeScope;
  /** Issued-at seconds. Tokens never hard-expire; this is here for audit. */
  iat: number;
};

function getSecret(): string {
  const direct = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim();
  if (direct && direct.length > 0) return direct;
  const cron = process.env.CRON_SECRET?.trim();
  if (cron && cron.length > 0) return `unsub::${cron}`;
  // Dev / local fallback. Intentionally verbose so a prod accidental-use is
  // obvious in logs / git grep; production deploys should set a real secret.
  return "TRIVIA_BOX_DEV_UNSUBSCRIBE_FALLBACK_DO_NOT_USE_IN_PROD";
}

function base64url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? 0 : 4 - (padded.length % 4);
  return Buffer.from(padded + "=".repeat(pad), "base64");
}

function sign(payload: string): string {
  return base64url(
    createHmac("sha256", getSecret()).update(payload).digest()
  );
}

export function signUnsubscribeToken(input: {
  accountId: string;
  scope: UnsubscribeScope;
  now?: Date;
}): string {
  const payload: UnsubscribePayload = {
    accountId: input.accountId,
    scope: input.scope,
    iat: Math.floor((input.now ?? new Date()).getTime() / 1000),
  };
  const encoded = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = sign(encoded);
  return `${encoded}.${sig}`;
}

export function verifyUnsubscribeToken(
  token: string | null | undefined
): UnsubscribePayload | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(encoded);
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(base64urlDecode(encoded).toString("utf8")) as Partial<UnsubscribePayload>;
    if (
      !parsed ||
      typeof parsed.accountId !== "string" ||
      typeof parsed.scope !== "string" ||
      typeof parsed.iat !== "number"
    ) {
      return null;
    }
    const scope = parsed.scope as UnsubscribeScope;
    if (
      scope !== "all" &&
      scope !== "prize_won" &&
      scope !== "weekly_digest" &&
      scope !== "upcoming_sessions" &&
      scope !== "marketing"
    ) {
      return null;
    }
    return {
      accountId: parsed.accountId,
      scope,
      iat: parsed.iat,
    };
  } catch {
    return null;
  }
}

export function unsubscribeUrlFor(input: {
  accountId: string;
  scope: UnsubscribeScope;
  siteUrl: string;
}): string {
  const token = signUnsubscribeToken({
    accountId: input.accountId,
    scope: input.scope,
  });
  const u = new URL(
    `${input.siteUrl.replace(/\/$/, "")}/api/email/unsubscribe`
  );
  u.searchParams.set("t", token);
  return u.toString();
}
