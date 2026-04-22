"use client";

import { useRouter } from "next/navigation";

export type VenuePickerOption = {
  accountId: string;
  displayName: string;
};

/**
 * Lightweight native `<select>` that swaps the stats page to a different
 * venue by pushing `?venueId=…`. Kept minimal on purpose — hosts typically
 * have 1–3 venues and a full combobox would be overkill. Navigation is a
 * real router.push (not a client-side filter) so the server component can
 * re-fetch all of `getVenueStats` / `getHostVenueOpsStats` for the new
 * venue id.
 */
export function VenuePicker({
  options,
  selectedId,
}: {
  options: VenuePickerOption[];
  selectedId: string;
}) {
  const router = useRouter();

  if (options.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 text-sm text-white/80">
      <label htmlFor="venue-picker" className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">
        Venue
      </label>
      <select
        id="venue-picker"
        value={selectedId}
        onChange={(e) => {
          const next = e.target.value;
          router.push(`/dashboard/stats?venueId=${encodeURIComponent(next)}`);
        }}
        className="rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-sm text-white outline-none transition-colors hover:bg-white/10 focus:border-white/40"
      >
        {options.map((o) => (
          <option key={o.accountId} value={o.accountId} className="bg-[var(--stage-bg)] text-white">
            {o.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}
