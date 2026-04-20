import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PlayerDashboardShell } from "@/components/dashboard/PlayerDashboardShell";
import { SiteAdminDashboardShell } from "@/components/dashboard/SiteAdminDashboardShell";
import { ensureAccountFromClerkUser } from "@/lib/accounts";
import { isClerkAdmin } from "@/lib/admin";
import { ensurePlayerRowForAccount, getPlayerByAccountId } from "@/lib/players";
import { hasEffectiveOrganizerSubscription } from "@/lib/subscription";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const account = await ensureAccountFromClerkUser();
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
