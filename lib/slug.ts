/**
 * Shared slugifier. Lower-cases, strips diacritics (NFKD + combining marks),
 * replaces any non [a-z0-9] runs with a single dash, trims leading/trailing
 * dashes, and truncates to `maxLength`. When the result is empty, falls back
 * to `fallback` (default: empty string).
 *
 * Callers: [`slugifyVenueName`](./venue.ts), [`slugifyDeckName`](./decks.ts),
 * `toSlugSafe` in [`lib/game/achievements.ts`](./game/achievements.ts), and the
 * inline `slugify` in the taxonomy remap route.
 */
export type SlugifyOptions = {
  /** Hard-cap on the resulting string. Default `60`. */
  maxLength?: number;
  /** Returned when the sanitized input strips down to an empty string. Default `""`. */
  fallback?: string;
};

export function slugifyText(input: string, opts: SlugifyOptions = {}): string {
  const { maxLength = 60, fallback = "" } = opts;
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
  return base || fallback;
}
