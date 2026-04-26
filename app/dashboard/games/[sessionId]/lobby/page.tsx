import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { getCurrentAccount } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { players, playerSessions, sessions } from "@/lib/db/schema";
import { SectionHeader } from "@/components/ui/section-header";
import {
  SessionLobbyClient,
  type SessionLobbyInitial,
  type LobbyPlayer,
} from "@/components/dashboard/SessionLobbyClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lobby — Trivia.Box",
};

export default async function HostLobbyPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const account = await getCurrentAccount();
  if (!account) redirect("/sign-in");
  if (account.accountType !== "host" && account.accountType !== "site_admin") {
    redirect("/dashboard");
  }

  const { sessionId } = await params;

  const [session] = await db
    .select({
      id: sessions.id,
      hostAccountId: sessions.hostAccountId,
      venueAccountId: sessions.venueAccountId,
      joinCode: sessions.joinCode,
      status: sessions.status,
      runMode: sessions.runMode,
      timerMode: sessions.timerMode,
      eventStartsAt: sessions.eventStartsAt,
      eventTimezone: sessions.eventTimezone,
      estimatedEndAt: sessions.estimatedEndAt,
      hasPrize: sessions.hasPrize,
      prizeDescription: sessions.prizeDescription,
      onlineMeetingUrl: sessions.onlineMeetingUrl,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId));

  if (!session) notFound();

  if (session.hostAccountId !== account.id) {
    redirect("/dashboard/games");
  }

  // If the session is already past pending, jump to wherever it lives now —
  // a lobby for a completed game is never useful.
  if (session.status === "active" || session.status === "paused") {
    redirect(`/game/${session.joinCode}/host?sessionId=${session.id}`);
  }
  if (session.status === "completed") {
    redirect(`/dashboard/games/${session.id}/recap`);
  }
  if (session.status === "cancelled") {
    redirect(`/dashboard/games`);
  }

  const roster = await db
    .select({
      playerId: players.id,
      username: players.username,
      joinedAt: playerSessions.joinedAt,
    })
    .from(playerSessions)
    .innerJoin(players, eq(players.id, playerSessions.playerId))
    .where(eq(playerSessions.sessionId, session.id))
    .orderBy(asc(playerSessions.joinedAt));

  const initial: SessionLobbyInitial = {
    sessionId: session.id,
    joinCode: session.joinCode,
    status: session.status as SessionLobbyInitial["status"],
    runMode: session.runMode as SessionLobbyInitial["runMode"],
    timerMode: session.timerMode as SessionLobbyInitial["timerMode"],
    eventStartsAt: session.eventStartsAt
      ? new Date(session.eventStartsAt).toISOString()
      : null,
    eventTimezone: session.eventTimezone ?? null,
    estimatedEndAt: session.estimatedEndAt
      ? new Date(session.estimatedEndAt).toISOString()
      : null,
    hasPrize: session.hasPrize,
    prizeDescription: session.prizeDescription ?? null,
    onlineMeetingUrl: session.onlineMeetingUrl ?? null,
    players: roster.map((r) => ({
      playerId: r.playerId,
      username: r.username,
      joinedAt: r.joinedAt ? new Date(r.joinedAt).toISOString() : null,
    })) satisfies LobbyPlayer[],
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        eyebrow="Lobby"
        title="Share the code, gather the room"
        description="Players can join right now. When everyone's in, click Start game."
      />
      <SessionLobbyClient initial={initial} />
    </div>
  );
}
