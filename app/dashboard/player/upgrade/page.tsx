import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/accounts";
import { UpgradeClient } from "./UpgradeClient";

type SearchParams = { checkout?: string };

export default async function UpgradePage(props: { searchParams: Promise<SearchParams> }) {
  const account = await getCurrentAccount();
  if (!account) {
    redirect("/sign-in");
  }
  const sp = await props.searchParams;

  // Hosts who already have an active subscription don't need this page.
  if (account.accountType === "host" && account.subscriptionActive && sp.checkout !== "success") {
    redirect("/dashboard");
  }

  return <UpgradeClient checkoutState={sp.checkout ?? null} accountType={account.accountType} />;
}
