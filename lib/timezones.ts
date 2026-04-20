/** Curated list for selects; full IANA validation still runs on the server. */
export const COMMON_IANA_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
] as const;

let supportedCache: Set<string> | null = null;

export function isValidIanaTimeZone(tz: string): boolean {
  const t = tz.trim();
  if (!t) return false;
  try {
    if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
      if (!supportedCache) {
        supportedCache = new Set(Intl.supportedValuesOf("timeZone"));
      }
      if (supportedCache.has(t)) return true;
    }
    Intl.DateTimeFormat(undefined, { timeZone: t });
    return true;
  } catch {
    return false;
  }
}
