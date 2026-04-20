import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError, apiErrorResponse, flattenZodError } from "./apiError";

describe("ApiError", () => {
  it("preserves status + code through apiErrorResponse", async () => {
    const res = apiErrorResponse(new ApiError(409, "Too late", "CONFLICT"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: "Too late", code: "CONFLICT" });
  });

  it("wraps generic Error as 500", async () => {
    const res = apiErrorResponse(new Error("db down"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("db down");
  });
});

describe("flattenZodError", () => {
  it("surfaces the first field error with field name prefix", () => {
    const schema = z.object({
      sessionQuestionId: z.string().uuid(),
      answer: z.string().min(1),
    });
    const result = schema.safeParse({ sessionQuestionId: "not-a-uuid", answer: "" });
    if (result.success) throw new Error("expected failure");
    const msg = flattenZodError(result.error);
    expect(msg).toMatch(/^sessionQuestionId: /);
  });

  it("returns the form error when there are no field errors", () => {
    const schema = z.string().refine(() => false, { message: "form broke" });
    const result = schema.safeParse("x");
    if (result.success) throw new Error("expected failure");
    expect(flattenZodError(result.error)).toBe("form broke");
  });

  it("falls back to the supplied fallback when the flatten is empty", () => {
    // Construct a synthetic ZodError with no issues.
    const empty = new z.ZodError([]);
    expect(flattenZodError(empty, "custom fallback")).toBe("custom fallback");
  });
});
