import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/accounts";

export default async function GamesSectionLayout({ children }: { children: React.ReactNode }) {
  const account = await getCurrentAccount();
  if (account?.accountType === "player") {
    redirect("/dashboard/player");
  }
  return children;
}
