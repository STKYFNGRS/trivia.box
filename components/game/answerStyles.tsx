"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Four shape/color answer slots shared by `/play/[joinCode]`,
 * `/play/solo`, and the `/display` wall. Deterministic by choice index so
 * the same position always lights up the same color across every
 * surface, which is what makes hosted games legible on a big screen
 * ("the triangle answer is right!").
 *
 * Visual language: mirrors the marketing-site `NeonCard` — a dark
 * glass body with a tone-specific border + glow + top accent stripe.
 * This keeps the game experience cohesive with the landing page and
 * noticeably easier on the eyes than a wall of Kahoot-solid neon fills,
 * while preserving the "each letter has its own color" grammar so the
 * host's display and the player's phone agree.
 */

export type AnswerShape = "triangle" | "diamond" | "circle" | "square";

export type AnswerStyle = {
  /** CSS color expression (`var(--neon-*)`) used for border, glow, icon. */
  tone: string;
  /** Semantic tone name — handy for debug markers / test selectors. */
  toneName: "magenta" | "cyan" | "amber" | "lime";
  /** Letter badge rendered on the right of the button. */
  label: string;
  /** Icon glyph rendered in the tinted chip on the left of the button. */
  shape: AnswerShape;
};

export const ANSWER_STYLES: readonly AnswerStyle[] = [
  { tone: "var(--neon-magenta)", toneName: "magenta", label: "A", shape: "triangle" },
  { tone: "var(--neon-cyan)", toneName: "cyan", label: "B", shape: "diamond" },
  { tone: "var(--neon-amber)", toneName: "amber", label: "C", shape: "circle" },
  { tone: "var(--neon-lime)", toneName: "lime", label: "D", shape: "square" },
] as const;

/** Visual states a single answer button can be in. */
export type AnswerState = "default" | "picked" | "correct" | "wrong";

/**
 * Returns inline styles that reproduce the `NeonCard` look on an answer
 * button: dark glass body + tone-tinted border + tone-tinted glow. The
 * `state` modulates border / glow intensity (picked is brighter, correct
 * is even brighter, wrong collapses the glow so the eye naturally
 * settles on the right answer at reveal time).
 *
 * Consumers are expected to also apply `border` class + `rounded-*` and
 * a top accent stripe via `answerTopStripeStyle`.
 */
export function answerCardStyle(opts: {
  tone: string;
  state?: AnswerState;
}): CSSProperties {
  const { tone, state = "default" } = opts;
  const borderMix =
    state === "correct" ? 85 : state === "picked" ? 60 : state === "wrong" ? 25 : 40;
  const glowAlpha =
    state === "correct" ? 90 : state === "picked" ? 70 : state === "wrong" ? 20 : 45;
  const innerMix =
    state === "correct" ? 45 : state === "picked" ? 32 : state === "wrong" ? 10 : 22;
  return {
    background:
      "linear-gradient(180deg, color-mix(in oklab, var(--stage-surface) 96%, transparent), color-mix(in oklab, var(--stage-bg) 92%, transparent))",
    borderColor: `color-mix(in oklab, ${tone} ${borderMix}%, transparent)`,
    boxShadow: `inset 0 1px 0 0 color-mix(in oklab, ${tone} ${innerMix}%, transparent), 0 14px 44px -16px color-mix(in oklab, ${tone} ${glowAlpha}%, transparent)`,
  };
}

/** Tone-tinted chip that holds the shape icon. */
export function answerIconChipStyle(opts: { tone: string }): CSSProperties {
  return {
    background: `color-mix(in oklab, ${opts.tone} 22%, transparent)`,
    borderColor: `color-mix(in oklab, ${opts.tone} 50%, transparent)`,
    color: opts.tone,
  };
}

/** 1px accent stripe across the top of the card (matches NeonCard). */
export function answerTopStripeStyle(opts: { tone: string }): CSSProperties {
  return {
    background: `linear-gradient(90deg, transparent, ${opts.tone}, transparent)`,
  };
}

export function ChoiceShape({
  shape,
  className,
}: {
  shape: AnswerShape;
  className?: string;
}) {
  const common = cn("h-6 w-6 shrink-0", className);
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
