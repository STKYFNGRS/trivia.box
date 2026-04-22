/**
 * Pure, client-safe formatter for the five structured venue address columns.
 *
 * Kept in its own module so client components (e.g. the dashboard venues
 * list) can import it without pulling in `@/lib/venue`, which opens a live
 * DB connection at module-scope and is strictly server-only.
 *
 * Region and postal code are joined with a single space so "CA 92101" reads
 * naturally; country is only appended when it's not "US"/"USA" to keep
 * domestic addresses clean. Returns `null` when every field is blank so the
 * caller can decide whether to fall back to `accounts.city`.
 */
export function formatVenueAddress(input: {
  addressStreet: string | null;
  addressCity: string | null;
  addressRegion: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;
}): string | null {
  const regionZip = [input.addressRegion, input.addressPostalCode]
    .map((s) => s?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  const country = input.addressCountry?.trim() ?? "";
  const showCountry = country && !/^(us|usa|united states)$/i.test(country);
  const parts = [
    input.addressStreet?.trim(),
    input.addressCity?.trim(),
    regionZip || null,
    showCountry ? country : null,
  ]
    .map((s) => (s && s.length > 0 ? s : null))
    .filter((s): s is string => Boolean(s));
  if (parts.length === 0) return null;
  return parts.join(", ");
}
