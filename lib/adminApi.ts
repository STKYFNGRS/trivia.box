import { NextResponse } from "next/server";
import { isClerkAdmin } from "@/lib/admin";

export async function requireAdminResponse(): Promise<NextResponse | null> {
  const ok = await isClerkAdmin();
  if (!ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
