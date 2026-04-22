import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardSubscriptionBanner } from "@/components/dashboard/DashboardSubscriptionBanner";
import { DashboardSubnav } from "@/components/dashboard/DashboardSubnav";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { ensureAccountFromClerkUser, getCurrentAccount } from "@/lib/accounts";
import { isClerkAdmin } from "@/lib/admin";
import { reconcileOrganizerSubscription } from "@/lib/billing/reconcile";
import { ensurePlayerRowForAccount, getPlayerByAccountId } from "@/lib/players";
import { hasEffectiveOrganizerSubscription } from "@/lib/subscription";

/**
 * All dashboard routes render inside the same arcade-neon MarketingShell
 * (dark background + film grain + MarketingNav + MarketingFooter) as the
 * rest of the site, with a role-aware `DashboardSubnav` tab row for
 * dashboard-specific navigation. The old three bespoke shells
 * (Host / SiteAdmin / Player) are retired.
 *
 * The inactive-subscription banner, when shown, sits between the subnav
 * and the page content so it's visible immediately on every dashboard
 * render without pushing the main nav down the page.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  let account = await ensureAccountFromClerkUser();
  if (!account) {
    redirect("/sign-in");
  }

  if (account.accountType === "player") {
    await ensurePlayerRowForAccount(account, account.name);
    const player = await getPlayerByAccountId(account.id);
    if (!player) {
      redirect("/sign-in");
    }
    return (
      <MarketingShell>
        <DashboardSubnav role="player" />
        <div className="mx-auto w-full max-w-7xl px-6 py-8 text-white">
          {children}
        </div>
      </MarketingShell>
    );
  }

  const admin = await isClerkAdmin();
  // Best-effort self-heal: if the Stripe webhook missed an event, the banner
  // would otherwise keep nagging a user who has already paid. Runs on every
  // non-player dashboard render (one Stripe API call if there's a customer
  // id, else instant).
  const reconciled = await reconcileOrganizerSubscription(account);
  if (reconciled.changed) {
    account = (await getCurrentAccount()) ?? account;
  }
  const organizerEffective = hasEffectiveOrganizerSubscription(account);
  const role = account.accountType === "site_admin" ? "site_admin" : "host";

  if (account.accountType === "site_admin") {
    await ensurePlayerRowForAccount(account, account.name);
  }

  return (
    <MarketingShell>
      <DashboardSubnav role={role} isAdmin={admin} />
      <DashboardSubscriptionBanner
        role={role}
        organizerSubscriptionEffective={organizerEffective}
        hasStripeCustomer={Boolean(account.stripeCustomerId)}
      />
      <div className="mx-auto w-full max-w-7xl px-6 py-8 text-white">
        {children}
      </div>
    </MarketingShell>
  );
}
