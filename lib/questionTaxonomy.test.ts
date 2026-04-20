import { describe, expect, it } from "vitest";
import { allocateJobsByGap } from "./questionTaxonomy";

type B = { id: string; categoryLabel: string; absoluteGap: number };

function b(id: string, cat: string, gap: number): B {
  return { id, categoryLabel: cat, absoluteGap: gap };
}

describe("allocateJobsByGap — category fairness pass", () => {
  it("gives at least one job to every category with a gap when total ≥ categories", () => {
    const buckets: B[] = [
      b("nature-1", "nature", 650),
      b("nature-2", "nature", 500),
      b("tech-1", "technology", 600),
      b("wordplay-1", "wordplay", 550),
      b("sports-1", "sports", 10),
    ];
    const alloc = allocateJobsByGap(10, buckets);
    const catsHit = new Set<string>();
    for (const [id, n] of alloc) {
      expect(n).toBeGreaterThan(0);
      catsHit.add(buckets.find((x) => x.id === id)!.categoryLabel);
    }
    expect(catsHit).toEqual(new Set(["nature", "technology", "wordplay", "sports"]));
  });

  it("picks the highest-gap bucket as each category's representative", () => {
    const buckets: B[] = [
      b("nat-small", "nature", 100),
      b("nat-big", "nature", 650),
      b("tech-small", "technology", 50),
      b("tech-big", "technology", 600),
    ];
    // With total=2, only the fairness pass runs — exactly one rep per category.
    const alloc = allocateJobsByGap(2, buckets);
    expect(alloc.get("nat-big")).toBe(1);
    expect(alloc.get("tech-big")).toBe(1);
    expect(alloc.get("nat-small")).toBeUndefined();
    expect(alloc.get("tech-small")).toBeUndefined();
  });

  it("when total < number of categories, neediest categories still win", () => {
    const buckets: B[] = [
      b("huge", "huge-cat", 700),
      b("mid", "mid-cat", 300),
      b("tiny", "tiny-cat", 5),
    ];
    const alloc = allocateJobsByGap(2, buckets);
    expect(alloc.get("huge")).toBe(1);
    expect(alloc.get("mid")).toBe(1);
    expect(alloc.get("tiny")).toBeUndefined();
  });
});

describe("allocateJobsByGap — proportional remainder", () => {
  it("sums exactly to totalJobs", () => {
    const buckets: B[] = [
      b("a", "cat-a", 700),
      b("b", "cat-b", 500),
      b("c", "cat-c", 300),
      b("d", "cat-d", 100),
    ];
    for (const total of [5, 7, 13, 42, 101, 500]) {
      const alloc = allocateJobsByGap(total, buckets);
      const sum = [...alloc.values()].reduce((s, n) => s + n, 0);
      expect(sum).toBe(total);
    }
  });

  it("distributes the remainder proportionally to absoluteGap", () => {
    // 4 buckets × 1 job from fairness pass = 4 jobs consumed.
    // Remaining 96 split 70/50/30/10 → ratios 0.4375/0.3125/0.1875/0.0625
    // → approximately 42/30/18/6 additional jobs.
    // Total per bucket: 43/31/19/7.
    const buckets: B[] = [
      b("a", "cat-a", 700),
      b("b", "cat-b", 500),
      b("c", "cat-c", 300),
      b("d", "cat-d", 100),
    ];
    const alloc = allocateJobsByGap(100, buckets);
    expect(alloc.get("a")).toBe(43);
    expect(alloc.get("b")).toBe(31);
    expect(alloc.get("c")).toBe(19);
    expect(alloc.get("d")).toBe(7);
  });

  it("ignores buckets whose absoluteGap is zero (already saturated)", () => {
    const buckets: B[] = [
      b("full", "cat-full", 0),
      b("needs", "cat-needs", 400),
    ];
    const alloc = allocateJobsByGap(10, buckets);
    expect(alloc.get("full")).toBeUndefined();
    expect(alloc.get("needs")).toBe(10);
  });
});

describe("allocateJobsByGap — edge cases", () => {
  it("returns empty for zero / negative totalJobs", () => {
    const buckets: B[] = [b("a", "x", 100)];
    expect(allocateJobsByGap(0, buckets).size).toBe(0);
    expect(allocateJobsByGap(-5, buckets).size).toBe(0);
  });

  it("returns empty when no buckets have a gap", () => {
    const buckets: B[] = [
      b("a", "x", 0),
      b("b", "y", 0),
    ];
    expect(allocateJobsByGap(50, buckets).size).toBe(0);
  });

  it("returns empty for empty buckets input", () => {
    expect(allocateJobsByGap(100, []).size).toBe(0);
  });

  it("handles total=1 by giving the single job to the highest-gap category", () => {
    const buckets: B[] = [
      b("low", "cat-low", 10),
      b("high", "cat-high", 900),
    ];
    const alloc = allocateJobsByGap(1, buckets);
    expect(alloc.get("high")).toBe(1);
    expect(alloc.size).toBe(1);
  });
});
