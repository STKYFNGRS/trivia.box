"use client";

import { useEffect, useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMMON_IANA_TIMEZONES } from "@/lib/timezones";

export type VenueProfileSummary = {
  accountId: string;
  slug: string;
  displayName: string;
  tagline: string | null;
  description: string | null;
  timezone: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressRegion: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;
  hasImage: boolean;
  imageUpdatedAt: string | Date | null;
};

export type VenueProfileDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (next: VenueProfileSummary) => void;
};

const MAX_IMAGE_MB = 4;
const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function VenueProfileDialog({
  open,
  onOpenChange,
  onSaved,
}: VenueProfileDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profile, setProfile] = useState<VenueProfileSummary | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [timezone, setTimezone] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressRegion, setAddressRegion] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [addressCountry, setAddressCountry] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/dashboard/venue");
        const data = (await res.json()) as { venue?: VenueProfileSummary; error?: unknown };
        if (!res.ok || !data.venue) {
          toast.error(typeof data.error === "string" ? data.error : "Could not load venue");
          return;
        }
        applyProfile(data.venue);
      } catch {
        toast.error("Could not load venue");
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  function applyProfile(next: VenueProfileSummary) {
    setProfile(next);
    setDisplayName(next.displayName);
    setSlug(next.slug);
    setTagline(next.tagline ?? "");
    setDescription(next.description ?? "");
    setTimezone(next.timezone ?? "");
    setAddressStreet(next.addressStreet ?? "");
    setAddressCity(next.addressCity ?? "");
    setAddressRegion(next.addressRegion ?? "");
    setAddressPostalCode(next.addressPostalCode ?? "");
    setAddressCountry(next.addressCountry ?? "");
  }

  async function save() {
    if (!displayName.trim()) {
      toast.error("Display name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/dashboard/venue", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          slug: slug.trim() || displayName.trim(),
          tagline: tagline.trim() || null,
          description: description.trim() || null,
          timezone: timezone.trim() || null,
          addressStreet: addressStreet.trim() || null,
          addressCity: addressCity.trim() || null,
          addressRegion: addressRegion.trim() || null,
          addressPostalCode: addressPostalCode.trim() || null,
          addressCountry: addressCountry.trim() || null,
        }),
      });
      const data = (await res.json()) as { venue?: VenueProfileSummary; error?: unknown };
      if (!res.ok || !data.venue) {
        toast.error(typeof data.error === "string" ? data.error : "Save failed");
        return;
      }
      applyProfile(data.venue);
      toast.success("Venue updated");
      onSaved?.(data.venue);
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(file: File) {
    if (!ALLOWED_MIMES.has(file.type)) {
      toast.error("Use PNG, JPEG, or WebP");
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      toast.error(`Image must be ≤ ${MAX_IMAGE_MB} MB`);
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.set("image", file);
      const res = await fetch("/api/dashboard/venue/image", { method: "POST", body });
      const data = (await res.json()) as {
        venue?: Pick<VenueProfileSummary, "imageUpdatedAt" | "slug">;
        error?: unknown;
      };
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Upload failed");
        return;
      }
      if (profile && data.venue) {
        const next: VenueProfileSummary = {
          ...profile,
          hasImage: true,
          imageUpdatedAt: data.venue.imageUpdatedAt ?? new Date().toISOString(),
        };
        applyProfile(next);
        onSaved?.(next);
      }
      toast.success("Image uploaded");
    } finally {
      setUploading(false);
    }
  }

  async function removeImage() {
    setUploading(true);
    try {
      const res = await fetch("/api/dashboard/venue/image", { method: "DELETE" });
      const data = (await res.json()) as { error?: unknown };
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Remove failed");
        return;
      }
      if (profile) {
        const next: VenueProfileSummary = {
          ...profile,
          hasImage: false,
          imageUpdatedAt: new Date().toISOString(),
        };
        applyProfile(next);
        onSaved?.(next);
      }
      toast.success("Image removed");
    } finally {
      setUploading(false);
    }
  }

  const thumbBust = profile?.imageUpdatedAt
    ? new Date(profile.imageUpdatedAt).getTime()
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Venue profile</DialogTitle>
          <DialogDescription>
            Your venue&apos;s name and image are visible to players in the lobby at{" "}
            <code>/v/{profile?.slug ?? "your-slug"}</code> and as the background during live games.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          <div className="grid gap-4">
            <div className="flex items-start gap-4">
              <div className="bg-muted flex h-24 w-32 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border">
                {profile?.hasImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={profile.displayName}
                    src={`/api/venues/${profile.slug}/image?v=${thumbBust}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-muted-foreground text-xs">No image</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadImage(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? "Uploading…" : profile?.hasImage ? "Replace image" : "Upload image"}
                </Button>
                {profile?.hasImage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={uploading}
                    onClick={() => void removeImage()}
                  >
                    Remove image
                  </Button>
                ) : null}
                <p className="text-muted-foreground text-xs">
                  PNG, JPEG, or WebP up to {MAX_IMAGE_MB} MB. Shown as the background on the play and display screens.
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="venue-display-name">Display name</Label>
              <Input
                id="venue-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={80}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="venue-slug">Public slug</Label>
              <Input
                id="venue-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                maxLength={80}
                placeholder="your-venue"
              />
              <p className="text-muted-foreground text-xs">
                Used in the lobby URL. Letters, numbers and dashes only; we&apos;ll clean it up automatically.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="venue-tagline">Tagline (optional)</Label>
              <Input
                id="venue-tagline"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                maxLength={140}
                placeholder="Trivia every Tuesday at 7:30pm"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="venue-description">Description (optional)</Label>
              <Textarea
                id="venue-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                className="min-h-[80px]"
              />
            </div>

            <div className="grid gap-2">
              <Label>Default time zone</Label>
              <Select value={timezone || "__none__"} onValueChange={(v) => setTimezone(v && v !== "__none__" ? v : "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a time zone" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__none__">— none —</SelectItem>
                  {COMMON_IANA_TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 rounded-md border border-white/10 bg-white/[0.02] p-3">
              <div className="flex items-baseline justify-between gap-2">
                <Label className="text-sm font-medium">Physical address (optional)</Label>
                <span className="text-muted-foreground text-xs">
                  Shown on your public venue page
                </span>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="venue-address-street" className="text-xs">
                  Street
                </Label>
                <Input
                  id="venue-address-street"
                  value={addressStreet}
                  onChange={(e) => setAddressStreet(e.target.value)}
                  maxLength={200}
                  placeholder="123 Main St"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="venue-address-city" className="text-xs">
                    City
                  </Label>
                  <Input
                    id="venue-address-city"
                    value={addressCity}
                    onChange={(e) => setAddressCity(e.target.value)}
                    maxLength={120}
                    placeholder="San Diego"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="venue-address-region" className="text-xs">
                    State / region
                  </Label>
                  <Input
                    id="venue-address-region"
                    value={addressRegion}
                    onChange={(e) => setAddressRegion(e.target.value)}
                    maxLength={80}
                    placeholder="CA"
                  />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="venue-address-postal" className="text-xs">
                    Postal code
                  </Label>
                  <Input
                    id="venue-address-postal"
                    value={addressPostalCode}
                    onChange={(e) => setAddressPostalCode(e.target.value)}
                    maxLength={20}
                    placeholder="92101"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="venue-address-country" className="text-xs">
                    Country
                  </Label>
                  <Input
                    id="venue-address-country"
                    value={addressCountry}
                    onChange={(e) => setAddressCountry(e.target.value)}
                    maxLength={80}
                    placeholder="US"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={saving || loading} onClick={() => void save()}>
            {saving ? "Saving…" : "Save venue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
