"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";

type Props = {
  checkoutState: string | null;
  accountType: string;
};

/**
 * Interstitial for player -> host upgrade. On return from Stripe we poll the
 * account webhook side-effect (account_type flipped to "host") so the user
 * sees confirmation instead of a confusing "still a player" screen while the
 * webhook propagates.
 */
export function UpgradeClient(props: Props) {
  const [loading, setLoading] = useState(false);
  const [confirmedHost, setConfirmedHost] = useState(props.accountType === "host");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (props.checkoutState !== "success" || confirmedHost) return;
    let cancelled = false;
    let attempts = 0;

    async function check() {
      attempts += 1;
      try {
        const res = await fetch("/api/me/account", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { accountType?: string; subscriptionActive?: boolean };
        if (!cancelled && data.accountType === "host" && data.subscriptionActive) {
          setConfirmedHost(true);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // transient; keep polling
      }
      if (!cancelled && attempts >= 15 && pollRef.current) {
        clearInterval(pollRef.current);
      }
    }

    pollRef.current = setInterval(check, 2000);
    void check();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [props.checkoutState, confirmedHost]);

  async function startCheckout() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnPath: "/dashboard/player/upgrade" }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Checkout failed");
      }
      window.location.href = data.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
      setLoading(false);
    }
  }

  if (confirmedHost) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <SectionHeader
          as="h1"
          eyebrow="Upgrade complete"
          title="You're a host now"
          description="Welcome aboard. Your account is upgraded and ready to run live trivia."
          actions={<StatusPill tone="success" dot pulse>Active</StatusPill>}
        />
        <Card className="shadow-[var(--shadow-card)]">
          <CardContent className="text-muted-foreground flex flex-col gap-3 pt-6 text-sm">
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/games/new" className={cn(buttonVariants())}>
                Set up your first game
              </Link>
              <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
                Host dashboard
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <SectionHeader
        as="h1"
        eyebrow="Become a host"
        title="Run your own trivia nights"
        description="$50 per month. Run unlimited trivia nights, one room or many. Your player profile and stats stay exactly where they are."
      />

      {props.checkoutState === "success" && !confirmedHost ? (
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="tracking-tight">Almost done</CardTitle>
              <StatusPill tone="info" dot pulse>
                Confirming
              </StatusPill>
            </div>
            <CardDescription>
              Payment received. Waiting for Stripe to confirm your subscription… this usually
              takes a few seconds.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      {props.checkoutState === "cancel" ? (
        <Card className="shadow-[var(--shadow-card)]">
          <CardContent className="text-muted-foreground py-4 text-sm">
            Checkout cancelled. You can try again anytime.
          </CardContent>
        </Card>
      ) : null}

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="tracking-tight">What you get</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground flex flex-col gap-2 text-sm">
          <ul className="list-inside list-disc space-y-1">
            <li>Guided game setup with rounds, categories, and live preview.</li>
            <li>Player (mobile), Host (tablet), and Display (TV) views in sync.</li>
            <li>Schedule games with timezone-aware start times.</li>
            <li>Public upcoming-games listing so players can find your events.</li>
            <li>Vetted question library with search, plus curated starter pack.</li>
            <li>Automatic revert to a player profile if you ever cancel.</li>
          </ul>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={startCheckout} disabled={loading}>
          {loading ? "Redirecting to Stripe…" : "Pay $50/month and become a host"}
        </Button>
        <Link href="/dashboard/player" className={cn(buttonVariants({ variant: "ghost" }))}>
          Not now
        </Link>
      </div>
    </div>
  );
}
