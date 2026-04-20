import { NextResponse } from "next/server";
import { z } from "zod";
import { processQueuedQuestionGenerationJobs } from "@/lib/ai/questionGenerationRunner";
import { cronAuthOrResponse } from "@/lib/cronAuth";

const bodySchema = z.object({
  maxJobs: z.number().int().min(1).max(20).optional().default(5),
});

/**
 * Vercel cron / worker. Public in middleware; gated by {@link cronAuthOrResponse}
 * which accepts either the Vercel-injected `x-vercel-cron` header or a
 * `Authorization: Bearer $CRON_SECRET` match for manual / local runs.
 */
async function run(req: Request) {
  const unauthorized = cronAuthOrResponse(req);
  if (unauthorized) return unauthorized;

  const json = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { processed, results } = await processQueuedQuestionGenerationJobs(
    parsed.data.maxJobs
  );
  return NextResponse.json({ processed, results });
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}

export const dynamic = "force-dynamic";
