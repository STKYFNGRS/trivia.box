import Ably from "ably";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";

const schema = z.object({
  joinCode: z.string().length(6),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const code = parsed.data.joinCode.toUpperCase();
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.joinCode, code))
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const key = process.env.ABLY_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Ably not configured" }, { status: 500 });
  }

  const ably = new Ably.Rest(key);

  const tokenRequest = await (
    ably.auth as unknown as {
      createTokenRequest: (
        params: { clientId: string; capability: Record<string, string[]> }
      ) => Promise<Ably.TokenRequest>;
    }
  ).createTokenRequest({
    clientId: `client:${nanoid(10)}`,
    capability: {
      [`game:${code}`]: ["subscribe", "history", "presence"],
    },
  });

  return NextResponse.json(tokenRequest);
}
