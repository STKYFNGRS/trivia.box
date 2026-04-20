import { describe, expect, it } from "vitest";
import { resolveTimerSeconds } from "./hostActions";

describe("resolveTimerSeconds", () => {
  it("prefers the round override when set", () => {
    expect(resolveTimerSeconds(30, 20)).toBe(30);
  });

  it("falls back to the session default when round is null", () => {
    expect(resolveTimerSeconds(null, 20)).toBe(20);
  });

  it("falls back to the session default when round is 0 / invalid", () => {
    expect(resolveTimerSeconds(0, 20)).toBe(20);
  });

  it("returns null (manual timer mode) when neither is positive", () => {
    expect(resolveTimerSeconds(null, null)).toBeNull();
    expect(resolveTimerSeconds(0, 0)).toBeNull();
    expect(resolveTimerSeconds(null, 0)).toBeNull();
  });

  it("rejects negative round seconds and falls back to session", () => {
    expect(resolveTimerSeconds(-5, 15)).toBe(15);
  });
});
