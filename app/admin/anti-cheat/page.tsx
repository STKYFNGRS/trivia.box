import { redirect } from "next/navigation";
import { isSiteAdminOperator } from "@/lib/siteAdmin";
import { AntiCheatClient } from "@/components/admin/AntiCheatClient";
import { SectionHeader } from "@/components/ui/section-header";

export default async function AntiCheatPage() {
  const siteOperator = await isSiteAdminOperator();
  if (!siteOperator) {
    redirect("/admin");
  }
  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        as="h1"
        eyebrow="Admin"
        title="Anti-cheat"
        description="Sessions where multiple players share a hashed IP, device marker, or user-agent. Drill in to disqualify individual answers — the leaderboard recomputes automatically."
      />
      <AntiCheatClient />
    </div>
  );
}
