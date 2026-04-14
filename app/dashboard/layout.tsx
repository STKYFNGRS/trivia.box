import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ensureAccountFromClerkUser } from "@/lib/accounts";
import { isClerkAdmin } from "@/lib/admin";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const account = await ensureAccountFromClerkUser();
  if (!account) {
    redirect("/sign-in");
  }

  const admin = await isClerkAdmin();

  return (
    <DashboardShell account={account} isAdmin={admin}>
      {children}
    </DashboardShell>
  );
}
