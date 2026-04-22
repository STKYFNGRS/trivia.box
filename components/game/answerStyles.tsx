"use client";

/**
 * Four shape/color answer slots shared by `/play/[joinCode]`, `/play/solo`,
 * and the `/display` wall. Deterministic by choice index so the same
 * position always lights up the same color across every surface, which is
 * the thing that makes hosted games legible on a big screen ("the
 * triangle answer is right!"). Kept in a tiny standalone module so solo
 * and hosted can't visually drift — touching this file updates all
 * three surfaces at once.
 */

export type AnswerShape = "triangle" | "diamond" | "circle" | "square";

export type AnswerStyle = {
  /** Tailwind bg class driven off our `--answer-*` CSS vars. */
  bg: string;
  /** Letter badge rendered on the right of the button. */
  label: string;
  /** Icon glyph rendered in the badge chip. */
  shape: AnswerShape;
};

export const ANSWER_STYLES: readonly AnswerStyle[] = [
  { bg: "bg-[var(--answer-rose)]", label: "A", shape: "triangle" },
  { bg: "bg-[var(--answer-sky)]", label: "B", shape: "diamond" },
  { bg: "bg-[var(--answer-amber)]", label: "C", shape: "circle" },
  { bg: "bg-[var(--answer-emerald)]", label: "D", shape: "square" },
] as const;

export function ChoiceShape({ shape }: { shape: AnswerShape }) {
  const common = "h-6 w-6 shrink-0";
  if (shape === "triangle") {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden>
        <polygon points="12,3 22,21 2,21" fill="currentColor" />
      </svg>
    );
  }
  if (shape === "diamond") {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden>
        <polygon points="12,2 22,12 12,22 2,12" fill="currentColor" />
      </svg>
    );
  }
  if (shape === "circle") {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden>
        <circle cx="12" cy="12" r="10" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={common} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" />
    </svg>
  );
}

/** Shared pill look used by top-bar chips, lock/reveal badges, etc. */
export const PILL_CLASSES =
  "inline-flex items-center gap-1.5 rounded-full bg-[var(--stage-glass)] px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-white/80 ring-1 ring-white/10 backdrop-blur-md";
