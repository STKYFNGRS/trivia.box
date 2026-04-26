"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  ChevronDown,
  Layers,
  MapPin,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { AddVenueDialog } from "@/components/dashboard/venue/AddVenueDialog";
import {
  VenueProfileDialog,
  type VenueProfileSummary,
} from "@/components/dashboard/venue/VenueProfileDialog";
import { COMMON_IANA_TIMEZONES } from "@/lib/timezones";
import {
  computeEstimatedEndAt,
  estimatedDurationMinutes,
  totalBreakSeconds,
  DEFAULT_SECONDS_PER_QUESTION,
  SESSION_REVEAL_BUFFER_SECONDS,
  SESSION_WARMUP_SECONDS,
} from "@/lib/game/sessionEndTime";

type VenueOption = {
  venueAccountId: string;
  name: string;
  displayName: string;
  slug: string | null;
  city: string;
  imageUpdatedAt: string | Date | null;
  hasImage: boolean;
};

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

const FALLBACK_CATEGORIES = ["Sports", "Pop Culture", "History"] as const;

type CategoryOption = {
  id: string;
  slug: string;
  label: string;
  totalVetted: number;
  eligibleCount: number;
};

const MIN_POOL_FOR_RANDOM_DEFAULT = 10;

type RoundSource = "random" | "myDeck" | "communityDeck";

type RoundLine = {
  category: string;
  source: RoundSource;
  myDeckId: string;
  communityDeckId: string;
  /** Empty string means "inherit session default"; otherwise 5..60 step 5. */
  secondsPerQuestion: "" | TimerSeconds;
};

function makeRoundLine(category: string): RoundLine {
  return {
    category,
    source: "random",
    myDeckId: "",
    communityDeckId: "",
    secondsPerQuestion: "",
  };
}

