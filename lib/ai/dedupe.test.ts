import { afterEach, describe, expect, it } from "vitest";
import {
  dedupeWithinBatchParaphrase,
  getDuplicateRejectThreshold,
  jaccardSimilarity,
  normalizeBodyForDedupe,
  tokenSetForOverlap,
} from "./dedupe";

describe("normalizeBodyForDedupe", () => {
  it("lowercases, strips punctuation, and collapses whitespace", () => {
    expect(normalizeBodyForDedupe("  What is 2 + 2?  ")).toBe("what is 2 2");
  });

  it("returns empty string when input is whitespace", () => {
    expect(normalizeBodyForDedupe("   ")).toBe("");
  });
});

describe("jaccardSimilarity", () => {
  it("returns 0 for disjoint sets", () => {
    expect(jaccardSimilarity(new Set(["a", "b"]), new Set(["c", "d"]))).toBe(0);
  });

  it("returns 1 for identical sets", () => {
    expect(jaccardSimilarity(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
  });

  it("returns intersection / union for overlapping sets", () => {
    expect(jaccardSimilarity(new Set(["a", "b", "c"]), new Set(["b", "c", "d"]))).toBeCloseTo(2 / 4);
  });

  it("returns 0 when both sets are empty", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });
});

describe("tokenSetForOverlap", () => {
  it("drops short tokens (length <= 2)", () => {
    const tokens = tokenSetForOverlap("An apple is a fruit");
    expect(tokens.has("an")).toBe(false);
    expect(tokens.has("is")).toBe(false);
    expect(tokens.has("apple")).toBe(true);
    expect(tokens.has("fruit")).toBe(true);
  });
});

describe("dedupeWithinBatchParaphrase", () => {
  it("drops exact duplicates after normalization", () => {
    const out = dedupeWithinBatchParaphrase([
      { body: "What is the capital of France?" },
      { body: "what is THE capital of france" },
    ]);
    expect(out).toHaveLength(1);
  });

  it("drops items that share a long prefix", () => {
    const out = dedupeWithinBatchParaphrase([
      { body: "The first man to walk on the surface of the moon was Neil A. Armstrong in 1969." },
      { body: "The first man to walk on the surface of the moon did so on July 20, 1969 UTC." },
    ]);
    expect(out).toHaveLength(1);
  });

  it("drops items with high token overlap (paraphrases)", () => {
    const out = dedupeWithinBatchParaphrase([
      { body: "Which planet in our solar system has the largest recorded mountain feature?" },
      { body: "Which planet has the largest recorded mountain feature in our solar system?" },
    ]);
    expect(out).toHaveLength(1);
  });

  it("keeps semantically distinct items", () => {
    const out = dedupeWithinBatchParaphrase([
      { body: "What is the boiling point of pure water at sea level in Celsius?" },
      { body: "Who painted the ceiling of the Sistine Chapel between 1508 and 1512?" },
    ]);
    expect(out).toHaveLength(2);
  });

  it("drops items whose normalized body is too short to fingerprint", () => {
    const out = dedupeWithinBatchParaphrase([
      { body: "Hi?" },
      { body: "What is the capital of France?" },
    ]);
    expect(out.map((i) => i.body)).toEqual(["What is the capital of France?"]);
  });
});

describe("getDuplicateRejectThreshold", () => {
  const originalEnv = process.env.QUESTION_DEDUPE_REJECT_THRESHOLD;
  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.QUESTION_DEDUPE_REJECT_THRESHOLD;
    } else {
      process.env.QUESTION_DEDUPE_REJECT_THRESHOLD = originalEnv;
    }
  });

  it("defaults to 1 when unset", () => {
    delete process.env.QUESTION_DEDUPE_REJECT_THRESHOLD;
    expect(getDuplicateRejectThreshold()).toBe(1);
  });

  it("accepts non-negative integers", () => {
    process.env.QUESTION_DEDUPE_REJECT_THRESHOLD = "3";
    expect(getDuplicateRejectThreshold()).toBe(3);
  });

  it("falls back to 1 on malformed values", () => {
    process.env.QUESTION_DEDUPE_REJECT_THRESHOLD = "abc";
    expect(getDuplicateRejectThreshold()).toBe(1);
  });

  it("floors fractional values", () => {
    process.env.QUESTION_DEDUPE_REJECT_THRESHOLD = "2.9";
    expect(getDuplicateRejectThreshold()).toBe(2);
  });
});
