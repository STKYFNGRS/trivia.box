import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSiteAdminClerkUserId,
  parseSiteAdminClerkAllowlist,
  siteAdminDevBypassEnabled,
} from "./siteAdmin";

describe("siteAdmin allowlist parsing", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("SITE_ADMIN_CLERK_USER_IDS", "");
    vi.stubEnv("SITE_ADMIN_DEV_BYPASS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns an empty set when the env var is missing", () => {
    expect(parseSiteAdminClerkAllowlist().size).toBe(0);
  });

  it("parses a comma-separated list and trims whitespace", () => {
    vi.stubEnv("SITE_ADMIN_CLERK_USER_IDS", " user_1 , user_2 ,user_3 ");
    const set = parseSiteAdminClerkAllowlist();
    expect(set.has("user_1")).toBe(true);
    expect(set.has("user_2")).toBe(true);
    expect(set.has("user_3")).toBe(true);
    expect(set.size).toBe(3);
  });

  it("isSiteAdminClerkUserId only matches listed ids", () => {
    vi.stubEnv("SITE_ADMIN_CLERK_USER_IDS", "user_1,user_2");
    expect(isSiteAdminClerkUserId("user_1")).toBe(true);
    expect(isSiteAdminClerkUserId("user_3")).toBe(false);
  });

  it("dev bypass requires both non-production and explicit env=1", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SITE_ADMIN_DEV_BYPASS", "");
    expect(siteAdminDevBypassEnabled()).toBe(false);
    vi.stubEnv("SITE_ADMIN_DEV_BYPASS", "1");
    expect(siteAdminDevBypassEnabled()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(siteAdminDevBypassEnabled()).toBe(false);
  });
});
