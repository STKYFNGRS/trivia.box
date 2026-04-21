import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentAccount } from "@/lib/accounts";
import { listFriends, listPendingRequests } from "@/lib/friends";
import { getPlayerByAccountId } from "@/lib/players";
import { FriendsListClient } from "./FriendsListClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Friends",
};

export default async function FriendsPage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/sign-in");

  const player = await getPlayerByAccountId(account.id);
  if (!player) {
    redirect("/dashboard/player");
  }

  const [friends, pending] = await Promise.all([
    listFriends(player.id),
    listPendingRequests(player.id),
  ]);

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
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Friends</h1>
        <p className="text-muted-foreground mt-1 max-w-xl text-sm">
          Follow rivals, see who&apos;s climbing the weekly leaderboard, and
          compare accuracy on each other&apos;s profiles. Add new friends from
          any profile page at <code>/u/&lt;username&gt;</code>.
        </p>
      </div>

      <FriendsListClient
        initialFriends={friends.map((f) => ({
          playerId: f.playerId,
          username: f.username,
          totalPoints: f.totalPoints,
          friendsSince: f.friendsSince.toISOString(),
        }))}
        initialPending={pending.map((p) => ({
          requestId: p.requestId,
          playerId: p.playerId,
          username: p.username,
          createdAt: p.createdAt.toISOString(),
          direction: p.direction,
        }))}
      />
    </div>
  );
}
