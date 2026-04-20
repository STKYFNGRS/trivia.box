import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import type { z } from "zod";

/**
 * Thrown from handlers / helpers when a specific HTTP status should bubble up
 * to the response, instead of collapsing everything into a generic 400.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "ApiError";
  }
}

/**
 * Convert an unknown thrown value into a JSON response.
 * - `ApiError` preserves its status + code and is NOT reported to Sentry for
 *   expected 4xx cases (401/403/404/409/429). 5xx `ApiError`s and any other
 *   thrown value are reported so they show up as real incidents.
 * - Anything non-`ApiError` is surfaced as 500 (do NOT mask bugs as 400s).
 */
export function apiErrorResponse(e: unknown, fallback = "Internal server error") {
  if (e instanceof ApiError) {
    if (e.status >= 500) {
      Sentry.captureException(e, {
        tags: { api_error_status: String(e.status), api_error_code: e.code ?? "unknown" },
      });
    }
    return NextResponse.json(
      { error: e.message, ...(e.code ? { code: e.code } : {}) },
      { status: e.status }
    );
  }
  if (e instanceof Error) {
    Sentry.captureException(e, { tags: { api_error_status: "500" } });
    return NextResponse.json({ error: e.message || fallback }, { status: 500 });
  }
  Sentry.captureException(new Error(fallback), {
    extra: { thrownValue: String(e) },
    tags: { api_error_status: "500" },
  });
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/**
 * Flatten a Zod `SafeParseError` into a human-readable string so the client
 * can `toast.error(data.error)` directly. Without this, Zod 400 bodies are
 * `{ error: { formErrors: [...], fieldErrors: { ... } } }` and every UI that
 * reads `typeof data.error === "string"` falls back to a generic "Failed"
 * message — which made the answer-click bug feel like the server was silent.
 *
 * The first field error beats the form error so the message points at the
 * actual offending field (e.g. "sessionQuestionId: Required"). If nothing is
 * present we return a caller-supplied fallback.
 */
export function flattenZodError(
  error: z.ZodError,
  fallback = "Invalid request"
): string {
  const flat = error.flatten();
  const fieldEntries = Object.entries(flat.fieldErrors);
  for (const [field, issues] of fieldEntries) {
    const first = issues?.[0];
    if (first) return `${field}: ${first}`;
  }
  const firstForm = flat.formErrors[0];
  if (firstForm) return firstForm;
  return fallback;
}

/** Build a 400 response with a human-readable message from a Zod error. */
export function zodErrorResponse(error: z.ZodError, fallback = "Invalid request") {
  return NextResponse.json({ error: flattenZodError(error, fallback) }, { status: 400 });
}
