import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AchievementCatalog } from "@/components/player/AchievementCatalog";
import { getCurrentAccount } from "@/lib/accounts";
import {
  BASELINE_ACHIEVEMENT_CATALOG,
  computePlayerAchievementCatalog,
} from "@/lib/game/achievementCatalog";
import { listPlayerAchievements } from "@/lib/game/achievements";
import { getPlayerByAccountId } from "@/lib/players";

export const dynamic = "force-dynamic";

/**
 * Owner-only achievements hub. Shows the full baseline catalog with
 * progress bars for locked trophies and the dynamic per-category /
 * per-venue ones under "Bonus trophies" so a player can actually see
 * how close they are to the next unlock — a step up from the public
 * profile which only shows earned items.
 */
export default async function PlayerAchievementsPage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/sign-in");

  const player = await getPlayerByAccountId(account.id);
  if (!player) redirect("/sign-in");

  const baselineSlugs = new Set(
    BASELINE_ACHIEVEMENT_CATALOG.map((entry) => entry.slug)
  );

  const [catalog, earned] = await Promise.all([
    computePlayerAchievementCatalog(player.id),
    listPlayerAchievements(player.id),
  ]);

  const bonus = earned
    .filter((a) => !baselineSlugs.has(a.slug))
    .map((a) => ({
      slug: a.slug,
      title: a.title,
      description: a.description,
      icon: a.icon,
      earnedAt: a.earnedAt,
    }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/player"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to player dashboard
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Achievements
        </h1>
        <p className="text-muted-foreground mt-1 max-w-xl text-sm">
          Everything there is to unlock on Trivia.Box, with how close you are
          to the next one. Only you can see locked progress — the public
          profile shows unlocked trophies only.
        </p>
      </div>

      <AchievementCatalog rows={catalog} bonus={bonus} />
    </div>
  );
}
