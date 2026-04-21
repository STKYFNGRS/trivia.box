import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PlayerDashboardShell } from "@/components/dashboard/PlayerDashboardShell";
import { SiteAdminDashboardShell } from "@/components/dashboard/SiteAdminDashboardShell";
import { ensureAccountFromClerkUser, getCurrentAccount } from "@/lib/accounts";
import { isClerkAdmin } from "@/lib/admin";
import { reconcileOrganizerSubscription } from "@/lib/billing/reconcile";
import { ensurePlayerRowForAccount, getPlayerByAccountId } from "@/lib/players";
import { hasEffectiveOrganizerSubscription } from "@/lib/subscription";

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
    return <PlayerDashboardShell username={player.username}>{children}</PlayerDashboardShell>;
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

  if (account.accountType === "site_admin") {
    await ensurePlayerRowForAccount(account, account.name);
    return (
      <SiteAdminDashboardShell
        account={account}
        isAdmin={admin}
        organizerSubscriptionEffective={organizerEffective}
      >
        {children}
      </SiteAdminDashboardShell>
    );
  }

  return (
    <DashboardShell account={account} isAdmin={admin} subscriptionEffective={organizerEffective}>
      {children}
    </DashboardShell>
  );
}
