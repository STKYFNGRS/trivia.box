import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSiteAdminResponse } from "@/lib/adminApi";
import { listAnswersForCluster } from "@/lib/antiCheatQueries";
import { zodErrorResponse } from "@/lib/apiError";

const querySchema = z.object({
  sessionId: z.string().uuid(),
  kind: z.enum(["ip", "ua", "device"]),
  fingerprint: z.string().min(4).max(128),
});

export async function GET(req: Request) {
  const gate = await requireSiteAdminResponse();
  if (gate) return gate;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    sessionId: url.searchParams.get("sessionId") ?? "",
    kind: url.searchParams.get("kind") ?? "",
    fingerprint: url.searchParams.get("fingerprint") ?? "",
  });
  if (!parsed.success) {
    return zodErrorResponse(parsed.error, "Invalid query");
  }

  const rows = await listAnswersForCluster({
    sessionId: parsed.data.sessionId,
    fingerprintKind: parsed.data.kind,
    fingerprint: parsed.data.fingerprint,
  });
  return NextResponse.json({ answers: rows });
}
