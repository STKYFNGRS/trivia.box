import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { questionPackages } from "@/lib/db/schema";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const account = await getAccountByClerkUserId(userId);
  if (!account || account.accountType === "player") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: questionPackages.id,
      slug: questionPackages.slug,
      name: questionPackages.name,
      description: questionPackages.description,
    })
    .from(questionPackages);

  return NextResponse.json({ packages: rows });
}
