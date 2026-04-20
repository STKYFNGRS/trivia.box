import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasEffectiveOrganizerSubscription } from "./subscription";
import type { AccountRow } from "./accounts";

function makeAccount(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: "acc_1",
    clerkUserId: "user_1",
    accountType: "host",
    name: "Test",
    email: "test@example.com",
    city: "Somewhere",
    logoUrl: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionActive: false,
    createdAt: new Date(),
    ...overrides,
  } as AccountRow;
}

describe("hasEffectiveOrganizerSubscription", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("SITE_ADMIN_DEV_BYPASS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true when subscriptionActive is true", () => {
    expect(hasEffectiveOrganizerSubscription(makeAccount({ subscriptionActive: true }))).toBe(true);
  });

  it("returns false when inactive and not a site admin", () => {
    expect(hasEffectiveOrganizerSubscription(makeAccount({ subscriptionActive: false }))).toBe(false);
  });

  it("returns true for site_admin with dev bypass enabled (non-production)", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SITE_ADMIN_DEV_BYPASS", "1");
    const account = makeAccount({ accountType: "site_admin", subscriptionActive: false });
    expect(hasEffectiveOrganizerSubscription(account)).toBe(true);
  });

  it("returns false for site_admin when dev bypass is off", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SITE_ADMIN_DEV_BYPASS", "");
    const account = makeAccount({ accountType: "site_admin", subscriptionActive: false });
    expect(hasEffectiveOrganizerSubscription(account)).toBe(false);
  });

  it("returns false for site_admin in production even with bypass env set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_ADMIN_DEV_BYPASS", "1");
    const account = makeAccount({ accountType: "site_admin", subscriptionActive: false });
    expect(hasEffectiveOrganizerSubscription(account)).toBe(false);
  });
});
