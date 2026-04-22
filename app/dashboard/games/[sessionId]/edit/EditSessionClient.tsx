"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

export type EditSessionInitial = {
  id: string;
  status: string;
  runMode: string;
  eventStartsAt: string; // ISO
  eventTimezone: string;
  theme: string | null;
  hasPrize: boolean;
  prizeDescription: string;
  prizeTopN: number;
  prizeLabels: string[];
  prizeInstructions: string;
  prizeExpiresAt: string; // ISO or empty
  hostNotes: string;
};

/**
 * Convert a UTC ISO string into the `YYYY-MM-DDTHH:MM` local-form value that
 * `<input type="datetime-local">` expects. We intentionally render in the
 * browser's local time (not the session's timezone) so the host is
 * manipulating a real wall-clock value, then we re-serialize on save.
 */
function isoToLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function EditSessionClient({ initial }: { initial: EditSessionInitial }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [eventLocal, setEventLocal] = useState(() => isoToLocalInput(initial.eventStartsAt));
  const [timezone, setTimezone] = useState(initial.eventTimezone);
  const [hasPrize, setHasPrize] = useState(initial.hasPrize);
  const [prizeDescription, setPrizeDescription] = useState(initial.prizeDescription);
  const [prizeTopN, setPrizeTopN] = useState(initial.prizeTopN);
  const [prizeLabelsText, setPrizeLabelsText] = useState(initial.prizeLabels.join("\n"));
  const [prizeInstructions, setPrizeInstructions] = useState(initial.prizeInstructions);
  const [prizeExpiresLocal, setPrizeExpiresLocal] = useState(() =>
    isoToLocalInput(initial.prizeExpiresAt)
  );
  const [hostNotes, setHostNotes] = useState(initial.hostNotes);

  const readonly = initial.status === "completed";

  const timezoneOptions = useMemo(() => COMMON_IANA_TIMEZONES, []);

  async function save() {
    if (readonly) return;
    const startIso = localInputToIso(eventLocal);
    if (!startIso) {
      toast.error("Event start is required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        eventStartsAt: startIso,
        eventTimezone: timezone.trim() || "UTC",
        hasPrize,
        prizeDescription: hasPrize ? prizeDescription.trim() || null : null,
        prizeTopN: hasPrize ? prizeTopN : null,
        prizeLabels: hasPrize
          ? prizeLabelsText
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(Boolean)
          : null,
        prizeInstructions: hasPrize ? prizeInstructions.trim() || null : null,
        prizeExpiresAt: hasPrize ? localInputToIso(prizeExpiresLocal) : null,
        hostNotes: hostNotes.trim() || null,
      };

      const res = await fetch(`/api/dashboard/sessions/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      let data: { ok?: boolean; error?: string } = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as typeof data;
        } catch {
          data = {};
        }
      }
      if (!res.ok) {
        toast.error(data.error ?? `Save failed (HTTP ${res.status})`);
        return;
      }
      toast.success("Event updated");
      router.push("/dashboard/games");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/55">
          Event
        </div>
        <h1 className="mt-1 text-3xl font-black tracking-tight">
          {initial.theme ? `Edit — ${initial.theme}` : "Edit event"}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-white/70">
          Update the event time, prize details, and host notes. Notes show on
          the public event page at <code>/v/[slug]/events/{initial.id}</code>.
        </p>
      </header>

      {readonly ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          This session is already completed. Editing is disabled.
        </div>
      ) : null}

      <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/70">
          Schedule
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="event-start">Start time (your local time)</Label>
            <Input
              id="event-start"
              type="datetime-local"
              value={eventLocal}
              onChange={(e) => setEventLocal(e.target.value)}
              disabled={readonly}
            />
          </div>
          <div className="grid gap-2">
            <Label>Time zone</Label>
            <Select
              value={timezone || "UTC"}
              onValueChange={(v) => setTimezone(v ?? "")}
              disabled={readonly}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a time zone" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {timezoneOptions.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/70">
          Notes
        </h2>
        <div className="grid gap-2">
          <Label htmlFor="host-notes">Host notes (shown to players)</Label>
          <Textarea
            id="host-notes"
            value={hostNotes}
            onChange={(e) => setHostNotes(e.target.value)}
            className="min-h-[100px]"
            placeholder="Kitchen open until 10, 2-for-1 drinks 7-8, bring a team of up to 6."
            disabled={readonly}
            maxLength={4000}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/70">
            Prize
          </h2>
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={hasPrize}
              onChange={(e) => setHasPrize(e.target.checked)}
              disabled={readonly}
              className="size-4 rounded border-white/25 bg-white/[0.06]"
            />
            Event has a prize
          </label>
        </div>

        {hasPrize ? (
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="prize-description">Prize description</Label>
              <Input
                id="prize-description"
                value={prizeDescription}
                onChange={(e) => setPrizeDescription(e.target.value)}
                maxLength={280}
                placeholder="$100 bar tab"
                disabled={readonly}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="prize-top-n">Places that win</Label>
                <Input
                  id="prize-top-n"
                  type="number"
                  min={1}
                  max={10}
                  value={prizeTopN}
                  onChange={(e) => setPrizeTopN(Number(e.target.value))}
                  disabled={readonly}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="prize-expires">Claims expire</Label>
                <Input
                  id="prize-expires"
                  type="datetime-local"
                  value={prizeExpiresLocal}
                  onChange={(e) => setPrizeExpiresLocal(e.target.value)}
                  disabled={readonly}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="prize-labels">Per-rank labels (one per line, optional)</Label>
              <Textarea
                id="prize-labels"
                value={prizeLabelsText}
                onChange={(e) => setPrizeLabelsText(e.target.value)}
                className="min-h-[80px]"
                placeholder={"$100 bar tab\n$50 bar tab\nFree round"}
                disabled={readonly}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="prize-instructions">Redemption instructions</Label>
              <Textarea
                id="prize-instructions"
                value={prizeInstructions}
                onChange={(e) => setPrizeInstructions(e.target.value)}
                className="min-h-[80px]"
                placeholder="Show this claim to the bartender at the bar. Must be redeemed by end of night."
                disabled={readonly}
                maxLength={2000}
              />
            </div>
          </div>
        ) : null}
      </section>

      <div className="flex items-center gap-2">
        <Button type="button" onClick={() => void save()} disabled={saving || readonly}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/dashboard/games")}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
