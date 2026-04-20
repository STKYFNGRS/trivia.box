"use client";

import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Layers, MapPin, SlidersHorizontal } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { QuestionPreview, type PreviewRow } from "@/components/dashboard/QuestionPreview";
import { QuestionSearchPick } from "@/components/dashboard/QuestionSearchPick";
import {
  VenueProfileDialog,
  type VenueProfileSummary,
} from "@/components/dashboard/venue/VenueProfileDialog";
import { COMMON_IANA_TIMEZONES } from "@/lib/timezones";

type VenueOption = {
  venueAccountId: string;
  name: string;
  displayName: string;
  slug: string | null;
  city: string;
  imageUpdatedAt: string | Date | null;
  hasImage: boolean;
};

// Per-question timer values: 5..60 in 5s increments.
const SECONDS_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60] as const;
type TimerSeconds = (typeof SECONDS_OPTIONS)[number];
type PackageOption = { id: string; name: string; slug: string };
type DeckOption = {
  id: string;
  name: string;
  questionCount: number;
  defaultCategory: string | null;
  visibility?: string;
  ownerName?: string;
};

const defaultCategories = ["Sports", "Pop Culture", "History"] as const;

type RoundSource = "random" | "myDeck" | "communityDeck" | "custom" | "pinned";

type CustomQ = {
  body: string;
  correctAnswer: string;
  wrongAnswers: [string, string, string];
  difficulty: number;
};

type RoundLine = {
  category: string;
  source: RoundSource;
  myDeckId: string;
  communityDeckId: string;
  pinnedText: string;
  randomFillText: string;
  customQuestions: CustomQ[];
  /** Empty string means "inherit session default"; otherwise 5..60 step 5. */
  secondsPerQuestion: "" | TimerSeconds;
};

function parseUuidList(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s));
}

function emptyCustom(): CustomQ {
  return { body: "", correctAnswer: "", wrongAnswers: ["", "", ""], difficulty: 2 };
}

function makeRoundLine(i: number): RoundLine {
  return {
    category: defaultCategories[i % defaultCategories.length]!,
    source: "random",
    myDeckId: "",
    communityDeckId: "",
    pinnedText: "",
    randomFillText: "",
    customQuestions: [],
    secondsPerQuestion: "",
  };
}

