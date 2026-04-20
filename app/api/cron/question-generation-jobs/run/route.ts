import { NextResponse } from "next/server";
import { z } from "zod";
import { processQueuedQuestionGenerationJobs } from "@/lib/ai/questionGenerationRunner";

const bodySchema = z.object({
  maxJobs: z.number().int().min(1).max(20).optional().default(5),
});

/**
 * Vercel cron / worker: set `CRON_SECRET` and call with `Authorization: Bearer <CRON_SECRET>`.
 * Public in middleware; guarded by secret only.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization")?.trim() !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { processed, results } = await processQueuedQuestionGenerationJobs(parsed.data.maxJobs);
  return NextResponse.json({ processed, results });
}
