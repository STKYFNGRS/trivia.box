import { describe, expect, it } from "vitest";
import { clientIpFromRequest, __testing } from "./rateLimit";

describe("rateLimit — environment gating", () => {
  it("returns null redis when env vars are missing (local dev / CI)", () => {
    // The module was imported without UPSTASH_REDIS_REST_URL set in test env
    // (vitest.config uses a clean NODE_ENV and no `.env` loader). If this
    // changes — e.g. a dev accidentally exports Upstash vars to their shell
    // and runs tests — we want the test to fail loudly so we notice.
    expect(__testing.getRedis()).toBeNull();
  });

  it("exposes sensible bucket configs", () => {
    const { CONFIGS } = __testing;
    expect(CONFIGS.publicJoin.limit).toBe(10);
    expect(CONFIGS.publicJoin.window).toBe("1 m");
    expect(CONFIGS.publicAnswer.limit).toBe(120);
    expect(CONFIGS.adminGenerate.limit).toBe(30);
    expect(CONFIGS.adminGenerate.window).toBe("1 h");
    expect(CONFIGS.anonymous.limit).toBe(60);
  });
});

describe("rateLimit — checkRateLimit fail-open behavior", () => {
  it("allows every request and returns null remaining when limiter is disabled", async () => {
    const { checkRateLimit } = await import("./rateLimit");
    for (let i = 0; i < 50; i++) {
      const res = await checkRateLimit("publicJoin", "ip:1.2.3.4");
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBeNull();
      expect(res.reset).toBeNull();
    }
  });
});

describe("rateLimit — enforceRateLimit fail-open behavior", () => {
  it("never throws when limiter is disabled", async () => {
    const { enforceRateLimit } = await import("./rateLimit");
    await expect(enforceRateLimit("publicAnswer", "player:xyz")).resolves.toBeUndefined();
    await expect(enforceRateLimit("adminGenerate", "admin:abc")).resolves.toBeUndefined();
  });
});

describe("rateLimit — clientIpFromRequest", () => {
  it("reads the leftmost X-Forwarded-For entry", () => {
    const req = new Request("https://x.example.com/", {
      headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1, 10.0.0.2" },
    });
    expect(clientIpFromRequest(req)).toBe("203.0.113.1");
  });

  it("falls back to X-Real-IP when no XFF", () => {
    const req = new Request("https://x.example.com/", {
      headers: { "x-real-ip": "198.51.100.5" },
    });
    expect(clientIpFromRequest(req)).toBe("198.51.100.5");
  });

  it("returns 'unknown' when neither header is present", () => {
    const req = new Request("https://x.example.com/");
    expect(clientIpFromRequest(req)).toBe("unknown");
  });

  it("tolerates an empty X-Forwarded-For and falls through", () => {
    const req = new Request("https://x.example.com/", {
      headers: { "x-forwarded-for": "", "x-real-ip": "198.51.100.99" },
    });
    expect(clientIpFromRequest(req)).toBe("198.51.100.99");
  });
});
