import { describe, expect, it } from "vitest";
import { wallClockToUtcDate } from "./eventStartUtc";

describe("wallClockToUtcDate", () => {
  it("interprets wall-clock time in the given IANA zone as UTC", () => {
    // 2026-04-15 20:00 in America/New_York (EDT, UTC-4) -> 2026-04-16T00:00:00Z
    const utc = wallClockToUtcDate("2026-04-15", "20:00", "America/New_York");
    expect(utc.toISOString()).toBe("2026-04-16T00:00:00.000Z");
  });

  it("handles UTC passthrough", () => {
    const utc = wallClockToUtcDate("2026-06-01", "12:30", "UTC");
    expect(utc.toISOString()).toBe("2026-06-01T12:30:00.000Z");
  });

  it("respects winter offset (EST, UTC-5)", () => {
    // 2026-01-15 19:00 EST -> 2026-01-16T00:00:00Z
    const utc = wallClockToUtcDate("2026-01-15", "19:00", "America/New_York");
    expect(utc.toISOString()).toBe("2026-01-16T00:00:00.000Z");
  });

  it("handles trimming of whitespace in inputs", () => {
    const utc = wallClockToUtcDate(" 2026-06-01 ", " 12:30 ", "UTC");
    expect(utc.toISOString()).toBe("2026-06-01T12:30:00.000Z");
  });
});
