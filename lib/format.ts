/**
 * Shared display formatters for player-facing surfaces.
 *
 * Consolidates four near-identical `formatMs` / `formatRank` copies that had
 * drifted on decimal precision (`toFixed(1)` vs `toFixed(2)`) and null
 * handling. Callers that want a non-null fallback should `??` the return.
 *
 * Standardizing on one decimal place matches the in-game HUD
 * (`SoloPlayClient.tsx`) and the host-recap page, which is what players are
 * looking at when their dashboard cards quote their fastest answer.
 */

/**
 * Format a millisecond duration as a human-readable string. Sub-second
 * durations render as `"123ms"`, longer durations as `"1.4s"` (one decimal
 * by default — pass `digits` to override).
 */
export function formatMs(
  ms: number | null | undefined,
  digits = 1
): string | null {
  if (ms == null) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(digits)}s`;
}

/**
 * Format a 1-based finish position as `"1st" | "2nd" | "3rd" | "<n>th"`.
 * Returns `null` when the rank is missing so callers can render an empty
 * cell or supply their own placeholder via `??`.
 */
export function formatRank(rank: number | null | undefined): string | null {
  if (rank == null) return null;
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `${rank}th`;
}
