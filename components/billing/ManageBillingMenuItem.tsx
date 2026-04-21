"use client";

import { UserButton } from "@clerk/nextjs";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";

/**
 * "Manage subscription" entry for the Clerk UserButton popup. On click, POSTs
 * to `/api/billing/portal` and navigates to whichever URL the server returns —
 * that's the Stripe Customer Portal when the account has a Stripe customer,
 * or `/dashboard/player/upgrade` when they've never subscribed.
 *
 * Must be mounted as a child of `<UserButton.MenuItems>` so Clerk can place it
 * in the popup alongside "Manage account" and "Sign out".
 */
export function ManageBillingMenuItem() {
  return (
    <UserButton.Action
      label="Manage subscription"
      labelIcon={<CreditCard className="size-4" aria-hidden />}
      onClick={async () => {
        try {
          const res = await fetch("/api/billing/portal", { method: "POST" });
          // Defensive parse — the route is supposed to always return JSON,
          // but if an infra layer in front returns HTML we don't want the
          // user to see a cryptic "Unexpected end of JSON input".
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
            throw new Error(data.error ?? `HTTP ${res.status}`);
          }
          if (!data.url) {
            throw new Error("Missing portal URL");
          }
          window.location.href = data.url;
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "Could not open billing portal"
          );
        }
      }}
    />
  );
}
