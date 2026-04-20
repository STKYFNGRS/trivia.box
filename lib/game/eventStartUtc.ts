import { fromZonedTime } from "date-fns-tz";

/** Interprets wall-clock date+time in `timeZone` (IANA) and returns the UTC instant. */
export function wallClockToUtcDate(dateStr: string, timeStr: string, timeZone: string): Date {
  const normalized = `${dateStr.trim()}T${timeStr.trim()}:00`;
  return fromZonedTime(normalized, timeZone);
}
