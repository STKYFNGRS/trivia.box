import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSiteAdminResponse } from "@/lib/adminApi";
import { runQuestionDraftPipeline } from "@/lib/ai/pipeline";
import { apiErrorResponse } from "@/lib/apiError";
import {
  getCategoryLabels,
  getSubcategoryById,
  pickNextGapSubcategoryForCategoryLabel,
} from "@/lib/questionTaxonomy";
import { enforceRateLimit } from "@/lib/rateLimit";

const bodySchema = z.object({
  category: z.string().min(1).max(120),
  topicHint: z.string().max(200).optional(),
  subcategoryId: z.string().uuid().optional(),
});

function classifyGenerationError(e: unknown): { status: number; body: Record<string, unknown> } {
  const msg = e instanceof Error ? e.message : String(e);

  if (msg.includes("No Claude API key configured")) {
    return {
      status: 503,
      body: {
        error: "No LLM API key configured.",
        code: "LLM_NOT_CONFIGURED",
        hint: "Set CLAUDE_API_KEY to enable question generation.",
      },
    };
  }

  if (/Anthropic error 401|invalid.*api.*key|authentication/i.test(msg)) {
    return {
      status: 401,
      body: {
        error: "LLM API rejected the request (check API key).",
        code: "LLM_AUTH_FAILED",
      },
    };
  }

  if (/Anthropic error 429|rate limit|529|overloaded/i.test(msg)) {
    return {
      status: 503,
      body: {
        error: "LLM provider is rate-limited or temporarily unavailable. Retry shortly.",
        code: "LLM_RATE_LIMIT",
      },
    };
  }

  return {
    status: 500,
    body: {
      error: msg.length > 400 ? `${msg.slice(0, 400)}…` : msg,
      code: "GENERATION_FAILED",
    },
  };
}

export async function POST(req: Request) {
  const gate = await requireSiteAdminResponse();
  if (gate) return gate;

  // Keyed by the Clerk user id that just passed the admin gate — cheap and
  // specific to the human running the generator, not the pod's egress IP.
  const { userId } = await auth();
  try {
    await enforceRateLimit("adminGenerate", `admin:${userId ?? "anon"}`);
  } catch (e) {
    return apiErrorResponse(e);
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const labels = await getCategoryLabels();
  if (labels.length === 0) {
    return NextResponse.json(
      {
        error: "Question taxonomy is empty. Run migration 0004_question_taxonomy.",
        code: "TAXONOMY_MISSING",
      },
      { status: 503 }
    );
  }
  if (!labels.includes(parsed.data.category)) {
    return NextResponse.json({ error: `Unknown category: ${parsed.data.category}` }, { status: 400 });
  }

  let subcategoryLabel: string | null = null;
  let notesForGeneration: string | null = null;

  if (parsed.data.subcategoryId) {
    const row = await getSubcategoryById(parsed.data.subcategoryId);
    if (!row || row.category.label !== parsed.data.category || !row.active || !row.category.active) {
      return NextResponse.json({ error: "Invalid subcategory for category" }, { status: 400 });
    }
    subcategoryLabel = row.label;
    notesForGeneration = row.notesForGeneration;
  } else {
    const gap = await pickNextGapSubcategoryForCategoryLabel(parsed.data.category);
    if (gap) {
      subcategoryLabel = gap.label;
      notesForGeneration = gap.notesForGeneration;
    }
  }

  try {
    const result = await runQuestionDraftPipeline({
      category: parsed.data.category,
      topicHint: parsed.data.topicHint,
      subcategoryLabel,
      notesForGeneration,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (process.env.NODE_ENV !== "production" && e instanceof Error) {
      console.error("[question-generation]", e.message);
    }
    const { status, body } = classifyGenerationError(e);
    return NextResponse.json(body, { status });
  }
}
