"use client";

import { usePathname } from "next/navigation";
import { ManageSubscriptionButton } from "@/components/billing/ManageSubscriptionButton";
import { SubscribeButton } from "@/components/billing/SubscribeButton";

/**
 * Inactive-subscription alert rendered inside the unified `app/dashboard/layout.tsx`.
 * Replaces the per-shell banner copy from `DashboardShell` and
 * `SiteAdminDashboardShell`. Shown when:
 *
 *   - role is `host` and the organizer subscription is inactive, OR
 *   - role is `site_admin` and the organizer subscription is inactive (dev
 *     bypass disabled) — site admins can still see admin UIs so we surface
 *     a softer note about billing.
 *
 * When the account already has a Stripe customer id, we render the
 * `ManageSubscriptionButton` alongside the Subscribe button so users stuck
 * in webhook-limbo (paid but DB didn't update) can still reach the portal
 * to verify or cancel.
 */
export function DashboardSubscriptionBanner(props: {
  role: "host" | "site_admin";
  organizerSubscriptionEffective: boolean;
  hasStripeCustomer: boolean;
}) {
  const pathname = usePathname() ?? "/dashboard";
  if (props.organizerSubscriptionEffective) return null;

  const message =
    props.role === "site_admin"
      ? "Organizer subscription is inactive (Stripe). Enable SITE_ADMIN_DEV_BYPASS=1 in dev to run sessions without billing."
      : "Your host subscription is inactive. You can review past activity, but launching live games requires an active subscription.";

  return (
    <div className="border-y border-amber-500/30 bg-amber-500/10 text-amber-200">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">{message}</div>
        <div className="flex flex-wrap items-center gap-2">
          <SubscribeButton returnPath={pathname} />
          {props.hasStripeCustomer ? (
            <ManageSubscriptionButton variant="outline" size="default" />
          ) : null}
        </div>
      </div>
    </div>
  );
}
