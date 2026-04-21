import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./unsubscribe";

// Force a stable secret so the signed payloads below are reproducible
// across runs regardless of the developer's environment.
const originalSecret = process.env.EMAIL_UNSUBSCRIBE_SECRET;

beforeAll(() => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "trivia-box-test-secret";
});

afterAll(() => {
  if (originalSecret === undefined) {
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
  } else {
    process.env.EMAIL_UNSUBSCRIBE_SECRET = originalSecret;
  }
});

describe("unsubscribe tokens", () => {
  it("round-trips the signed payload", () => {
    const token = signUnsubscribeToken({
      accountId: "acc-123",
      scope: "weekly_digest",
      now: new Date("2026-04-21T12:00:00Z"),
    });
    const parsed = verifyUnsubscribeToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed?.accountId).toBe("acc-123");
    expect(parsed?.scope).toBe("weekly_digest");
    expect(typeof parsed?.iat).toBe("number");
  });

  it("rejects a tampered signature", () => {
    const token = signUnsubscribeToken({
      accountId: "acc-xyz",
      scope: "all",
    });
    const tampered = token.slice(0, -2) + "AA";
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const token = signUnsubscribeToken({
      accountId: "acc-real",
      scope: "marketing",
    });
    const dot = token.indexOf(".");
    const tamperedPayload = "AAAA" + token.slice(dot);
    expect(verifyUnsubscribeToken(tamperedPayload)).toBeNull();
  });

  it("rejects malformed strings", () => {
    expect(verifyUnsubscribeToken(null)).toBeNull();
    expect(verifyUnsubscribeToken("")).toBeNull();
    expect(verifyUnsubscribeToken("no-dot")).toBeNull();
    expect(verifyUnsubscribeToken(".")).toBeNull();
    expect(verifyUnsubscribeToken("abc.")).toBeNull();
  });

  it("rejects an unknown scope even if signature is valid", () => {
    // Hand-sign a payload with a scope that isn't in the allowlist. We
    // can't use `signUnsubscribeToken` here because its type rejects it,
    // so reach into the low-level primitive the same way a would-be
    // attacker would.
    const bad = signUnsubscribeToken({
      accountId: "acc-bad",
      // @ts-expect-error — simulating an attacker crafting an unknown scope
      scope: "something_else",
    });
    expect(verifyUnsubscribeToken(bad)).toBeNull();
  });
});
