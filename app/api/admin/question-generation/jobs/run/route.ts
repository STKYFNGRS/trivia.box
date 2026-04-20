import { NextResponse } from "next/server";
import { z } from "zod";
import { processQueuedQuestionGenerationJobs } from "@/lib/ai/questionGenerationRunner";
import { requireSiteAdminResponse } from "@/lib/adminApi";

const bodySchema = z.object({
  maxJobs: z.number().int().min(1).max(20).optional().default(5),
});

export async function POST(req: Request) {
  const gate = await requireSiteAdminResponse();
  if (gate) return gate;

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { processed, results } = await processQueuedQuestionGenerationJobs(parsed.data.maxJobs);
  return NextResponse.json({ processed, results });
}
