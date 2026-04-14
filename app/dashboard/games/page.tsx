import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getCurrentAccount } from "@/lib/accounts";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";

export default async function GamesPage() {
  const account = await getCurrentAccount();
  if (!account) return null;

  const rows = await db
    .select({
      id: sessions.id,
      joinCode: sessions.joinCode,
      status: sessions.status,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .where(eq(sessions.hostAccountId, account.id))
    .orderBy(desc(sessions.createdAt))
    .limit(25);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Games</h1>
          <p className="text-muted-foreground mt-1 text-sm">Recent sessions you hosted.</p>
        </div>
        <Link href="/dashboard/games/new" className={cn(buttonVariants())}>
          New game
        </Link>
      </div>

      <div className="grid gap-3">
        {rows.length === 0 ? (
          <div className="text-muted-foreground text-sm">No sessions yet.</div>
        ) : (
          rows.map((s) => (
            <Card key={s.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base font-mono">{s.joinCode}</CardTitle>
                <div className="text-muted-foreground text-xs">{s.status}</div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 text-sm">
                {s.status === "active" && !s.joinCode.startsWith("pending_") ? (
                  <>
                    <Link
                      href={`/game/${s.joinCode}/host?sessionId=${encodeURIComponent(s.id)}`}
                      className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}
                    >
                      Host
                    </Link>
                    <Link
                      href={`/game/${s.joinCode}/display`}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}
                    >
                      Display
                    </Link>
                  </>
                ) : null}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
