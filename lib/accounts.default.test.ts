import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deriveAccountTypeForNewUser } from "./accounts";

describe("deriveAccountTypeForNewUser", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.SITE_ADMIN_CLERK_USER_IDS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults to player when metadata is missing", () => {
    expect(deriveAccountTypeForNewUser("user_1", {})).toBe("player");
  });

  it("defaults to player even when legacy metadata requests host", () => {
    expect(deriveAccountTypeForNewUser("user_1", { account_type: "host" })).toBe("player");
  });

  it("defaults to player even when legacy metadata requests venue", () => {
    expect(deriveAccountTypeForNewUser("user_1", { account_type: "venue" })).toBe("player");
  });

  it("returns site_admin when the Clerk id is in the allowlist", () => {
    process.env.SITE_ADMIN_CLERK_USER_IDS = "user_site_1,user_site_2";
    expect(deriveAccountTypeForNewUser("user_site_1", {})).toBe("site_admin");
    expect(deriveAccountTypeForNewUser("user_other", {})).toBe("player");
  });
});
