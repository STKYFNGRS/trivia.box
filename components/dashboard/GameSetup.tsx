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
import { QuestionPreview, type PreviewRow } from "@/components/dashboard/QuestionPreview";
import { AddVenueDialog } from "@/components/dashboard/venue/AddVenueDialog";
import {
  VenueProfileDialog,
  type VenueProfileSummary,
} from "@/components/dashboard/venue/VenueProfileDialog";
import { COMMON_IANA_TIMEZONES } from "@/lib/timezones";
import {
  autopilotEstimate,
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

/**
 * Fallback categories used before the taxonomy endpoint responds (or if the
 * API is unreachable). Once `/api/dashboard/categories` loads, the live
 * taxonomy replaces these everywhere. Keeps the wizard usable during SSR /
 * slow networks.
 */
const FALLBACK_CATEGORIES = ["Sports", "Pop Culture", "History"] as const;

type CategoryOption = {
  id: string;
  slug: string;
  label: string;
  totalVetted: number;
  eligibleCount: number;
};

/** Minimum vetted pool size we require before a category is a candidate for the random default. */
const MIN_POOL_FOR_RANDOM_DEFAULT = 10;

/**
 * Per-round content source options we expose in the setup UI. The
 * server's `createSchema` still accepts the legacy `custom` and
 * `pinned` values so external scripts / in-flight drafts keep working,
 * but the UI no longer produces them.
 */
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

/**
 * Default start time is one hour from now, rounded up to the next 15-minute
 * mark. E.g. invoked at 17:34 -> 18:45. Returns both the `YYYY-MM-DD` date
 * and `HH:mm` time strings interpreted in the caller's local clock (which is
 * what the browser's `date`/`time` inputs render against).
 */
function defaultEventDateTime(): { date: string; time: string } {
  const now = new Date();
  const inHour = new Date(now.getTime() + 60 * 60 * 1000);
  const minute = inHour.getMinutes();
  const remainder = minute % 15;
  if (remainder !== 0) {
    inHour.setMinutes(minute + (15 - remainder));
  }
  inHour.setSeconds(0);
  inHour.setMilliseconds(0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${inHour.getFullYear()}-${pad(inHour.getMonth() + 1)}-${pad(inHour.getDate())}`;
  const time = `${pad(inHour.getHours())}:${pad(inHour.getMinutes())}`;
  return { date, time };
}

/**
 * Pick a random category label for a round, preferring categories with a
 * healthy vetted pool. Falls back to any label we know if no option meets
 * the minimum. `exclude` keeps sibling rounds from drawing the same label
 * until we run out of eligible categories.
 */
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

/**
 * Build `count` round lines with random categories. Each round draws a
 * distinct label when possible, then wraps if `count > available categories`.
 */
function seedRoundLines(count: number, options: CategoryOption[]): RoundLine[] {
  const picked: string[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    if (options.length > 0 && used.size >= options.length) {
      used.clear();
    }
    const label = options.length > 0
      ? pickRandomCategory(options, used)
      : FALLBACK_CATEGORIES[i % FALLBACK_CATEGORIES.length]!;
    used.add(label);
    picked.push(label);
  }
  return picked.map((c) => makeRoundLine(c));
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

  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  const [roundLines, setRoundLines] = useState<RoundLine[]>(() =>
    // Initial seed uses fallback labels; a subsequent effect reseeds once
    // the live category list arrives so defaults reflect the real pool.
    Array.from({ length: 4 }, (_, i) =>
      makeRoundLine(FALLBACK_CATEGORIES[i % FALLBACK_CATEGORIES.length]!)
    )
  );
  const [categoriesInitialized, setCategoriesInitialized] = useState(false);

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

  // Load the taxonomy whenever the selected venue changes; eligibility counts
  // are scoped to the venue (last-90-days history filter mirrors smart pull).
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

  // Once live categories arrive, reseed the default round lines so each round
  // gets a random draw from the real pool. We only do this the first time so
  // subsequent venue changes don't clobber in-progress edits.
  useEffect(() => {
    if (categoriesInitialized) return;
    if (categoryOptions.length === 0) return;
    setCategoriesInitialized(true);
    setRoundLines((prev) => {
      if (prev.length === 0) return prev;
      return seedRoundLines(prev.length, categoryOptions);
    });
  }, [categoryOptions, categoriesInitialized]);

  const joinUrl = useMemo(() => {
    if (!joinCode) return null;
    const base = window.location.origin;
    return `${base}/join?code=${encodeURIComponent(joinCode)}`;
  }, [joinCode]);

  const browserTz =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "America/Los_Angeles" : "America/Los_Angeles";
  const [eventLocalDate, setEventLocalDate] = useState(() => defaultEventDateTime().date);
  const [eventLocalTime, setEventLocalTime] = useState(() => defaultEventDateTime().time);
  const [eventTimezone, setEventTimezone] = useState(browserTz);
  const [hasPrize, setHasPrize] = useState(false);
  const [prizeDescription, setPrizeDescription] = useState("");
  const [listedPublic, setListedPublic] = useState(true);
  /**
   * Hosted-mode only: desired duration in minutes. Defaults to the
   * autopilot estimate (questions * (seconds + buffer) + warmup). Empty
   * string means "unset" so we fall back to the autopilot estimate on the
   * server. Ignored while `runMode === "autopilot"`.
   */
  const [hostDurationMinutes, setHostDurationMinutes] = useState<string>("");
  /**
   * Hosted-mode only: explicit `datetime-local` override. When set this
   * wins over `hostDurationMinutes`. Value is a local-wall-clock string in
   * `YYYY-MM-DDTHH:mm` format, interpreted in the caller's browser TZ.
   */
  const [hostEndsAtOverride, setHostEndsAtOverride] = useState<string>("");
  /**
   * Between-round breaks the host scheduled. `afterRound` is 1-indexed
   * and must be strictly less than `rounds` (a break after the last
   * round would just be "session over"). Break minutes are added to the
   * end-time preview and, in duration mode, eat into the usable
   * question budget.
   */
  const [breaks, setBreaks] = useState<
    Array<{ afterRound: number; minutes: number }>
  >([]);
  /**
   * Online-only game link (Zoom / Teams / Meet). Only revealed to
   * joined players — never on public listings.
   */
  const [onlineMeetingUrl, setOnlineMeetingUrl] = useState<string>("");
  /**
   * Add-venue dialog visibility for the inline "New venue" shortcut on
   * the Location card.
   */
  const [addVenueOpen, setAddVenueOpen] = useState(false);

  const timezoneOptions = useMemo(() => {
    const set = new Set<string>([...COMMON_IANA_TIMEZONES]);
    set.add(browserTz);
    return [...set].sort();
  }, [browserTz]);

  /**
   * Live preview of the projected end time. Uses the same
   * `computeEstimatedEndAt` helper the server uses so the host sees the
   * exact value that will be persisted. Falls back to `null` while the
   * date/time inputs are in an invalid transient state.
   */
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
    // Only feed valid, within-range breaks to the estimator — an
    // in-progress edit (e.g. `afterRound = rounds + 1`) shouldn't
    // flicker the preview into weird values.
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
    const autopilotEnd = autopilotEstimate({
      eventStartsAt,
      questionCount,
      secondsPerQuestion: timerMode === "manual" ? null : seconds,
      runMode: "autopilot",
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
    const totalMinutes = Math.max(
      1,
      Math.round((autopilotEnd.getTime() - eventStartsAt.getTime()) / 60_000)
    );
    return { end, autopilotEnd, defaultDuration, breakMinutes, totalMinutes };
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
   * When the host picks a total game length, the number of questions is
   * *derived* from that length (minus warm-up) divided by the per-question
   * cost (timer seconds + reveal/leaderboard buffer), then spread evenly
   * across the chosen round count. When this is non-null the per-round
   * count input is replaced with a read-only summary and an effect syncs
   * `perRound` so validation / end-time preview stay consistent.
   */
  const derivedPerRound = useMemo(() => {
    const mins = Number(hostDurationMinutes);
    if (!hostDurationMinutes || !Number.isFinite(mins) || mins <= 0) return null;
    const secs = timerMode === "manual" ? DEFAULT_SECONDS_PER_QUESTION : seconds;
    const perQ = Math.max(1, secs) + SESSION_REVEAL_BUFFER_SECONDS;
    // Breaks and warmup don't produce questions, so they shrink the
    // usable budget 1:1. An oversized break config can drive this to
    // `perQ` (which floors to 1 question/round) — that's fine, the UI
    // preview will make the cause obvious.
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
    // Only reacts to the derived value changing; setter itself is stable.
  }, [derivedPerRound, perRound]);

  const derivedTotalQuestions =
    derivedPerRound !== null ? derivedPerRound * Math.max(1, rounds) : null;

  function updateLine(idx: number, patch: Partial<RoundLine>) {
    setRoundLines((prev) => {
      const copy = [...prev];
      const cur = copy[idx];
      if (!cur) return prev;
      copy[idx] = { ...cur, ...patch };
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
          // Only send valid breaks — `afterRound` has to be strictly
          // less than rounds count, otherwise the server rejects.
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddVenueOpen(true)}
                >
                  New venue
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
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setVenueDialogOpen(true)}>
                    Edit default venue
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setAddVenueOpen(true)}>
                    Create new venue
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="grid gap-2">
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
              Paste a Zoom / Teams / Meet link if this game runs online.
              Players only see it after joining — we never expose it on
              public listings.
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
        // Refresh the picker and preselect the new venue so the host
        // can keep filling out the rest of the setup without hunting
        // for it in the dropdown.
        onCreated={(newId) => {
          void refreshVenues(newId ?? undefined);
        }}
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
          {runMode === "hosted" ? (
            <div className="grid gap-3 md:col-span-2 rounded-md border border-border/60 bg-muted/30 p-3">
              <div>
                <Label className="text-sm font-medium">Exact end time (optional)</Label>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Pin a precise wall-clock end time. Wins over the game length
                  field below. Useful when you need to hand the room back at,
                  say, <em>9:30 PM sharp</em>.
                </p>
              </div>
              <div className="grid gap-2 sm:max-w-sm">
                <Label htmlFor="ends-at-override" className="text-xs">
                  Ends at
                </Label>
                <Input
                  id="ends-at-override"
                  type="datetime-local"
                  value={hostEndsAtOverride}
                  onChange={(e) => setHostEndsAtOverride(e.target.value)}
                />
              </div>
            </div>
          ) : null}
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
            {runMode === "autopilot"
              ? "Set the total game length — we work out how many questions fit, accounting for scheduled breaks. Each round below picks its own source."
              : "Pick the rounds and questions per round. Hosted games advance when you tap Next, so the estimated length below is advisory only."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {runMode === "autopilot" ? (
            <div className="grid gap-2 md:col-span-2">
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
                  placeholder={
                    endTimePreview ? String(endTimePreview.defaultDuration) : "60"
                  }
                  onChange={(e) => setHostDurationMinutes(e.target.value)}
                  className="max-w-[12rem] tabular-nums"
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
                {derivedTotalQuestions !== null
                  ? `We'll run ${derivedTotalQuestions} questions total (${derivedPerRound} per round × ${rounds} round${
                      rounds === 1 ? "" : "s"
                    }) at ${
                      timerMode === "manual" ? DEFAULT_SECONDS_PER_QUESTION : seconds
                    }s per question with a ~2s pause between each${
                      endTimePreview && endTimePreview.breakMinutes > 0
                        ? `, plus ${endTimePreview.breakMinutes} min of breaks`
                        : ""
                    }.`
                  : `Leave blank to pick rounds and questions-per-round directly. Setting a length derives the question count from length ÷ seconds-per-question.`}
                {endTimePreviewLabel ? (
                  <>
                    {" "}Ends approx. <strong>{endTimePreviewLabel}</strong>.
                  </>
                ) : null}
              </p>
            </div>
          ) : null}
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
            <p className="text-muted-foreground text-xs">
              Split the game across rounds so each can pull from a different
              category or deck below.
            </p>
          </div>
          {runMode === "autopilot" && derivedPerRound !== null ? (
            <div className="grid gap-2">
              <Label>Questions per round</Label>
              <div className="bg-muted/30 flex h-10 items-center rounded-md border px-3 text-sm tabular-nums">
                {derivedPerRound}
              </div>
              <p className="text-muted-foreground text-xs">
                Derived from the game length above — clear the length to set
                this manually.
              </p>
            </div>
          ) : (
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
              {runMode === "hosted" && endTimePreview ? (
                <p className="text-muted-foreground text-xs">
                  Estimated length: ~{endTimePreview.totalMinutes} min
                  {endTimePreview.breakMinutes > 0
                    ? ` (~${Math.max(
                        1,
                        endTimePreview.totalMinutes - endTimePreview.breakMinutes
                      )} min play + ${endTimePreview.breakMinutes} min breaks)`
                    : ""}
                  . You control the pace; this is just for scheduling.
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Each round uses the source you pick below. Round source can
                  be Trivia.Box&apos;s vetted pool, one of your decks, or a
                  community deck.
                </p>
              )}
            </div>
          )}
          {/* Positional break planner — kept compact so it doesn't dwarf the
              rest of the setup. Breaks only make sense between rounds, so
              the "after round" options cap at `rounds - 1`. */}
          <div className="grid gap-2 md:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Breaks (optional)</Label>
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
                Schedule a break between rounds (e.g. a 10 min intermission
                after round 2). Break minutes get added to the estimated end
                time
                {runMode === "autopilot"
                  ? " and trimmed from the derived question count above."
                  : "."}
                {rounds <= 1 ? " Add a second round to enable breaks." : ""}
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
                      className="bg-muted/30 grid grid-cols-[1fr_1fr_auto] items-end gap-3 rounded-md border p-3"
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
                            <SelectValue
                              placeholder={valid ? undefined : `1–${Math.max(1, rounds - 1)}`}
                            />
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
                                i === idx
                                  ? { ...row, minutes: Number(e.target.value) || 0 }
                                  : row
                              )
                            )
                          }
                          className="h-9 tabular-nums text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setBreaks((prev) => prev.filter((_, i) => i !== idx))
                        }
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
                    <Label className="text-xs">Category</Label>
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
                            No vetted questions tagged &quot;{line.category}&quot; yet — pick another category or add questions first.
                          </p>
                        );
                      }
                      if (line.source !== "random") return null;
                      if (opt.eligibleCount < perRound) {
                        return (
                          <p className="text-amber-600 dark:text-amber-500 text-xs">
                            Only {opt.eligibleCount} question{opt.eligibleCount === 1 ? "" : "s"} available at this
                            venue right now; this round needs {perRound}. Pick a different category or reduce
                            questions per round.
                          </p>
                        );
                      }
                      return null;
                    })()}
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
                        <SelectItem value="random">Trivia.Box random</SelectItem>
                        <SelectItem value="myDeck">My decks</SelectItem>
                        <SelectItem value="communityDeck">Community decks</SelectItem>
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
