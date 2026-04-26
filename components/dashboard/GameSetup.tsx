"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  ChevronDown,
  Dice5,
  Gift,
  Layers,
  ListChecks,
  MapPin,
  Settings2,
  Shuffle,
  Sparkles,
  Wand2,
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
} from "@/lib/game/sessionEndTime";
import { cn } from "@/lib/utils";

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

/**
 * Top-level "where are the questions coming from" decision.
 * - random: server picks vetted questions across categories per round
 * - categories: host picks the category per round, server still smart-pulls
 * - decks: host picks one of their (or a community) deck per round
 *
 * This drives the per-round controls visible in the form. The server payload
 * still per-round sends `{ category, deckId? }` so the API doesn't need a
 * matching mode field — picking a deck implies the source for that round.
 */
type QuestionSource = "random" | "categories" | "decks";

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

  const [questionSource, setQuestionSource] = useState<QuestionSource>("random");

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

  // Resize the round list when the round count changes. Existing rows are
  // preserved (so toggling rounds 4 → 5 → 4 keeps your picks); new rows
  // pull a unique random vetted category.
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

  // When the host flips the question source we sync per-round defaults so
  // the visible controls match. Random/categories use the existing category
  // assignment; decks resets each row to the host's first deck if available.
  useEffect(() => {
    setRoundLines((prev) =>
      prev.map((line) => {
        if (questionSource === "random" || questionSource === "categories") {
          return line.source === "random" ? line : { ...line, source: "random" };
        }
        // decks: prefer myDeck if the host has any, otherwise a community deck.
        if (myDecks.length > 0) {
          return {
            ...line,
            source: "myDeck",
            myDeckId: line.myDeckId || myDecks[0]!.id,
          };
        }
        if (publicDecks.length > 0) {
          return {
            ...line,
            source: "communityDeck",
            communityDeckId: line.communityDeckId || publicDecks[0]!.id,
          };
        }
        return line;
      })
    );
  }, [questionSource, myDecks, publicDecks]);

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
        // Non-fatal — host can still create games on random vetted questions.
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

  function updateLine(idx: number, patch: Partial<RoundLine>) {
    setRoundLines((prev) => {
      const copy = [...prev];
      const cur = copy[idx];
      if (!cur) return prev;
      copy[idx] = { ...cur, ...patch };
      return copy;
    });
  }

  function reshuffleRandomCategories() {
    setRoundLines((prev) => {
      if (categoryOptions.length === 0) return prev;
      const used = new Set<string>();
      return prev.map((line) => {
        if (used.size >= categoryOptions.length) used.clear();
        const label = pickRandomCategory(categoryOptions, used);
        used.add(label);
        return { ...line, category: label };
      });
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

  const noDecksAvailable = myDecks.length === 0 && publicDecks.length === 0;

  return (
    <div className="flex flex-col gap-6 pb-24">
      {/* Where & When */}
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle className="tracking-tight">Where & when</CardTitle>
          </div>
          <CardDescription>
            Pick the venue and the start time. Time zone defaults to your browser.
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
            How long, who&apos;s driving, and where the questions come from.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {/* Run mode — segmented */}
          <div className="grid gap-2">
            <Label>Run mode</Label>
            <div className="grid grid-cols-2 gap-2">
              <RunModeOption
                active={runMode === "autopilot"}
                title="Autopilot"
                subtitle="Server runs each round on a timer. Recommended."
                onClick={() => setRunMode("autopilot")}
              />
              <RunModeOption
                active={runMode === "hosted"}
                title="Hosted"
                subtitle="You tap Lock / Reveal / Next yourself."
                onClick={() => setRunMode("hosted")}
              />
            </div>
          </div>

          {/* Counts row */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="rounds-input">Rounds</Label>
              <Input
                id="rounds-input"
                type="number"
                min={1}
                max={12}
                value={rounds}
                onChange={(e) => setRounds(Number(e.target.value))}
                className="tabular-nums"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="per-round-input">Questions / round</Label>
              <Input
                id="per-round-input"
                type="number"
                min={1}
                max={50}
                value={perRound}
                onChange={(e) => setPerRound(Number(e.target.value))}
                className="tabular-nums"
              />
            </div>
            <div className="grid gap-2">
              <Label>Seconds / question</Label>
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
          </div>

          {/* Questions source */}
          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Questions</Label>
              {questionSource === "random" ? (
                <button
                  type="button"
                  onClick={reshuffleRandomCategories}
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-semibold underline underline-offset-2"
                >
                  <Shuffle className="size-3.5" aria-hidden />
                  Reshuffle categories
                </button>
              ) : null}
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <SourceOption
                active={questionSource === "random"}
                icon={<Sparkles className="size-4" aria-hidden />}
                title="Random vetted"
                subtitle="We pick across categories."
                onClick={() => setQuestionSource("random")}
              />
              <SourceOption
                active={questionSource === "categories"}
                icon={<ListChecks className="size-4" aria-hidden />}
                title="Pick categories"
                subtitle="Choose a topic per round."
                onClick={() => setQuestionSource("categories")}
              />
              <SourceOption
                active={questionSource === "decks"}
                icon={<Wand2 className="size-4" aria-hidden />}
                title="Use my decks"
                subtitle={
                  noDecksAvailable
                    ? "No decks yet — create one first."
                    : "Bring your own questions."
                }
                onClick={() => {
                  if (noDecksAvailable) {
                    toast.error("Create a deck first.", {
                      action: {
                        label: "Open decks",
                        onClick: () => router.push("/dashboard/decks"),
                      },
                    });
                    return;
                  }
                  setQuestionSource("decks");
                }}
                disabled={noDecksAvailable}
              />
            </div>

            {/* Round list (varies by source) */}
            <div className="grid gap-2">
              {roundLines.slice(0, rounds).map((line, idx) => (
                <RoundRow
                  key={idx}
                  index={idx}
                  line={line}
                  source={questionSource}
                  categoryOptions={categoryOptions}
                  categoriesLoading={categoriesLoading}
                  myDecks={myDecks}
                  publicDecks={publicDecks}
                  perRound={perRound}
                  onChange={(patch) => updateLine(idx, patch)}
                />
              ))}
            </div>
            {questionSource === "decks" && noDecksAvailable ? (
              <p className="text-muted-foreground text-xs">
                You don&apos;t have any decks yet.{" "}
                <Link href="/dashboard/decks" className="underline underline-offset-4">
                  Create a deck
                </Link>{" "}
                to pick your own questions.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Prize */}
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gift className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle className="tracking-tight">Prize</CardTitle>
          </div>
          <CardDescription>
            Optional. Shown to players in the lobby and on the public listing if you toggle it on.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-foreground"
              checked={hasPrize}
              onChange={(e) => setHasPrize(e.target.checked)}
            />
            <span className="text-sm">This game has a prize</span>
          </label>
          {hasPrize ? (
            <div className="grid gap-1.5">
              <Label htmlFor="prize-desc" className="text-xs">
                Prize description
              </Label>
              <Input
                id="prize-desc"
                value={prizeDescription}
                onChange={(e) => setPrizeDescription(e.target.value)}
                placeholder="e.g. $50 bar tab for the winning team"
              />
            </div>
          ) : null}
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
                  Timer mode · package · meeting link · breaks
                </span>
              </div>
              <ChevronDown
                className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="grid gap-4 border-t px-6 py-5 md:grid-cols-2">
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
                <p className="text-muted-foreground text-xs">
                  Auto runs the timer; Manual lets the host control reveal pacing.
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Question package</Label>
                <Select
                  value={packageId || "__none__"}
                  disabled={packagesLoading}
                  onValueChange={(v) => {
                    if (!v) return;
                    setPackageId(v === "__none__" ? "" : v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={packagesLoading ? "Loading…" : "None — smart pull"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None — smart pull</SelectItem>
                    {packages.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {runMode === "hosted" ? (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="duration-minutes">Game length (mins, optional)</Label>
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
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ends-at-override">Exact end time (optional)</Label>
                    <Input
                      id="ends-at-override"
                      type="datetime-local"
                      value={hostEndsAtOverride}
                      onChange={(e) => setHostEndsAtOverride(e.target.value)}
                    />
                  </div>
                </>
              ) : null}

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

              <div className="md:col-span-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-foreground"
                    checked={listedPublic}
                    onChange={(e) => setListedPublic(e.target.checked)}
                  />
                  <span className="text-sm">Show on public upcoming list</span>
                </label>
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
                    Optional intermissions between rounds.
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
              {totalQuestions} total questions ·{" "}
              {runMode === "autopilot"
                ? "autopilot launches at start time; you can also Start now from the lobby"
                : "you'll Start the game from the lobby when ready"}
              .
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

function RunModeOption({
  active,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition",
        active
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-background hover:bg-muted/40"
      )}
    >
      <span
        className={cn(
          "text-sm font-semibold",
          active ? "text-foreground" : "text-foreground/90"
        )}
      >
        {title}
      </span>
      <span className="text-muted-foreground text-xs">{subtitle}</span>
    </button>
  );
}

function SourceOption({
  active,
  icon,
  title,
  subtitle,
  onClick,
  disabled = false,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition",
        active
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-background hover:bg-muted/40",
        disabled && "cursor-not-allowed opacity-60 hover:bg-background"
      )}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex size-6 flex-none items-center justify-center rounded-md",
          active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground block text-xs">{subtitle}</span>
      </span>
    </button>
  );
}

function RoundRow({
  index,
  line,
  source,
  categoryOptions,
  categoriesLoading,
  myDecks,
  publicDecks,
  perRound,
  onChange,
}: {
  index: number;
  line: RoundLine;
  source: QuestionSource;
  categoryOptions: CategoryOption[];
  categoriesLoading: boolean;
  myDecks: DeckOption[];
  publicDecks: DeckOption[];
  perRound: number;
  onChange: (patch: Partial<RoundLine>) => void;
}) {
  const label = `Round ${index + 1}`;

  if (source === "random") {
    return (
      <div className="bg-muted/20 flex items-center gap-3 rounded-md border px-3 py-2">
        <span className="text-muted-foreground w-16 text-xs font-semibold uppercase tracking-wider">
          {label}
        </span>
        <Dice5 className="text-muted-foreground size-4" aria-hidden />
        <span className="flex-1 truncate text-sm">
          {line.category}
          <span className="text-muted-foreground"> · random vetted</span>
        </span>
      </div>
    );
  }

  if (source === "categories") {
    const opt = categoryOptions.find((c) => c.label === line.category);
    const thin = opt && opt.eligibleCount < perRound;
    return (
      <div className="bg-muted/20 grid grid-cols-[4rem_1fr] items-center gap-3 rounded-md border px-3 py-2">
        <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
          {label}
        </span>
        <div className="flex items-center gap-2">
          <Select
            value={line.category}
            onValueChange={(v) => v && onChange({ category: v })}
            disabled={categoriesLoading}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {(categoryOptions.length > 0
                ? categoryOptions
                : FALLBACK_CATEGORIES.map((l) => ({
                    label: l,
                    eligibleCount: 0,
                    totalVetted: 0,
                  }))
              ).map((c) => {
                const lbl = "label" in c ? c.label : "";
                const eligible = "eligibleCount" in c ? c.eligibleCount : 0;
                const total = "totalVetted" in c ? c.totalVetted : 0;
                const tail =
                  total > 0
                    ? ` — ${eligible} ready${eligible !== total ? ` / ${total}` : ""}`
                    : "";
                return (
                  <SelectItem key={lbl} value={lbl} label={lbl}>
                    {lbl}
                    <span className="text-muted-foreground">{tail}</span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {thin ? (
            <span className="text-amber-600 dark:text-amber-500 text-xs whitespace-nowrap">
              {opt?.eligibleCount ?? 0} ready · need {perRound}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  // decks
  const isMine = line.source === "myDeck";
  const value = (isMine ? line.myDeckId : line.communityDeckId) || "__none__";
  return (
    <div className="bg-muted/20 grid grid-cols-[4rem_1fr] items-center gap-3 rounded-md border px-3 py-2">
      <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
        {label}
      </span>
      <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
        <Select
          value={isMine ? "myDeck" : "communityDeck"}
          onValueChange={(v) => {
            if (!v) return;
            onChange({ source: v as RoundSource });
          }}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="myDeck" disabled={myDecks.length === 0}>
              My decks
            </SelectItem>
            <SelectItem value="communityDeck" disabled={publicDecks.length === 0}>
              Community
            </SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={value}
          onValueChange={(v) => {
            if (!v) return;
            const id = v === "__none__" ? "" : v;
            onChange(isMine ? { myDeckId: id } : { communityDeckId: id });
          }}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Pick a deck" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="__none__">— choose a deck —</SelectItem>
            {(isMine ? myDecks : publicDecks).map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name} ({d.questionCount})
                {!isMine && d.ownerName ? ` · ${d.ownerName}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
