/**
 * Constants shared between the solo server code (`lib/game/solo.ts`) and
 * client components (`app/play/solo/*`). Kept in a separate file so client
 * bundles don't pull in the db / drizzle dependencies that live alongside
 * the server helpers.
 */

export const SOLO_SPEEDS = {
  chill: { seconds: 25, label: "Chill" },
  standard: { seconds: 15, label: "Standard" },
  blitz: { seconds: 8, label: "Blitz" },
} as const;

export type SoloSpeed = keyof typeof SOLO_SPEEDS;

export function isSoloSpeed(value: unknown): value is SoloSpeed {
  return typeof value === "string" && value in SOLO_SPEEDS;
}

export const MIN_SOLO_QUESTIONS = 5;
export const MAX_SOLO_QUESTIONS = 25;
