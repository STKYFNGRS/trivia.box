import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/accounts";
import { CreatorPerksCard } from "@/components/dashboard/CreatorPerksCard";
import { HostDashboard } from "@/components/dashboard/HostDashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusPill } from "@/components/ui/status-pill";
import { hasEffectiveOrganizerSubscription } from "@/lib/subscription";

export default async function DashboardHomePage() {
  const account = await getCurrentAccount();
  if (!account) {
    return null;
  }

  if (account.accountType === "player") {
    redirect("/dashboard/player");
  }

  const orgSub = hasEffectiveOrganizerSubscription(account);

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
        <CardContent className="text-muted-foreground text-sm">
          Manage billing from the header banner or by reactivating a subscription.
        </CardContent>
      </Card>

      <CreatorPerksCard accountId={account.id} />
    </div>
  );
}
