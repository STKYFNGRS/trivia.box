import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/accounts";
import { CreatorPerksCard } from "@/components/dashboard/CreatorPerksCard";
import { HostDashboard } from "@/components/dashboard/HostDashboard";
import { ManageSubscriptionButton } from "@/components/billing/ManageSubscriptionButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusPill } from "@/components/ui/status-pill";
import { reconcileOrganizerSubscription } from "@/lib/billing/reconcile";
import { hasEffectiveOrganizerSubscription } from "@/lib/subscription";

export default async function DashboardHomePage() {
  let account = await getCurrentAccount();
  if (!account) {
    return null;
  }

  if (account.accountType === "player") {
    redirect("/dashboard/player");
  }

  // Self-heal missed webhooks — if the user paid but `/api/webhooks/stripe`
  // never flipped `subscription_active`, this pulls the truth from Stripe on
  // every dashboard load so they don't sit in a half-subscribed limbo.
  const reconcile = await reconcileOrganizerSubscription(account);
  if (reconcile.changed) {
    account = (await getCurrentAccount()) ?? account;
  }

  const orgSub = hasEffectiveOrganizerSubscription(account);
  const hasStripeCustomer = Boolean(account.stripeCustomerId);
  const showDuplicateWarning = reconcile.activeSubscriptionCount > 1;

  const profileHint =
    account.accountType === "site_admin"
      ? "Internal site admin — use Organizer and Games to test the host flow; Player test for join and stats."
      : "Host profile. Add venues (physical rooms) inside game setup; same plan for one room or many.";

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        as="h1"
        eyebrow="Dashboard"
        title={`Welcome, ${account.name}`}
        description={
          <>
            {profileHint} Based in{" "}
            <span className="text-foreground font-medium">{account.city}</span>.
          </>
        }
      />

      <HostDashboard subscriptionActive={orgSub} />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="tracking-tight">Subscription</CardTitle>
            <CardDescription className="mt-1">
              {orgSub
                ? "Your host subscription is active."
                : account.accountType === "host"
                  ? "Your subscription ended. Reactivate it to run new games — your games, stats and players are still here."
                  : "No active host subscription."}
            </CardDescription>
          </div>
          <StatusPill tone={orgSub ? "success" : "neutral"} dot pulse={orgSub}>
            {orgSub ? "Active" : "Inactive"}
          </StatusPill>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-muted-foreground text-sm">
          {showDuplicateWarning ? (
            <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-900 dark:text-amber-200">
              Stripe reports{" "}
              <span className="font-medium">
                {reconcile.activeSubscriptionCount} active subscriptions
              </span>{" "}
              on this account. Open the customer portal below and cancel the
              duplicate so you&apos;re only charged once.
            </div>
          ) : null}
          <p>
            {hasStripeCustomer
              ? "Update your card, download invoices, switch plans or cancel any time from the Stripe customer portal."
              : "Manage billing from the header banner once you&apos;ve subscribed."}
          </p>
          {hasStripeCustomer ? (
            <div>
              <ManageSubscriptionButton />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <CreatorPerksCard accountId={account.id} />
    </div>
  );
}
