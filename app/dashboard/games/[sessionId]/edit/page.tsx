import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";
import { EditSessionClient, type EditSessionInitial } from "./EditSessionClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Edit event",
};

export default async function EditSessionPage({
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
      venueAccountId: sessions.venueAccountId,
      status: sessions.status,
      runMode: sessions.runMode,
      eventStartsAt: sessions.eventStartsAt,
      eventTimezone: sessions.eventTimezone,
      theme: sessions.theme,
      hasPrize: sessions.hasPrize,
      prizeDescription: sessions.prizeDescription,
      prizeTopN: sessions.prizeTopN,
      prizeLabels: sessions.prizeLabels,
      prizeInstructions: sessions.prizeInstructions,
      prizeExpiresAt: sessions.prizeExpiresAt,
      hostNotes: sessions.hostNotes,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId));

  if (!session) notFound();
  if (session.venueAccountId !== account.id) {
    redirect("/dashboard/games");
  }

  const initial: EditSessionInitial = {
    id: session.id,
    status: session.status,
    runMode: session.runMode,
    eventStartsAt: new Date(session.eventStartsAt).toISOString(),
    eventTimezone: session.eventTimezone ?? "",
    theme: session.theme ?? null,
    hasPrize: session.hasPrize,
    prizeDescription: session.prizeDescription ?? "",
    prizeTopN: session.prizeTopN ?? 1,
    prizeLabels: Array.isArray(session.prizeLabels) ? (session.prizeLabels as string[]) : [],
    prizeInstructions: session.prizeInstructions ?? "",
    prizeExpiresAt: session.prizeExpiresAt
      ? new Date(session.prizeExpiresAt).toISOString()
      : "",
    hostNotes: session.hostNotes ?? "",
  };

  return <EditSessionClient initial={initial} />;
}
