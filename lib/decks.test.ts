import { describe, expect, it } from "vitest";
import { isValidVisibilityTransition, slugifyDeckName } from "./decks";

describe("isValidVisibilityTransition", () => {
  it("allows private -> submitted", () => {
    expect(isValidVisibilityTransition("private", "submitted")).toBe(true);
  });

  it("rejects private -> public (must go through review)", () => {
    expect(isValidVisibilityTransition("private", "public")).toBe(false);
  });

  it("allows submitted -> public and submitted -> rejected", () => {
    expect(isValidVisibilityTransition("submitted", "public")).toBe(true);
    expect(isValidVisibilityTransition("submitted", "rejected")).toBe(true);
  });

  it("allows submitted -> private (host withdraws)", () => {
    expect(isValidVisibilityTransition("submitted", "private")).toBe(true);
  });

  it("freezes public decks", () => {
    expect(isValidVisibilityTransition("public", "private")).toBe(false);
    expect(isValidVisibilityTransition("public", "rejected")).toBe(false);
    expect(isValidVisibilityTransition("public", "submitted")).toBe(false);
  });

  it("allows rejected -> private/submitted so hosts can resubmit", () => {
    expect(isValidVisibilityTransition("rejected", "private")).toBe(true);
    expect(isValidVisibilityTransition("rejected", "submitted")).toBe(true);
  });

  it("rejects game_scoped transitions (terminal)", () => {
    expect(isValidVisibilityTransition("game_scoped", "public")).toBe(false);
    expect(isValidVisibilityTransition("game_scoped", "private")).toBe(false);
  });

  it("rejects same-state transitions", () => {
    expect(isValidVisibilityTransition("private", "private")).toBe(false);
    expect(isValidVisibilityTransition("public", "public")).toBe(false);
  });
});

describe("slugifyDeckName", () => {
  it("lowercases and dashes words", () => {
    expect(slugifyDeckName("Summer Movie Trivia")).toBe("summer-movie-trivia");
  });

  it("strips accents and punctuation", () => {
    expect(slugifyDeckName("Café — Night!!")).toBe("cafe-night");
  });

  it("falls back to 'deck' when nothing useful remains", () => {
    expect(slugifyDeckName("   ")).toBe("deck");
    expect(slugifyDeckName("!!!")).toBe("deck");
  });

  it("caps length at 60 characters", () => {
    const long = "a".repeat(200);
    expect(slugifyDeckName(long).length).toBe(60);
  });
});
