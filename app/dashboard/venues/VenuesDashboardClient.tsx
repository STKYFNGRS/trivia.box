"use client";

import { Camera, ExternalLink, MapPin, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AddVenueDialog } from "@/components/dashboard/venue/AddVenueDialog";
import { VenueProfileDialog } from "@/components/dashboard/venue/VenueProfileDialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatVenueAddress } from "@/lib/venue-address";

export type VenueListItem = {
  accountId: string;
  displayName: string;
  slug: string | null;
  city: string;
  tagline: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressRegion: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;
  hasImage: boolean;
  imageUpdatedAt: string | null;
  /**
   * True when the signed-in account owns this venue. Only owners can edit
   * profile / upload photos because `/api/dashboard/venue` scopes writes to
   * the caller's own account.
   */
  isOwner: boolean;
};

export function VenuesDashboardClient({ venues }: { venues: VenueListItem[] }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/55">
            Hosts
          </div>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Your venues</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/70">
            Each venue has its own public page, photo, leaderboard and schedule.
            Update the photo and copy here and it rolls out to the venue page,
            the live play background and the directory at{" "}
            <Link href="/venues" className="underline hover:text-white">
              /venues
            </Link>
            .
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setAddOpen(true)}
          className="shrink-0"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add venue
        </Button>
      </header>

      {venues.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-10 text-center text-white/70">
          You don&apos;t have any venues linked yet. A new venue profile is
          created for you automatically the first time you open this page.
        </div>
      ) : (
        <ul className="grid gap-3">
          {venues.map((v) => {
            const bust = v.imageUpdatedAt ? new Date(v.imageUpdatedAt).getTime() : 0;
            const imageUrl =
              v.hasImage && v.slug ? `/api/venues/${v.slug}/image?v=${bust}` : null;
            const formattedAddress = formatVenueAddress({
              addressStreet: v.addressStreet,
              addressCity: v.addressCity,
              addressRegion: v.addressRegion,
              addressPostalCode: v.addressPostalCode,
              addressCountry: v.addressCountry,
            });
            const addressLine = formattedAddress ?? (v.city ? v.city : null);
            return (
              <li
                key={v.accountId}
                className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:flex-row sm:items-center"
              >
                <div className="relative h-24 w-full flex-none overflow-hidden rounded-xl bg-white/[0.08] ring-1 ring-white/10 sm:h-20 sm:w-28">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-white/50">
                      <MapPin className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-lg font-semibold tracking-tight">
                      {v.displayName}
                    </div>
                    {!v.isOwner ? (
                      <span className="inline-flex rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">
                        Hosted
                      </span>
                    ) : null}
                  </div>
                  {v.tagline ? (
                    <div className="mt-0.5 truncate text-sm text-white/70">
                      {v.tagline}
                    </div>
                  ) : null}
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-white/55">
                    {v.slug ? <span>/v/{v.slug}</span> : null}
                    {addressLine ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {addressLine}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {v.isOwner ? (
                    <button
                      type="button"
                      onClick={() => setDialogOpen(true)}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </button>
                  ) : null}
                  {v.isOwner ? (
                    <button
                      type="button"
                      onClick={() => setDialogOpen(true)}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <Camera className="mr-1.5 h-3.5 w-3.5" />
                      Change photo
                    </button>
                  ) : null}
                  {v.slug ? (
                    <a
                      href={`/v/${v.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "sm" }),
                        "text-white/75 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      View public page
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Reuse the existing profile dialog — it implicitly edits the caller's
          own venue via /api/dashboard/venue. Multi-venue host flows that
          need cross-account editing will require a new PATCH-by-id endpoint;
          surfaced as "Edit" only on owner rows to avoid misleading UX. */}
      <VenueProfileDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => {
          // After a save, hard-refresh to pick up the new slug / photo /
          // tagline in the list. Avoids wiring per-row local state.
          window.location.reload();
        }}
      />
      <AddVenueDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => window.location.reload()}
      />
    </div>
  );
}
