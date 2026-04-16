"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type VenueOption = { venueAccountId: string; name: string; city: string };

const defaultCategories = ["Sports", "Pop Culture", "History"] as const;

export function GameSetup() {
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [venueAccountId, setVenueAccountId] = useState<string>("");

  const [rounds, setRounds] = useState(4);
  const [perRound, setPerRound] = useState(10);
  const [timerMode, setTimerMode] = useState<"auto" | "manual" | "hybrid">("auto");
  const [seconds, setSeconds] = useState<10 | 20 | 30>(20);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/dashboard/venues");
      const data = (await res.json()) as { venues?: VenueOption[] };
      if (!res.ok) return;
      setVenues(data.venues ?? []);
      if ((data.venues?.length ?? 0) > 0) {
        setVenueAccountId(data.venues![0]!.venueAccountId);
      }
    })();
  }, []);

  const joinUrl = useMemo(() => {
    if (!joinCode) return null;
    const base = window.location.origin;
    return `${base}/join?code=${encodeURIComponent(joinCode)}`;
  }, [joinCode]);

  async function createSession() {
    if (!venueAccountId) {
      toast.error("Select a location");
      return;
    }
    setBusy(true);
    try {
      const roundSpecs = Array.from({ length: rounds }, (_, idx) => ({
        roundNumber: idx + 1,
        category: defaultCategories[idx % defaultCategories.length],
        questionsPerRound: perRound,
      }));

      const res = await fetch("/api/game/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueAccountId,
          timerMode,
          secondsPerQuestion: timerMode === "manual" ? undefined : seconds,
          rounds: roundSpecs,
        }),
      });
      const data = (await res.json()) as { sessionId?: string; error?: unknown };
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Create failed");
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
      const data = (await res.json()) as { joinCode?: string; error?: unknown };
      if (!res.ok) {
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
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>1) Location</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-2">
            <Label>Where this game runs</Label>
            <Select value={venueAccountId} onValueChange={(v) => v && setVenueAccountId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a location" />
              </SelectTrigger>
              <SelectContent>
                {venues.map((v) => (
                  <SelectItem key={v.venueAccountId} value={v.venueAccountId}>
                    {v.name} · {v.city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {venues.length === 0 ? (
              <div className="text-muted-foreground text-sm">
                No locations loaded. Refresh the page. If this persists, check that you are signed in — venues can
                also invite you by email so your profile appears in this list.
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2) Format</CardTitle>
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
            />
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
              onValueChange={(v) => v && setSeconds(Number(v) as 10 | 20 | 30)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="30">30</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-muted-foreground md:col-span-2 text-sm">
            Categories cycle Sports → Pop Culture → History by round (MVP). Per-round category pickers can come next.
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy || !venueAccountId} onClick={createSession}>
          Draft session + pull questions
        </Button>
        <Button type="button" variant="secondary" disabled={busy || !sessionId || preview.length === 0} onClick={swapFirst}>
          Swap first question (demo)
        </Button>
        <Button type="button" disabled={busy || !sessionId} onClick={launch}>
          Launch (generate join code)
        </Button>
      </div>

      {preview.length ? (
        <div className="flex flex-col gap-3">
          <div className="text-lg font-semibold">Preview</div>
          <QuestionPreview items={preview} />
        </div>
      ) : null}

      {joinUrl && joinCode && sessionId ? (
        <Card>
          <CardHeader>
            <CardTitle>Live links</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 md:flex-row md:items-start">
            <div className="grid gap-2 text-sm">
              <div>
                Join code: <span className="font-mono font-semibold">{joinCode}</span>
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
            <div className="bg-white p-3">
              <QRCodeSVG value={joinUrl} size={180} />
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
