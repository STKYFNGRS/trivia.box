import { describe, expect, it } from "vitest";
import {
  deriveVenueDisplayName,
  pickAvailableSlug,
  slugifyVenueName,
} from "./venue";

describe("slugifyVenueName", () => {
  it("lowercases and replaces whitespace with dashes", () => {
    expect(slugifyVenueName("The Lumber Mill")).toBe("the-lumber-mill");
  });

  it("strips punctuation and collapses repeated dashes", () => {
    expect(slugifyVenueName("O'Malley's Pub!!")).toBe("o-malley-s-pub");
  });

  it("strips leading and trailing dashes", () => {
    expect(slugifyVenueName("---edge---")).toBe("edge");
  });

  it("strips diacritics", () => {
    expect(slugifyVenueName("Café Olé")).toBe("cafe-ole");
  });

  it("falls back to 'venue' on empty input", () => {
    expect(slugifyVenueName("")).toBe("venue");
    expect(slugifyVenueName("!!!")).toBe("venue");
  });

  it("caps at 60 characters", () => {
    const long = "a".repeat(120);
    expect(slugifyVenueName(long).length).toBe(60);
  });
});

describe("deriveVenueDisplayName", () => {
  it("returns the trimmed name when present", () => {
    expect(deriveVenueDisplayName({ name: "  Big Room  ", email: "x@y.com" })).toBe(
      "Big Room"
    );
  });

  it("falls back to the email local-part when name is empty", () => {
    expect(deriveVenueDisplayName({ name: "", email: "hostess@example.com" })).toBe(
      "hostess"
    );
  });

  it("falls back to 'Untitled venue' when both are empty", () => {
    expect(deriveVenueDisplayName({ name: "", email: "" })).toBe("Untitled venue");
    expect(deriveVenueDisplayName({})).toBe("Untitled venue");
  });
});

describe("pickAvailableSlug", () => {
  it("returns the base slug when available", async () => {
    const taken = new Set<string>();
    const slug = await pickAvailableSlug(
      "Blue Moon Cafe",
      async (c) => taken.has(c)
    );
    expect(slug).toBe("blue-moon-cafe");
  });

  it("suffixes -2, -3, ... on collisions", async () => {
    const taken = new Set(["blue-moon", "blue-moon-2"]);
    const slug = await pickAvailableSlug(
      "Blue Moon",
      async (c) => taken.has(c)
    );
    expect(slug).toBe("blue-moon-3");
  });

  it("keeps the overall slug ≤60 chars even when suffixing", async () => {
    const longName = "x".repeat(80);
    const taken = new Set<string>();
    // Make the base slug itself always "taken" once, to force suffixing.
    const base = "x".repeat(60);
    taken.add(base);
    const slug = await pickAvailableSlug(
      longName,
      async (c) => taken.has(c)
    );
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-2")).toBe(true);
  });
});