/** Default start time: now + 1h, rounded up to next 15-minute mark. */
function defaultEventDateTime(): { date: string; time: string } {
  const now = new Date();
  const inHour = new Date(now.getTime() + 60 * 60 * 1000);
  const minute = inHour.getMinutes();
  const remainder = minute % 15;
  if (remainder !== 0) inHour.setMinutes(minute + (15 - remainder));
  inHour.setSeconds(0);
  inHour.setMilliseconds(0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${inHour.getFullYear()}-${pad(inHour.getMonth() + 1)}-${pad(inHour.getDate())}`;
  const time = `${pad(inHour.getHours())}:${pad(inHour.getMinutes())}`;
  return { date, time };
}

function pickRandomCategory(options: CategoryOption[], exclude: Set<string>): string {
  const candidates = options.filter(
    (c) => c.totalVetted >= MIN_POOL_FOR_RANDOM_DEFAULT && !exclude.has(c.label)
  );
  const pool = candidates.length > 0
    ? candidates
    : options.filter((c) => !exclude.has(c.label));
  const source = pool.length > 0 ? pool : options;
  if (source.length === 0) return FALLBACK_CATEGORIES[0];
  const pick = source[Math.floor(Math.random() * source.length)]!;
  return pick.label;
}

function seedRoundLines(count: number, options: CategoryOption[]): RoundLine[] {
  const picked: string[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    if (options.length > 0 && used.size >= options.length) used.clear();
    const label = options.length > 0
      ? pickRandomCategory(options, used)
      : FALLBACK_CATEGORIES[i % FALLBACK_CATEGORIES.length]!;
    used.add(label);
    picked.push(label);
  }
  return picked.map((c) => makeRoundLine(c));
}

export function GameSetup() {
  const router = useRouter();

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
  const [addVenueOpen, setAddVenueOpen] = useState(false);

  const [busy, setBusy] = useState(false);

  const [venuesLoading, setVenuesLoading] = useState(true);
  const [venuesError, setVenuesError] = useState<string | null>(null);
  const [packagesLoading, setPackagesLoading] = useState(true);

  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesInitialized, setCategoriesInitialized] = useState(false);

  const [roundLines, setRoundLines] = useState<RoundLine[]>(() =>
    Array.from({ length: 4 }, (_, i) =>
      makeRoundLine(FALLBACK_CATEGORIES[i % FALLBACK_CATEGORIES.length]!)
    )
  );

  /** Round-detail accordion. Open the first round by default so it's discoverable. */
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(() => new Set([0]));

  const browserTz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "America/Los_Angeles"
      : "America/Los_Angeles";

  const [eventLocalDate, setEventLocalDate] = useState(() => defaultEventDateTime().date);
  const [eventLocalTime, setEventLocalTime] = useState(() => defaultEventDateTime().time);
  const [eventTimezone, setEventTimezone] = useState(browserTz);
  const [hasPrize, setHasPrize] = useState(false);
  const [prizeDescription, setPrizeDescription] = useState("");
  const [listedPublic, setListedPublic] = useState(true);
  const [hostDurationMinutes, setHostDurationMinutes] = useState<string>("");
  const [hostEndsAtOverride, setHostEndsAtOverride] = useState<string>("");
  const [breaks, setBreaks] = useState<
    Array<{ afterRound: number; minutes: number }>
  >([]);
  const [onlineMeetingUrl, setOnlineMeetingUrl] = useState<string>("");

  useEffect(() => {
    setRoundLines((prev) => {
      const n = Math.min(12, Math.max(1, rounds));
      if (prev.length === n) return prev;
      const next = prev.slice(0, n);
      const used = new Set<string>(next.map((r) => r.category));
      while (next.length < n) {
        if (categoryOptions.length > 0 && used.size >= categoryOptions.length) {
          used.clear();
        }
        const label = categoryOptions.length > 0
          ? pickRandomCategory(categoryOptions, used)
          : FALLBACK_CATEGORIES[next.length % FALLBACK_CATEGORIES.length]!;
        used.add(label);
        next.push(makeRoundLine(label));
      }
      return next;
    });
  }, [rounds, categoryOptions]);

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
    setVenues((prev) =>
      prev.map((v) =>
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
      )
    );
    setTimeout(() => void refreshVenues(next.accountId), 0);
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
        // Non-fatal
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setCategoriesLoading(true);
      try {
        const qs = venueAccountId ? `?venueAccountId=${encodeURIComponent(venueAccountId)}` : "";
        const res = await fetch(`/api/dashboard/categories${qs}`);
        if (!res.ok) {
          if (!cancelled) setCategoryOptions([]);
          return;
        }
        const data = (await res.json()) as { categories?: CategoryOption[] };
        if (cancelled) return;
        setCategoryOptions(data.categories ?? []);
      } catch {
        if (!cancelled) setCategoryOptions([]);
      } finally {
        if (!cancelled) setCategoriesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [venueAccountId]);

  useEffect(() => {
    if (categoriesInitialized) return;
    if (categoryOptions.length === 0) return;
    setCategoriesInitialized(true);
    setRoundLines((prev) => (prev.length === 0 ? prev : seedRoundLines(prev.length, categoryOptions)));
  }, [categoryOptions, categoriesInitialized]);

  const timezoneOptions = useMemo(() => {
    const set = new Set<string>([...COMMON_IANA_TIMEZONES]);
    set.add(browserTz);
    return [...set].sort();
  }, [browserTz]);

  const endTimePreview = useMemo(() => {
    const localIso = `${eventLocalDate}T${eventLocalTime}:00`;
    const eventStartsAt = new Date(localIso);
    if (Number.isNaN(eventStartsAt.getTime())) return null;
    const questionCount = Math.max(1, rounds) * Math.max(1, perRound);
    const overrideDate =
      hostEndsAtOverride && runMode === "hosted" ? new Date(hostEndsAtOverride) : null;
    const durationMinutes =
      hostDurationMinutes && runMode === "hosted"
        ? Math.max(0, Number(hostDurationMinutes) || 0)
        : null;
    const validBreaks = breaks.filter(
      (b) => b.afterRound >= 1 && b.afterRound < rounds && b.minutes > 0
    );
    const end = computeEstimatedEndAt({
      eventStartsAt,
      questionCount,
      secondsPerQuestion: timerMode === "manual" ? null : seconds,
      runMode,
      hostDurationMinutes: durationMinutes,
      hostOverrideEndsAt: overrideDate && !Number.isNaN(overrideDate.getTime()) ? overrideDate : null,
      breaks: validBreaks,
    });
    const defaultDuration = estimatedDurationMinutes({
      eventStartsAt,
      questionCount,
      secondsPerQuestion: timerMode === "manual" ? null : seconds,
      runMode: "autopilot",
      breaks: validBreaks,
    });
    const breakMinutes = Math.round(totalBreakSeconds(validBreaks) / 60);
    return { end, defaultDuration, breakMinutes };
  }, [
    eventLocalDate,
    eventLocalTime,
    rounds,
    perRound,
    timerMode,
    seconds,
    runMode,
    hostDurationMinutes,
    hostEndsAtOverride,
    breaks,
  ]);

  const endTimePreviewLabel = useMemo(() => {
    if (!endTimePreview) return null;
    try {
      return new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: eventTimezone,
        timeZoneName: "short",
      }).format(endTimePreview.end);
    } catch {
      return endTimePreview.end.toLocaleString();
    }
  }, [endTimePreview, eventTimezone]);

  /**
   * When the host picks a total game length, derive question count from
   * length ÷ (seconds + reveal buffer) and spread evenly across rounds.
   */
  const derivedPerRound = useMemo(() => {
    const mins = Number(hostDurationMinutes);
    if (!hostDurationMinutes || !Number.isFinite(mins) || mins <= 0) return null;
    const secs = timerMode === "manual" ? DEFAULT_SECONDS_PER_QUESTION : seconds;
    const perQ = Math.max(1, secs) + SESSION_REVEAL_BUFFER_SECONDS;
    const breakSec = totalBreakSeconds(
      breaks.filter((b) => b.afterRound >= 1 && b.afterRound < rounds && b.minutes > 0)
    );
    const usable = Math.max(perQ, mins * 60 - SESSION_WARMUP_SECONDS - breakSec);
    const totalQuestions = Math.max(1, Math.floor(usable / perQ));
    const rounded = Math.max(1, Math.floor(totalQuestions / Math.max(1, rounds)));
    return Math.min(50, rounded);
  }, [hostDurationMinutes, timerMode, seconds, rounds, breaks]);

  useEffect(() => {
    if (derivedPerRound !== null && derivedPerRound !== perRound) {
      setPerRound(derivedPerRound);
    }
  }, [derivedPerRound, perRound]);

  function updateLine(idx: number, patch: Partial<RoundLine>) {
    setRoundLines((prev) => {
      const copy = [...prev];
      const cur = copy[idx];
      if (!cur) return prev;
      copy[idx] = { ...cur, ...patch };
      return copy;
    });
  }

  function toggleRoundExpanded(idx: number) {
    setExpandedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  async function createLobby() {
    if (!venueAccountId) {
      toast.error("Pick a location first");
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
          if (!deckId) throw new Error(`Round ${idx + 1}: pick a deck or change the source.`);
          return { ...base, deckId };
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
          ...(runMode === "hosted" && hostEndsAtOverride
            ? { hostEndsAtOverride: new Date(hostEndsAtOverride).toISOString() }
            : {}),
          ...(runMode === "hosted" && hostDurationMinutes && !hostEndsAtOverride
            ? { hostDurationMinutes: Math.max(5, Math.min(480, Number(hostDurationMinutes) || 0)) }
            : {}),
          ...(breaks.length > 0
            ? {
                breaks: breaks
                  .filter(
                    (b) =>
                      b.afterRound >= 1 &&
                      b.afterRound < roundSpecs.length &&
                      b.minutes > 0
                  )
                  .map((b) => ({
                    afterRound: b.afterRound,
                    minutes: Math.max(1, Math.min(120, Math.floor(b.minutes))),
                  })),
              }
            : {}),
          ...(onlineMeetingUrl.trim()
            ? { onlineMeetingUrl: onlineMeetingUrl.trim() }
            : {}),
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
        const base = typeof data.error === "string" ? data.error : "Could not create lobby";
        const detail =
          typeof data.category === "string" &&
          typeof data.needed === "number" &&
          typeof data.available === "number"
            ? ` Round ${data.roundNumber ?? "?"} (${data.category}): need ${data.needed} more in pool, ${data.available} available.`
            : "";
        throw new Error(base + detail);
      }
      if (!data.sessionId) throw new Error("Missing session id");
      toast.success("Lobby created — share the join code");
      router.push(`/dashboard/games/${data.sessionId}/lobby`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create lobby");
    } finally {
      setBusy(false);
    }
  }

  const totalQuestions = Math.max(1, rounds) * Math.max(1, perRound);
  const summaryLine =
    `${rounds} round${rounds === 1 ? "" : "s"} · ${perRound} questions each · ` +
    `${timerMode === "manual" ? "manual" : `${seconds}s per question`}` +
    (endTimePreview && endTimePreview.breakMinutes > 0
      ? ` · ${endTimePreview.breakMinutes} min breaks`
      : "");

  return (
    <div className="flex flex-col gap-6 pb-24">
      {/* Basics */}
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle className="tracking-tight">Where & when</CardTitle>
          </div>
          <CardDescription>
            Pick the venue and the start time. Everything else has a smart default —
            tweak it under <strong>Advanced</strong> below if you want to.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2 md:col-span-2">
            <Label>Venue</Label>
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
                      <SelectValue placeholder="Pick a venue">
                        {(value) => {
                          const selected = venues.find((v) => v.venueAccountId === value);
                          if (!selected) return "Pick a venue";
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
                            label={displayLabel}
                          >
                            <span className="flex items-center gap-2">
                              {v.hasImage && v.slug ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
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
                <Button type="button" variant="outline" onClick={() => setVenueDialogOpen(true)}>
                  Edit venue
                </Button>
                <Button type="button" variant="outline" onClick={() => setAddVenueOpen(true)}>
                  New venue
                </Button>
              </div>
            ) : (
              <div className="text-muted-foreground space-y-2 text-sm">
                <p>You don&apos;t have a venue yet — create one to continue.</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setVenueDialogOpen(true)}>
                    Edit default venue
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setAddVenueOpen(true)}>
                    Create new venue
                  </Button>
                </div>
              </div>
            )}
            {venuesError ? <p className="text-destructive text-sm">{venuesError}</p> : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="event-date">Date</Label>
            <Input
              id="event-date"
              type="date"
              value={eventLocalDate}
              onChange={(e) => setEventLocalDate(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="event-time">Start time</Label>
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
            <p className="text-muted-foreground text-xs">
              Detected from your browser. Players see the event in their own zone.
            </p>
          </div>
        </CardContent>
      </Card>

      <VenueProfileDialog
        open={venueDialogOpen}
        onOpenChange={setVenueDialogOpen}
        onSaved={handleVenueSaved}
      />
      <AddVenueDialog
        open={addVenueOpen}
        onOpenChange={setAddVenueOpen}
        onCreated={(newId) => void refreshVenues(newId ?? undefined)}
      />

      {/* Game shape */}
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle className="tracking-tight">Game shape</CardTitle>
          </div>
          <CardDescription>
            We default to {rounds} rounds with random vetted categories.
            Adjust the count below; expand a round to swap its category or use one of your decks.
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
            <Label htmlFor="duration-minutes">Game length (minutes)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="duration-minutes"
                type="number"
                inputMode="numeric"
                min={5}
                max={480}
                step={5}
                value={hostDurationMinutes}
                placeholder={endTimePreview ? String(endTimePreview.defaultDuration) : "60"}
                onChange={(e) => setHostDurationMinutes(e.target.value)}
                className="tabular-nums"
              />
              {hostDurationMinutes ? (
                <button
                  type="button"
                  onClick={() => setHostDurationMinutes("")}
                  className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
                >
                  Clear
                </button>
              ) : null}
            </div>
            <p className="text-muted-foreground text-xs">
              Optional — leave blank to set questions per round directly under Advanced.
            </p>
          </div>

          {derivedPerRound === null ? (
            <div className="grid gap-2 md:col-span-2">
              <Label>Questions per round</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={perRound}
                onChange={(e) => setPerRound(Number(e.target.value))}
                className="tabular-nums max-w-[12rem]"
              />
            </div>
          ) : (
            <div className="md:col-span-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Derived: </span>
              <span className="font-semibold tabular-nums">
                {derivedPerRound} questions × {rounds} rounds = {derivedPerRound * rounds} total
              </span>
            </div>
          )}

          <div className="grid gap-2 md:col-span-2">
            <Label>Round categories</Label>
            <div className="grid gap-2">
              {roundLines.slice(0, rounds).map((line, idx) => {
                const expanded = expandedRounds.has(idx);
                return (
                  <div
                    key={idx}
                    className="rounded-lg border bg-muted/20"
                  >
                    <div className="flex items-center gap-3 px-3 py-2">
                      <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                        Round {idx + 1}
                      </span>
                      <span className="flex-1 truncate text-sm font-medium">
                        {line.category}
                        {line.source !== "random" ? (
                          <span className="text-muted-foreground ml-2 text-xs">
                            · {line.source === "myDeck" ? "Your deck" : "Community deck"}
                          </span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleRoundExpanded(idx)}
                        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2"
                      >
                        {expanded ? "Done" : "Customize"}
                        <ChevronDown
                          className={`size-3 transition-transform ${expanded ? "rotate-180" : ""}`}
                          aria-hidden
                        />
                      </button>
                    </div>
                    {expanded ? (
                      <div className="grid gap-3 border-t px-3 py-3 md:grid-cols-2">
                        <div className="grid gap-1.5">
                          <Label className="text-xs">Category</Label>
                          <Select
                            value={line.category}
                            onValueChange={(v) => v && updateLine(idx, { category: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                              {(categoryOptions.length > 0
                                ? categoryOptions.map((c) => ({
                                    label: c.label,
                                    eligible: c.eligibleCount,
                                    total: c.totalVetted,
                                  }))
                                : FALLBACK_CATEGORIES.map((label) => ({
                                    label,
                                    eligible: 0,
                                    total: 0,
                                  }))
                              ).map((opt) => {
                                const countLabel = categoryOptions.length > 0
                                  ? ` — ${opt.eligible} ready${opt.eligible !== opt.total ? ` / ${opt.total} total` : ""}`
                                  : "";
                                const thin = categoryOptions.length > 0 && opt.eligible < perRound;
                                return (
                                  <SelectItem key={opt.label} value={opt.label} label={opt.label}>
                                    <span className={thin ? "text-muted-foreground" : undefined}>
                                      {opt.label}
                                      <span className="text-muted-foreground">{countLabel}</span>
                                    </span>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          {(() => {
                            if (categoriesLoading || categoryOptions.length === 0) return null;
                            const opt = categoryOptions.find((c) => c.label === line.category);
                            if (!opt) {
                              return (
                                <p className="text-amber-600 dark:text-amber-500 text-xs">
                                  No vetted questions tagged &quot;{line.category}&quot; yet.
                                </p>
                              );
                            }
                            if (line.source !== "random") return null;
                            if (opt.eligibleCount < perRound) {
                              return (
                                <p className="text-amber-600 dark:text-amber-500 text-xs">
                                  Only {opt.eligibleCount} available; this round needs {perRound}.
                                </p>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-xs">Source</Label>
                          <Select
                            value={line.source}
                            onValueChange={(v) => v && updateLine(idx, { source: v as RoundSource })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="random">Trivia.Box random</SelectItem>
                              <SelectItem value="myDeck">My decks</SelectItem>
                              <SelectItem value="communityDeck">Community decks</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {line.source === "myDeck" ? (
                          <div className="grid gap-1.5 md:col-span-2">
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
                          <div className="grid gap-1.5 md:col-span-2">
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
                          </div>
                        ) : null}
                        <div className="grid gap-1.5">
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
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Advanced disclosure */}
      <Card className="shadow-[var(--shadow-card)]">
        <CardContent className="p-0">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-6 py-4 [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-2">
                <Settings2 className="size-4 text-muted-foreground" aria-hidden />
                <span className="font-semibold">Advanced settings</span>
                <span className="text-muted-foreground text-xs">
                  Run mode · timer · prize · breaks · meeting link
                </span>
              </div>
              <ChevronDown
                className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="grid gap-4 border-t px-6 py-5 md:grid-cols-2">
              <div className="grid gap-2 md:col-span-2">
                <Label>Run mode</Label>
                <Select value={runMode} onValueChange={(v) => v && setRunMode(v as typeof runMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="autopilot">
                      Autopilot — runs itself on each question&apos;s timer
                    </SelectItem>
                    <SelectItem value="hosted">
                      Hosted — you tap Lock / Reveal / Next
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  Autopilot is recommended; the server keeps the game moving even if you close the tab.
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Timer mode</Label>
                <Select value={timerMode} onValueChange={(v) => v && setTimerMode(v as typeof timerMode)}>
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
              </div>

              {runMode === "hosted" ? (
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="ends-at-override" className="text-sm">
                    Exact end time (optional)
                  </Label>
                  <Input
                    id="ends-at-override"
                    type="datetime-local"
                    value={hostEndsAtOverride}
                    onChange={(e) => setHostEndsAtOverride(e.target.value)}
                    className="sm:max-w-sm"
                  />
                  <p className="text-muted-foreground text-xs">
                    Pin a wall-clock end. Wins over game length above.
                  </p>
                </div>
              ) : null}

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
                    <SelectValue placeholder={packagesLoading ? "Loading…" : "None — smart pull only"} />
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

              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="online-meeting-url">Online meeting link (optional)</Label>
                <Input
                  id="online-meeting-url"
                  type="url"
                  inputMode="url"
                  placeholder="https://zoom.us/j/..."
                  value={onlineMeetingUrl}
                  maxLength={500}
                  onChange={(e) => setOnlineMeetingUrl(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  Players see this only after they join — never on public listings.
                </p>
              </div>

              <div className="md:col-span-2 grid gap-3 rounded-md border bg-muted/30 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-foreground"
                      checked={listedPublic}
                      onChange={(e) => setListedPublic(e.target.checked)}
                    />
                    <span className="text-sm">Show on public upcoming list</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-foreground"
                      checked={hasPrize}
                      onChange={(e) => setHasPrize(e.target.checked)}
                    />
                    <span className="text-sm">This game has a prize</span>
                  </label>
                </div>
                {hasPrize ? (
                  <div className="grid gap-2">
                    <Label htmlFor="prize-desc" className="text-xs">Prize description</Label>
                    <Input
                      id="prize-desc"
                      value={prizeDescription}
                      onChange={(e) => setPrizeDescription(e.target.value)}
                      placeholder="e.g. $50 bar tab for the winning team"
                    />
                  </div>
                ) : null}
              </div>

              <div className="grid gap-2 md:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Breaks</Label>
                  <button
                    type="button"
                    onClick={() =>
                      setBreaks((prev) => {
                        const usedAfter = new Set(prev.map((b) => b.afterRound));
                        let firstFree = 1;
                        while (firstFree < rounds && usedAfter.has(firstFree)) {
                          firstFree += 1;
                        }
                        const afterRound =
                          firstFree < rounds
                            ? firstFree
                            : Math.min(Math.max(1, rounds - 1), Math.ceil(rounds / 2));
                        return [...prev, { afterRound, minutes: 10 }];
                      })
                    }
                    disabled={rounds <= 1 || breaks.length >= Math.max(0, rounds - 1)}
                    className="text-primary hover:text-primary/80 text-xs font-semibold underline underline-offset-2 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                  >
                    + Add break
                  </button>
                </div>
                {breaks.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    Optional intermissions between rounds. Add one to extend the game length.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {breaks.map((b, idx) => {
                      const options: number[] = [];
                      for (let r = 1; r < rounds; r += 1) options.push(r);
                      const valid = b.afterRound >= 1 && b.afterRound < rounds;
                      return (
                        <div
                          key={idx}
                          className="bg-background grid grid-cols-[1fr_1fr_auto] items-end gap-3 rounded-md border p-3"
                        >
                          <div className="grid gap-1.5">
                            <Label className="text-xs">After round</Label>
                            <Select
                              value={valid ? String(b.afterRound) : ""}
                              onValueChange={(v) => {
                                if (!v) return;
                                const next = Number(v);
                                if (!Number.isFinite(next)) return;
                                setBreaks((prev) =>
                                  prev.map((row, i) =>
                                    i === idx ? { ...row, afterRound: next } : row
                                  )
                                );
                              }}
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {options.map((n) => (
                                  <SelectItem key={n} value={String(n)}>
                                    Round {n}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-1.5">
                            <Label className="text-xs">Minutes</Label>
                            <Input
                              type="number"
                              min={1}
                              max={120}
                              value={b.minutes}
                              onChange={(e) =>
                                setBreaks((prev) =>
                                  prev.map((row, i) =>
                                    i === idx ? { ...row, minutes: Number(e.target.value) || 0 } : row
                                  )
                                )
                              }
                              className="h-9 tabular-nums text-sm"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setBreaks((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </details>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 mt-2 border-t border-border/70 bg-background/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5 text-xs">
            <p className="text-muted-foreground">
              <CalendarClock className="mr-1 inline-block size-3.5 -translate-y-px" aria-hidden />
              {summaryLine}
              {endTimePreviewLabel ? (
                <>
                  {" "}· ends ~<strong className="text-foreground">{endTimePreviewLabel}</strong>
                </>
              ) : null}
            </p>
            <p className="text-muted-foreground">
              {totalQuestions} total questions · you can share the join code immediately after creating the lobby.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="lg"
              disabled={busy || !venueAccountId}
              onClick={createLobby}
            >
              {busy ? "Creating lobby…" : "Create lobby"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
