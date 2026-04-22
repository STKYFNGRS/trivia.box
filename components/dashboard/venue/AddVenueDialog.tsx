"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Create-another-venue flow for hosts who already own one venue and want to
 * run a second. Collects the minimum we need to mint a new `accounts` row
 * and a `venue_profiles` row server-side; everything else (image, tagline,
 * address) gets filled in later from the edit dialog.
 */
export function AddVenueDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Fires after a successful create. Receives the new venue's account id
   * so callers like `/dashboard/games/new` can auto-select it.
   */
  onCreated?: (venueAccountId: string | null) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [city, setCity] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const trimmed = displayName.trim();
    if (!trimmed) {
      toast.error("Venue name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/dashboard/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: trimmed,
          slug: slug.trim() || undefined,
          city: city.trim() || undefined,
        }),
      });
      // Guard against non-JSON (e.g. 502 HTML from a crashed route) — otherwise
      // `response.json()` throws an opaque "Unexpected end of JSON input".
      const text = await res.text();
      let data: {
        error?: unknown;
        venue?: { venueAccountId?: string };
      } = {};
      try {
        data = text
          ? (JSON.parse(text) as {
              error?: unknown;
              venue?: { venueAccountId?: string };
            })
          : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        toast.error(
          typeof data.error === "string" ? data.error : `Create failed (HTTP ${res.status})`
        );
        return;
      }
      toast.success(`Added ${trimmed}`);
      setDisplayName("");
      setSlug("");
      setCity("");
      onOpenChange(false);
      onCreated?.(data.venue?.venueAccountId ?? null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a venue</DialogTitle>
          <DialogDescription>
            Create a second venue you host trivia at. You can upload a photo,
            set a tagline and fill in the address from the venue&apos;s edit
            dialog once it&apos;s created.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="new-venue-name">Display name</Label>
            <Input
              id="new-venue-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={80}
              placeholder="The Broken Barrel"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-venue-slug">Public slug (optional)</Label>
            <Input
              id="new-venue-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              maxLength={80}
              placeholder="broken-barrel"
            />
            <p className="text-muted-foreground text-xs">
              Leave blank to generate one from the name. Used in the public URL:
              <span className="ml-1 font-mono">/v/your-slug</span>
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-venue-city">City (optional)</Label>
            <Input
              id="new-venue-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={120}
              placeholder="San Diego"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={saving}>
            {saving ? "Creating…" : "Create venue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
