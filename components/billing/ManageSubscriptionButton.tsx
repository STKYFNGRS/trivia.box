"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * "Manage subscription" CTA for the organizer dashboard Subscription card.
 *
 * Posts to `/api/billing/portal` to mint a Stripe Customer Portal URL. If
 * the account somehow has no Stripe customer yet the route returns the
 * internal `/dashboard/player/upgrade` URL so the same button gracefully
 * becomes a "subscribe" CTA instead of 500-ing.
 */
export function ManageSubscriptionButton(props: {
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm" | "lg";
  label?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      // Defensive JSON parse — the portal route is supposed to always return
      // JSON, but an infra proxy serving HTML on failure shouldn't surface as
      // "Unexpected end of JSON input" to the user.
      const raw = await res.text();
      let data: { url?: string; error?: string } = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as typeof data;
        } catch {
          data = {};
        }
      }
      if (!res.ok) {
        throw new Error(
          data.error ?? `Couldn't open billing portal (HTTP ${res.status})`
        );
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("Missing portal URL");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open billing portal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={loading}
      variant={props.variant ?? "secondary"}
      size={props.size ?? "default"}
    >
      {loading ? "Opening…" : (props.label ?? "Manage subscription")}
    </Button>
  );
}
