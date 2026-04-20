import { describe, expect, it } from "vitest";
import { slugifyText } from "./slug";

describe("slugifyText", () => {
  it("lower-cases, dashes non-alphanumerics, and trims edge dashes", () => {
    expect(slugifyText("Hello World")).toBe("hello-world");
    expect(slugifyText("  Hello   World!! ")).toBe("hello-world");
    expect(slugifyText("--weird--naming--")).toBe("weird-naming");
  });

  it("strips combining diacritical marks via NFKD", () => {
    expect(slugifyText("Café")).toBe("cafe");
    expect(slugifyText("naïve façade")).toBe("naive-facade");
    expect(slugifyText("São Paulo")).toBe("sao-paulo");
  });

  it("honors the default 60-char max", () => {
    const long = "a".repeat(80);
    expect(slugifyText(long).length).toBe(60);
  });

  it("honors a custom maxLength", () => {
    const long = "a".repeat(80);
    expect(slugifyText(long, { maxLength: 40 })).toBe("a".repeat(40));
    expect(slugifyText(long, { maxLength: 64 }).length).toBe(64);
  });

  it("returns empty string by default when input strips to empty", () => {
    expect(slugifyText("")).toBe("");
    expect(slugifyText("   ")).toBe("");
    expect(slugifyText("!!!???")).toBe("");
  });

  it("returns the fallback when input strips to empty and fallback is set", () => {
    expect(slugifyText("", { fallback: "venue" })).toBe("venue");
    expect(slugifyText("!!!", { fallback: "deck" })).toBe("deck");
    expect(slugifyText("   ", { fallback: "subcategory" })).toBe("subcategory");
  });

  it("does not clip a non-empty prefix even if truncation lands on a dash (no re-trim)", () => {
    expect(slugifyText("hello-world", { maxLength: 6 })).toBe("hello-");
  });

  it("keeps digits and collapses Unicode whitespace runs", () => {
    expect(slugifyText("Pop\u00A0Culture 2024")).toBe("pop-culture-2024");
  });
});
