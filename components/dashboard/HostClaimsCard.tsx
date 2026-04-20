"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";

type Claim = {
  id: string;
  sessionId: string;
  joinCode: string;
  playerId: string;
  playerName: string;
  finalRank: number;
  prizeLabel: string;
  claimCode: string;
  status: string;
  expiresAt: string | null;
  redeemedAt: string | null;
  createdAt: string;
};

/**
 * Host-facing prize-claims drawer. Lists pending claims across every
 * session this host's venue owns, lets them mark a claim as redeemed
 * with one click, and flips to a "redeemed" view without needing a
 * page refresh.
 */
export function HostClaimsCard() {
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [filter, setFilter] = useState<"pending" | "redeemed" | "all">("pending");
  const [error, setError] = useState<string | null>(null);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);

  const load = useCallback(async (nextFilter: typeof filter) => {
    try {
      setError(null);
      const res = await fetch(`/api/dashboard/prize-claims?status=${nextFilter}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`Failed to load claims (${res.status})`);
      }
      const data = (await res.json()) as { claims: Claim[] };
      setClaims(data.claims ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load claims");
      setClaims([]);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const onRedeem = async (claimId: string) => {
    setRedeemingId(claimId);
    try {
      const res = await fetch(`/api/dashboard/prize-claims/${claimId}/redeem`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Redeem failed (${res.status})`);
      }
      toast.success("Marked as redeemed");
      await load(filter);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Redeem failed");
    } finally {
      setRedeemingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 tracking-tight">
            <Gift className="size-4 text-[var(--neon-magenta)]" />
            Prize claims
          </CardTitle>
          <CardDescription className="mt-1">
            Finishers redeem these in person. Verify the claim code and mark
            as handed out.
          </CardDescription>
        </div>
        <div className="flex items-center gap-1 text-xs">
          {(["pending", "redeemed", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-2 py-1 uppercase tracking-wide transition-colors ${
                filter === f
                  ? "bg-[var(--neon-magenta)] text-black"
                  : "border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : claims == null ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading claims…
          </div>
        ) : claims.length === 0 ? (
          <div className="text-muted-foreground text-sm">
            {filter === "pending"
              ? "No pending claims. New wins show up here as soon as sessions complete."
              : "Nothing in this view yet."}
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {claims.map((c) => {
              const rankLabel =
                c.finalRank === 1
                  ? "1st"
                  : c.finalRank === 2
                    ? "2nd"
                    : c.finalRank === 3
                      ? "3rd"
                      : `${c.finalRank}th`;
              const tone =
                c.status === "redeemed"
                  ? "success"
                  : c.status === "expired" || c.status === "void"
                    ? "neutral"
                    : "accent";
              return (
                <li
                  key={c.id}
                  className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-foreground font-medium">
                        {c.playerName}
                      </span>
                      <StatusPill tone={tone}>{c.status}</StatusPill>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {rankLabel} · {c.joinCode}
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      {c.prizeLabel}
                      {c.expiresAt
                        ? ` · expires ${new Date(c.expiresAt).toLocaleDateString()}`
                        : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-md border border-dashed border-[color-mix(in_oklab,var(--neon-magenta)_40%,transparent)] bg-[color-mix(in_oklab,var(--neon-magenta)_10%,transparent)] px-2 py-1 font-mono text-xs font-semibold tracking-[0.22em] text-[var(--neon-magenta)]"
                      title="Ask the winner to show this"
                    >
                      {c.claimCode}
                    </span>
                    {c.status === "pending" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={redeemingId === c.id}
                        onClick={() => onRedeem(c.id)}
                      >
                        {redeemingId === c.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          "Redeem"
                        )}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