export function GameSetup() {
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [venueAccountId, setVenueAccountId] = useState<string>("");

  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [packageId, setPackageId] = useState<string>("");
  const [runMode, setRunMode] = useState<"hosted" | "autopilot">("autopilot");

  const [myDecks, setMyDecks] = useState<DeckOption[]>([]);
  const [publicDecks, setPublicDecks] = useState<DeckOption[]>([]);

  const [rounds, setRounds] = useState(4);
  const [perRound, setPerRound] = useState(10);
  const [timerMode, setTimerMode] = useState<"auto" | "manual" | "hybrid">("auto");
  const [seconds, setSeconds] = useState<TimerSeconds>(20);

  const [venueDialogOpen, setVenueDialogOpen] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [busy, setBusy] = useState(false);

  const [venuesLoading, setVenuesLoading] = useState(true);
  const [venuesError, setVenuesError] = useState<string | null>(null);
  const [packagesLoading, setPackagesLoading] = useState(true);

  const [roundLines, setRoundLines] = useState<RoundLine[]>(() =>
    Array.from({ length: 4 }, (_, i) => makeRoundLine(i))
  );

  useEffect(() => {
    setRoundLines((prev) => {
      const n = Math.min(12, Math.max(1, rounds));
      const next = prev.slice(0, n);
      while (next.length < n) {
        next.push(makeRoundLine(next.length));
      }
      return next;
    });
  }, [rounds]);

  async function refreshVenues(preferAccountId?: string) {
    setVenuesLoading(true);
    setVenuesError(null);
    try {
      const res = await fetch("/api/dashboard/venues");
      const data = (await res.json()) as { venues?: VenueOption[]; error?: unknown };
      if (!res.ok) {
        setVenues([]);
        setVenueAccountId("");
        setVenuesError(typeof data.error === "string" ? data.error : "Could not load locations");
        return;
      }
      const list = data.venues ?? [];
      setVenues(list);
      if (list.length > 0) {
        const target = preferAccountId && list.some((v) => v.venueAccountId === preferAccountId)
          ? preferAccountId
          : list[0]!.venueAccountId;
        setVenueAccountId(target);
      } else {
        setVenueAccountId("");
      }
    } catch {
      setVenues([]);
      setVenueAccountId("");
      setVenuesError("Could not load locations");
    } finally {
      setVenuesLoading(false);
    }
  }

  useEffect(() => {
    void refreshVenues();
  }, []);

  function handleVenueSaved(next: VenueProfileSummary) {
    setVenues((prev) => {
      const updated = prev.map((v) =>
        v.venueAccountId === next.accountId
          ? {
              ...v,
              name: next.displayName,
              displayName: next.displayName,
              slug: next.slug,
              hasImage: next.hasImage,
              imageUpdatedAt: next.imageUpdatedAt,
            }
          : v
      );
      return updated;
    });
    // If the venue that just got saved isn't in our list yet (first-time create), refresh.
    setTimeout(() => {
      void refreshVenues(next.accountId);
    }, 0);
  }

  useEffect(() => {
    void (async () => {
      setPackagesLoading(true);
      try {
        const res = await fetch("/api/dashboard/packages");
        const data = (await res.json()) as { packages?: PackageOption[]; error?: unknown };
        if (!res.ok) {
          if (typeof data.error === "string") toast.error(data.error);
          setPackages([]);
          return;
        }
        setPackages(data.packages ?? []);
      } catch {
        toast.error("Could not load question packages");
        setPackages([]);
      } finally {
        setPackagesLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [mineRes, publicRes] = await Promise.all([
          fetch("/api/dashboard/decks"),
          fetch("/api/dashboard/decks/public"),
        ]);
        if (mineRes.ok) {
          const data = (await mineRes.json()) as { decks?: DeckOption[] };
          setMyDecks((data.decks ?? []).filter((d) => d.questionCount > 0));
        }
        if (publicRes.ok) {
          const data = (await publicRes.json()) as { decks?: DeckOption[] };
          setPublicDecks((data.decks ?? []).filter((d) => d.questionCount > 0));
        }
      } catch {
        // Non-fatal — deck sources are optional
      }
    })();
  }, []);

  const joinUrl = useMemo(() => {
    if (!joinCode) return null;
    const base = window.location.origin;
    return `${base}/join?code=${encodeURIComponent(joinCode)}`;
  }, [joinCode]);

  const browserTz =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "America/Los_Angeles" : "America/Los_Angeles";
  const [eventLocalDate, setEventLocalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [eventLocalTime, setEventLocalTime] = useState("19:30");
  const [eventTimezone, setEventTimezone] = useState(browserTz);
  const [hasPrize, setHasPrize] = useState(false);
  const [prizeDescription, setPrizeDescription] = useState("");
  const [listedPublic, setListedPublic] = useState(true);

  const timezoneOptions = useMemo(() => {
    const set = new Set<string>([...COMMON_IANA_TIMEZONES]);
    set.add(browserTz);
    return [...set].sort();
  }, [browserTz]);

  function updateLine(idx: number, patch: Partial<RoundLine>) {
    setRoundLines((prev) => {
      const copy = [...prev];
      const cur = copy[idx];
      if (!cur) return prev;
      copy[idx] = { ...cur, ...patch };
      return copy;
    });
  }

  function appendPinnedId(roundIdx: number, id: string) {
    setRoundLines((prev) => {
      const copy = [...prev];
      const line = copy[roundIdx];
      if (!line) return prev;
      const existing = parseUuidList(line.pinnedText);
      if (existing.includes(id)) return prev;
      const merged = [...existing, id].join(", ");
      copy[roundIdx] = { ...line, pinnedText: merged, source: "pinned" };
      return copy;
    });
  }

  function addCustomQuestion(idx: number) {
    setRoundLines((prev) => {
      const copy = [...prev];
      const cur = copy[idx];
      if (!cur) return prev;
      if (cur.customQuestions.length >= perRound) return prev;
      copy[idx] = { ...cur, customQuestions: [...cur.customQuestions, emptyCustom()] };
      return copy;
    });
  }

  function updateCustomQuestion(idx: number, qIdx: number, patch: Partial<CustomQ>) {
    setRoundLines((prev) => {
      const copy = [...prev];
      const cur = copy[idx];
      if (!cur) return prev;
      const next = [...cur.customQuestions];
      const target = next[qIdx];
      if (!target) return prev;
      next[qIdx] = { ...target, ...patch };
      copy[idx] = { ...cur, customQuestions: next };
      return copy;
    });
  }

  function removeCustomQuestion(idx: number, qIdx: number) {
    setRoundLines((prev) => {
      const copy = [...prev];
      const cur = copy[idx];
      if (!cur) return prev;
      const next = cur.customQuestions.filter((_, i) => i !== qIdx);
      copy[idx] = { ...cur, customQuestions: next };
      return copy;
    });
  }

  async function createSession() {
    if (!venueAccountId) {
      toast.error("Select a location");
      return;
    }
    setBusy(true);
    try {
      const roundSpecs = roundLines.slice(0, rounds).map((line, idx) => {
        const base: {
          roundNumber: number;
          category: string;
          questionsPerRound: number;
          secondsPerQuestion?: TimerSeconds;
        } = {
          roundNumber: idx + 1,
          category: line.category,
          questionsPerRound: perRound,
        };
        if (line.secondsPerQuestion !== "") {
          base.secondsPerQuestion = line.secondsPerQuestion;
        }
        if (line.source === "myDeck" || line.source === "communityDeck") {
          const deckId = line.source === "myDeck" ? line.myDeckId : line.communityDeckId;
          if (!deckId) throw new Error(`Round ${idx + 1}: pick a deck or choose a different source.`);
          return { ...base, deckId };
        }
        if (line.source === "custom") {
          if (line.customQuestions.length !== perRound) {
            throw new Error(
              `Round ${idx + 1}: you need exactly ${perRound} custom question(s); currently ${line.customQuestions.length}.`
            );
          }
          for (const [qIdx, q] of line.customQuestions.entries()) {
            const wrongs = q.wrongAnswers.filter((s) => s.trim().length > 0);
            if (q.body.trim().length < 5 || q.correctAnswer.trim().length === 0 || wrongs.length !== 3) {
              throw new Error(
                `Round ${idx + 1}, question ${qIdx + 1}: fill the body, correct answer, and exactly 3 wrong answers.`
              );
            }
          }
          return {
            ...base,
            customQuestions: line.customQuestions.map((q) => ({
              body: q.body.trim(),
              correctAnswer: q.correctAnswer.trim(),
              wrongAnswers: q.wrongAnswers.map((w) => w.trim()) as [string, string, string],
              difficulty: q.difficulty,
            })),
          };
        }
        if (line.source === "pinned") {
          const pins = parseUuidList(line.pinnedText).slice(0, perRound);
          const rfRaw = line.randomFillText.trim();
          const randomFillCount =
            rfRaw === "" ? undefined : Math.max(0, Math.min(perRound, Number(rfRaw) || 0));
          if (randomFillCount !== undefined && pins.length + randomFillCount !== perRound) {
            throw new Error(
              `Round ${idx + 1}: pinned count (${pins.length}) + random fill (${randomFillCount}) must equal questions per round (${perRound}), or clear "random fill" to auto-fill the rest.`
            );
          }
          const spec: {
            roundNumber: number;
            category: string;
            questionsPerRound: number;
            questionIds?: string[];
            randomFillCount?: number;
          } = {
            ...base,
            questionIds: pins.length > 0 ? pins : undefined,
          };
          if (randomFillCount !== undefined) spec.randomFillCount = randomFillCount;
          return spec;
        }
        return base;
      });

      const res = await fetch("/api/game/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueAccountId,
          timerMode,
          runMode,
          packageId: packageId || undefined,
          secondsPerQuestion: timerMode === "manual" ? undefined : seconds,
          rounds: roundSpecs,
          eventLocalDate,
          eventLocalTime,
          eventTimezone,
          hasPrize,
          listedPublic,
          prizeDescription: hasPrize ? prizeDescription.trim() || undefined : undefined,
        }),
      });
      const data = (await res.json()) as {
        sessionId?: string;
        error?: unknown;
        category?: string;
        needed?: number;
        available?: number;
        roundNumber?: number;
      };
      if (!res.ok) {
        const base = typeof data.error === "string" ? data.error : "Create failed";
        const detail =
          typeof data.category === "string" &&
          typeof data.needed === "number" &&
          typeof data.available === "number"
            ? ` Round ${data.roundNumber ?? "?"} (${data.category}): need ${data.needed} more in pool, ${data.available} available.`
            : "";
        throw new Error(base + detail);
      }
      if (!data.sessionId) throw new Error("Missing session id");
      setSessionId(data.sessionId);

      const prevRes = await fetch(`/api/game/sessions/${data.sessionId}/preview`);
      const prevData = (await prevRes.json()) as { questions?: PreviewRow[] };
      if (prevRes.ok) setPreview(prevData.questions ?? []);
      toast.success("Session drafted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function swapFirst() {
    if (!sessionId || preview.length === 0) return;
    setBusy(true);
    try {
      const target = preview[0]!;
      const res = await fetch(`/api/game/sessions/${sessionId}/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionQuestionId: target.sessionQuestionId }),
      });
      const data = (await res.json()) as { error?: unknown };
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Swap failed");
      }
      const prevRes = await fetch(`/api/game/sessions/${sessionId}/preview`);
      const prevData = (await prevRes.json()) as { questions?: PreviewRow[] };
      if (prevRes.ok) setPreview(prevData.questions ?? []);
      toast.success("Swapped a question");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Swap failed");
    } finally {
      setBusy(false);
    }
  }

  async function launch() {
    if (!sessionId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/game/sessions/${sessionId}/launch`, { method: "POST" });
      const data = (await res.json()) as { joinCode?: string; error?: unknown; code?: string };
      if (!res.ok) {
        if (data.code === "VENUE_BUSY") {
          throw new Error(
            typeof data.error === "string"
              ? data.error
              : "Another game is already live at this venue. End it before launching a new one."
          );
        }
        throw new Error(typeof data.error === "string" ? data.error : "Launch failed");
      }
      if (!data.joinCode) throw new Error("Missing join code");
      setJoinCode(data.joinCode);
      toast.success("Launched");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Launch failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-24">
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle className="tracking-tight">Location</CardTitle>
          </div>
          <CardDescription>
            Pick the venue this game runs at. Your host account is your default venue — add a
            logo, tagline, and public slug so players can find you.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-2">
            <Label>Where this game runs</Label>
            {venuesLoading ? (
              <p className="text-muted-foreground text-sm">Loading locations…</p>
            ) : venues.length > 0 ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div className="flex-1">
                  <Select
                    key={venues.map((v) => v.venueAccountId).join("-")}
                    value={venueAccountId}
                    onValueChange={(v) => v && setVenueAccountId(v)}
                  >
                    <SelectTrigger>
                      {/*
                        Base UI's <Select.Value> renders whatever the selected item's
                        <ItemText> rendered. Our items render an image + two nested
                        spans for the venue thumbnail, so Base UI falls back to the
                        raw `value` (a UUID). Supplying a `children` render prop
                        here formats the trigger as `Display name · City` instead.
                      */}
                      <SelectValue placeholder="Select a location">
                        {(value) => {
                          const selected = venues.find(
                            (v) => v.venueAccountId === value,
                          );
                          if (!selected) return "Select a location";
                          return selected.city
                            ? `${selected.displayName} · ${selected.city}`
                            : selected.displayName;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {venues.map((v) => {
                        const displayLabel = v.city
                          ? `${v.displayName} · ${v.city}`
                          : v.displayName;
                        return (
                          <SelectItem
                            key={v.venueAccountId}
                            value={v.venueAccountId}
                            // Used for keyboard type-ahead matching inside the popup.
                            label={displayLabel}
                          >
                            <span className="flex items-center gap-2">
                              {v.hasImage && v.slug ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={`/api/venues/${v.slug}/image?v=${
                                    v.imageUpdatedAt ? new Date(v.imageUpdatedAt).getTime() : 0
                                  }`}
                                  alt=""
                                  className="h-6 w-6 flex-shrink-0 rounded object-cover"
                                />
                              ) : (
                                <span className="bg-muted h-6 w-6 flex-shrink-0 rounded" />
                              )}
                              <span>
                                {v.displayName}
                                {v.city ? (
                                  <span className="text-muted-foreground"> · {v.city}</span>
                                ) : null}
                              </span>
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setVenueDialogOpen(true)}
                >
                  Edit venue
                </Button>
              </div>
            ) : null}
            {venues.length > 0 ? (
              <p className="text-muted-foreground text-xs">
                Your host account is your default venue. Upload a venue image, set a tagline, and pick a public slug
                with <strong>Edit venue</strong>. Players join at{" "}
                <code>/v/{venues.find((v) => v.venueAccountId === venueAccountId)?.slug ?? "your-slug"}</code>.
              </p>
            ) : null}
            {venuesError ? (
              <p className="text-destructive text-sm">{venuesError}</p>
            ) : venues.length === 0 ? (
              <div className="text-muted-foreground space-y-2 text-sm">
                <p>We could not find a venue for your account. Create one to continue.</p>
                <Button type="button" variant="outline" onClick={() => setVenueDialogOpen(true)}>
                  Create venue
                </Button>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <VenueProfileDialog
        open={venueDialogOpen}
        onOpenChange={setVenueDialogOpen}
        onSaved={handleVenueSaved}
      />

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle className="tracking-tight">When &amp; extras</CardTitle>
          </div>
          <CardDescription>
            Announce the event to players browsing upcoming trivia. They still need the join
            code to play.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="event-date">Event date</Label>
            <Input
              id="event-date"
              type="date"
              value={eventLocalDate}
              onChange={(e) => setEventLocalDate(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="event-time">Start time (24h)</Label>
            <Input
              id="event-time"
              type="time"
              value={eventLocalTime}
              onChange={(e) => setEventLocalTime(e.target.value)}
            />
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label>Time zone</Label>
            <Select value={eventTimezone} onValueChange={(v) => v && setEventTimezone(v)}>
              <SelectTrigger>
                <SelectValue />
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
          <div className="flex items-center gap-2 md:col-span-2">
            <input
              id="listed-public"
              type="checkbox"
              className="size-4 accent-foreground"
              checked={listedPublic}
              onChange={(e) => setListedPublic(e.target.checked)}
            />
            <Label htmlFor="listed-public" className="text-sm font-normal">
              Show on public upcoming games list
            </Label>
          </div>
          <div className="flex items-center gap-2 md:col-span-2">
            <input
              id="has-prize"
              type="checkbox"
              className="size-4 accent-foreground"
              checked={hasPrize}
              onChange={(e) => setHasPrize(e.target.checked)}
            />
            <Label htmlFor="has-prize" className="text-sm font-normal">
              This game has a prize
            </Label>
          </div>
          {hasPrize ? (
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="prize-desc">Prize description</Label>
              <Input
                id="prize-desc"
                value={prizeDescription}
                onChange={(e) => setPrizeDescription(e.target.value)}
                placeholder="e.g. $50 bar tab for the winning team"
              />
            </div>
          ) : null}
          <p className="text-muted-foreground md:col-span-2 text-xs">
            Players can browse <Link href="/games/upcoming" className="text-foreground underline underline-offset-4">upcoming trivia</Link>{" "}
            when this game is listed. They still need the join code from you to play.
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle className="tracking-tight">Host mode</CardTitle>
          </div>
          <CardDescription>
            Choose how the game runs and how questions are timed. Autopilot keeps the game moving
            if you close the host tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2 md:col-span-2">
            <Label>Run mode</Label>
            <Select value={runMode} onValueChange={(v) => v && setRunMode(v as typeof runMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="autopilot">
                  Autopilot (recommended) — runs itself at each question&apos;s timer
                </SelectItem>
                <SelectItem value="hosted">
                  Hosted — you control lock / reveal / next
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              <strong>Autopilot</strong> keeps the game moving even if you close the host tab — a
              server-side ticker handles locks and advances each round. <strong>Hybrid</strong>{" "}
              timer auto-locks on the countdown, then waits for you to tap{" "}
              <strong>Reveal</strong> / <strong>Next</strong>. <strong>Manual</strong> timer has
              you tap <strong>Lock</strong> when ready; autopilot handles the rest. Pause stops
              everything; Resume picks up where you left off.
            </p>
          </div>
          <div className="grid gap-2">
            <Label>Timer mode</Label>
            <Select
              value={timerMode}
              onValueChange={(v) => v && setTimerMode(v as typeof timerMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Seconds per question</Label>
            <Select
              value={String(seconds)}
              disabled={timerMode === "manual"}
              onValueChange={(v) => v && setSeconds(Number(v) as TimerSeconds)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECONDS_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}s
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              5–60 seconds, in 5-second increments. Override per-round below.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle className="tracking-tight">Questions</CardTitle>
          </div>
          <CardDescription>
            Pick how many rounds, how many questions each, and what source feeds each round
            (vetted pool, a deck, custom writes, or pinned IDs).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>Rounds</Label>
            <Input
              type="number"
              min={1}
              max={12}
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value))}
              className="tabular-nums"
            />
          </div>
          <div className="grid gap-2">
            <Label>Questions per round</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={perRound}
              onChange={(e) => setPerRound(Number(e.target.value))}
              className="tabular-nums"
            />
            <p className="text-muted-foreground text-xs">
              Each round uses the source you pick below. For <em>Random</em>, you need enough vetted questions in the
              category; for a deck or custom questions, the source itself must cover the round length.
            </p>
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label>Question package (optional)</Label>
            <Select
              value={packageId || "__none__"}
              disabled={packagesLoading}
              onValueChange={(v) => {
                if (!v) return;
                setPackageId(v === "__none__" ? "" : v);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={packagesLoading ? "Loading packages…" : "None — smart pull only"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None — smart pull only</SelectItem>
                {packages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 md:col-span-2">
            <Label>Per-round questions</Label>
            {roundLines.slice(0, rounds).map((line, idx) => (
              <div key={idx} className="bg-muted/30 grid gap-3 rounded-lg border p-4">
                <div className="font-medium text-sm">Round {idx + 1}</div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label className="text-xs">Category label (for scoreboard)</Label>
                    <Select
                      value={line.category}
                      onValueChange={(v) => {
                        if (!v) return;
                        updateLine(idx, { category: v });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {defaultCategories.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs">Source</Label>
                    <Select
                      value={line.source}
                      onValueChange={(v) => v && updateLine(idx, { source: v as RoundSource })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="random">Random from vetted pool</SelectItem>
                        <SelectItem value="myDeck">From one of my decks</SelectItem>
                        <SelectItem value="communityDeck">From an approved community deck</SelectItem>
                        <SelectItem value="custom">Write custom questions for this game</SelectItem>
                        <SelectItem value="pinned">Advanced: pinned question IDs</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs">Timer override</Label>
                    <Select
                      value={line.secondsPerQuestion === "" ? "__inherit__" : String(line.secondsPerQuestion)}
                      onValueChange={(v) => {
                        if (!v) return;
                        if (v === "__inherit__") {
                          updateLine(idx, { secondsPerQuestion: "" });
                        } else {
                          updateLine(idx, { secondsPerQuestion: Number(v) as TimerSeconds });
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__inherit__">Use session default ({seconds}s)</SelectItem>
                        {SECONDS_OPTIONS.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}s
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {line.source === "myDeck" ? (
                  <div className="grid gap-2">
                    <Label className="text-xs">Pick one of your decks</Label>
                    <Select
                      value={line.myDeckId || "__none__"}
                      onValueChange={(v) => v && updateLine(idx, { myDeckId: v === "__none__" ? "" : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a deck" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— choose a deck —</SelectItem>
                        {myDecks.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name} ({d.questionCount})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {myDecks.length === 0 ? (
                      <p className="text-muted-foreground text-xs">
                        You don&apos;t have any decks yet.{" "}
                        <Link href="/dashboard/decks" className="underline underline-offset-4">
                          Create one
                        </Link>
                        .
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {line.source === "communityDeck" ? (
                  <div className="grid gap-2">
                    <Label className="text-xs">Approved community decks</Label>
                    <Select
                      value={line.communityDeckId || "__none__"}
                      onValueChange={(v) =>
                        v && updateLine(idx, { communityDeckId: v === "__none__" ? "" : v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a community deck" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— choose a deck —</SelectItem>
                        {publicDecks.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name} ({d.questionCount}){d.ownerName ? ` · ${d.ownerName}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {publicDecks.length === 0 ? (
                      <p className="text-muted-foreground text-xs">
                        No community decks have been approved yet. Submit your own from{" "}
                        <Link href="/dashboard/decks" className="underline underline-offset-4">
                          your decks
                        </Link>
                        .
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {line.source === "custom" ? (
                  <div className="flex flex-col gap-3">
                    <div className="text-muted-foreground text-xs">
                      Write <strong>{perRound}</strong> question(s) for this round. They are stored as a hidden deck
                      tied to this game — they don&apos;t enter the public pool unless you publish the deck later.
                    </div>
                    {line.customQuestions.map((q, qIdx) => (
                      <div key={qIdx} className="bg-background flex flex-col gap-2 rounded-md border p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-medium">Question {qIdx + 1}</div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeCustomQuestion(idx, qIdx)}
                          >
                            Remove
                          </Button>
                        </div>
                        <Textarea
                          placeholder="Question body"
                          value={q.body}
                          maxLength={500}
                          onChange={(e) => updateCustomQuestion(idx, qIdx, { body: e.target.value })}
                          className="min-h-[60px]"
                        />
                        <Input
                          placeholder="Correct answer"
                          value={q.correctAnswer}
                          maxLength={160}
                          onChange={(e) =>
                            updateCustomQuestion(idx, qIdx, { correctAnswer: e.target.value })
                          }
                        />
                        <div className="grid gap-2 md:grid-cols-3">
                          {q.wrongAnswers.map((w, wi) => (
                            <Input
                              key={wi}
                              placeholder={`Wrong answer ${wi + 1}`}
                              value={w}
                              maxLength={160}
                              onChange={(e) => {
                                const copy: [string, string, string] = [...q.wrongAnswers] as [
                                  string,
                                  string,
                                  string,
                                ];
                                copy[wi] = e.target.value;
                                updateCustomQuestion(idx, qIdx, { wrongAnswers: copy });
                              }}
                            />
                          ))}
                        </div>
                        <div>
                          <select
                            className="bg-background h-9 rounded-md border px-3 text-sm"
                            value={q.difficulty}
                            onChange={(e) =>
                              updateCustomQuestion(idx, qIdx, { difficulty: Number(e.target.value) })
                            }
                          >
                            <option value={1}>Easy</option>
                            <option value={2}>Medium</option>
                            <option value={3}>Hard</option>
                          </select>
                        </div>
                      </div>
                    ))}
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={line.customQuestions.length >= perRound}
                        onClick={() => addCustomQuestion(idx)}
                      >
                        Add custom question ({line.customQuestions.length}/{perRound})
                      </Button>
                    </div>
                  </div>
                ) : null}

                {line.source === "pinned" ? (
                  <div className="grid gap-3">
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label className="text-xs">Random fill count (optional)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={perRound}
                          placeholder={`Auto (${Math.max(0, perRound - parseUuidList(line.pinnedText).length)} if pins set)`}
                          value={line.randomFillText}
                          onChange={(e) => updateLine(idx, { randomFillText: e.target.value })}
                        />
                        <p className="text-muted-foreground text-xs">
                          If set, pinned + this number must equal questions per round.
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs">Pinned vetted question IDs</Label>
                      <Input
                        value={line.pinnedText}
                        onChange={(e) => updateLine(idx, { pinnedText: e.target.value })}
                        placeholder="UUIDs separated by commas or spaces"
                      />
                    </div>
                    <QuestionSearchPick
                      category={line.category}
                      onAppendId={(id) => appendPinnedId(idx, id)}
                    />
                  </div>
                ) : null}

                {line.source === "random" ? (
                  <p className="text-muted-foreground text-xs">
                    Questions are pulled automatically from the vetted pool for <em>{line.category}</em> at this venue,
                    skipping anything the venue has played in the last 90 days.
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {preview.length ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold tracking-tight">Preview</h3>
          <QuestionPreview items={preview} />
        </div>
      ) : null}

      {joinUrl && joinCode && sessionId ? (
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="tracking-tight">Live links</CardTitle>
            <CardDescription>
              Share the code or QR with your players. Host and display views open in separate
              tabs.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 md:flex-row md:items-start">
            <div className="grid gap-2 text-sm">
              <div>
                Join code:{" "}
                <span className="font-mono font-semibold tabular-nums">{joinCode}</span>
              </div>
              <div className="text-muted-foreground break-all">{joinUrl}</div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/game/${joinCode}/host?sessionId=${encodeURIComponent(sessionId)}`}
                  className={cn(buttonVariants({ variant: "secondary" }))}
                >
                  Open host view
                </a>
                <a
                  href={`/game/${joinCode}/display`}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(buttonVariants({ variant: "secondary" }))}
                >
                  Open display view
                </a>
              </div>
            </div>
            <div className="bg-white p-3 rounded-md">
              <QRCodeSVG value={joinUrl} size={180} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-4 mt-2 border-t border-border/70 bg-background/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">
            {sessionId
              ? joinCode
                ? "Live — share the join code and open your host view."
                : "Draft ready — launch to generate a join code."
              : "Draft a session to preview the pulled questions."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !sessionId || preview.length === 0}
              onClick={swapFirst}
            >
              Swap first question
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !venueAccountId}
              onClick={createSession}
            >
              Draft session
            </Button>
            <Button type="button" disabled={busy || !sessionId} onClick={launch}>
              {joinCode ? "Launched" : "Launch and generate code"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
