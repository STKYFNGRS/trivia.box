"use client";

import { toast } from "sonner";

/**
 * Click handler for the "Manage subscription" entry in the Clerk
 * UserButton popup. POSTs to `/api/billing/portal` and navigates to
 * whichever URL the server returns — the Stripe Customer Portal when the
 * account has a Stripe customer, or `/dashboard/player/upgrade` when
 * they've never subscribed.
 *
 * Why this lives as a loose function and not a `<ManageBillingMenuItem>`
 * component: Clerk's `<UserButton.MenuItems>` validates its children by
 * *element type* (it only accepts literal `<UserButton.Action>` /
 * `<UserButton.Link>`), and silently drops any wrapper component —
 * logging "component can only accept <UserButton.Action /> and
 * <UserButton.Link />" in dev. Consumers should render the Action
 * directly and pass `onClick={openBillingPortal}`.
 */
export async function openBillingPortal(): Promise<void> {
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
    toast.error(e instanceof Error ? e.message : "Could not open billing portal");
  }
}
