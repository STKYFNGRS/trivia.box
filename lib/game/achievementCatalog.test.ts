import { describe, expect, it } from "vitest";
import { BASELINE_ACHIEVEMENTS } from "./achievements";
import { BASELINE_ACHIEVEMENT_CATALOG } from "./achievementCatalog";

// `computePlayerAchievementCatalog` hits the database and is covered by
// manual smoke tests. We keep this test layer pure — it only validates
// that the static catalog stays aligned with the grant-time thresholds
// so UI + runtime can't drift.

describe("achievement catalog", () => {
  it("only references slugs that exist in BASELINE_ACHIEVEMENTS", () => {
    const known = new Set(BASELINE_ACHIEVEMENTS.map((a) => a.slug));
    for (const entry of BASELINE_ACHIEVEMENT_CATALOG) {
      expect(known.has(entry.slug)).toBe(true);
    }
  });

  it("covers every baseline slug that has a threshold-style check", () => {
    // `scholar_*`, `regular_*`, `local_legend_*` are dynamic per-category /
    // per-venue and surface in the trophy wall on grant; they intentionally
    // don't live in the locked-progress catalog.
    const expected = new Set([
      "first_correct",
      "ten_correct",
      "century_club",
      "first_game",
      "quickdraw",
      "lightning",
      "hot_streak",
      "on_fire",
      "marksman",
      "podium",
      "champion",
    ]);
    const got = new Set(BASELINE_ACHIEVEMENT_CATALOG.map((e) => e.slug));
    expect(got).toEqual(expected);
  });

  it("uses non-zero, positive targets", () => {
    for (const entry of BASELINE_ACHIEVEMENT_CATALOG) {
      expect(entry.target).toBeGreaterThan(0);
    }
  });
});
