import { getCurrentAccount } from "@/lib/accounts";
import { HostDashboard } from "@/components/dashboard/HostDashboard";
import { VenueDashboard } from "@/components/dashboard/VenueDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardHomePage() {
  const account = await getCurrentAccount();
  if (!account) {
    return null;
  }

  const label = account.accountType === "host" ? "Host" : "Venue";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {account.name}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Signed in as a <span className="text-foreground font-medium">{label}</span> in {account.city}.
        </p>
      </div>

      {account.accountType === "host" ? (
        <HostDashboard subscriptionActive={account.subscriptionActive} />
      ) : (
        <VenueDashboard subscriptionActive={account.subscriptionActive} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          <p>
            Status:{" "}
            <span className="text-foreground font-medium">
              {account.subscriptionActive ? "Active" : "Inactive"}
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
