import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isClerkAdmin } from "@/lib/admin";
import { isSiteAdminOperator } from "@/lib/siteAdmin";

export async function requireAdminResponse(): Promise<NextResponse | null> {
  const ok = await isClerkAdmin();
  if (!ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/** Question drafts / AI generation: site operators only (not general Clerk admin). */
export async function requireSiteAdminResponse(): Promise<NextResponse | null> {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ok = await isSiteAdminOperator();
  if (!ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

