import { customAlphabet } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";

const alphabet = customAlphabet("0123456789ABCDEFGHJKLMNPQRSTUVWXYZ", 6);

export async function generateUniqueJoinCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = alphabet();
    const existing = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.joinCode, code))
      .limit(1);
    if (existing.length === 0) return code;
  }
  throw new Error("Could not allocate join code");
}
