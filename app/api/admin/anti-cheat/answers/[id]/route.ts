import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSiteAdminResponse } from "@/lib/adminApi";
import { setAnswerDisqualified } from "@/lib/antiCheatQueries";
import { zodErrorResponse } from "@/lib/apiError";

const patchSchema = z.object({
  disqualified: z.boolean(),
});

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireSiteAdminResponse();
  if (gate) return gate;

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid answer id" }, { status: 400 });
  }

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return zodErrorResponse(parsed.error, "Invalid payload");
  }

  await setAnswerDisqualified({
    answerId: id,
    disqualified: parsed.data.disqualified,
  });

  return NextResponse.json({ ok: true });
}
