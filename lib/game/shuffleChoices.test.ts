import { describe, expect, it } from "vitest";
import { buildChoiceList, shuffleChoicesFor } from "./shuffleChoices";

describe("shuffleChoicesFor", () => {
  it("is deterministic for the same seed", () => {
    const seed = "c7b0e7b0-0000-4000-8000-000000000001";
    const input = ["a", "b", "c", "d"];
    const first = shuffleChoicesFor(seed, input);
    const second = shuffleChoicesFor(seed, input);
    expect(first).toEqual(second);
  });

  it("produces different orderings for different seeds", () => {
    const input = ["a", "b", "c", "d"];
    const seeds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ];
    const orderings = new Set(seeds.map((s) => shuffleChoicesFor(s, input).join("|")));
    expect(orderings.size).toBeGreaterThan(1);
  });

  it("does not mutate the input array", () => {
    const input = ["a", "b", "c", "d"];
    const frozen = Object.freeze([...input]);
    shuffleChoicesFor("any-seed", frozen as string[]);
    expect(input).toEqual(["a", "b", "c", "d"]);
  });

  it("preserves the set of items", () => {
    const input = ["alpha", "beta", "gamma", "delta"];
    const out = shuffleChoicesFor("some-seed-value", input);
    expect(out.slice().sort()).toEqual(input.slice().sort());
  });
});

describe("buildChoiceList", () => {
  it("combines correct + wrong answers and shuffles deterministically", () => {
    const id = "deadbeef-dead-4000-8000-deadbeefdead";
    const a = buildChoiceList(id, "Paris", ["London", "Rome", "Berlin"]);
    const b = buildChoiceList(id, "Paris", ["London", "Rome", "Berlin"]);
    expect(a).toEqual(b);
    expect(a.slice().sort()).toEqual(["Berlin", "London", "Paris", "Rome"]);
  });

  it("tolerates null wrongAnswers", () => {
    const out = buildChoiceList("id-1", "yes", null);
    expect(out).toEqual(["yes"]);
  });

  it("drops empty / non-string entries defensively", () => {
    const out = buildChoiceList("id-2", "a", ["b", "", "c"]);
    expect(out.slice().sort()).toEqual(["a", "b", "c"]);
  });
});
