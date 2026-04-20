import { eq } from "drizzle-orm";
import { anthropicMessagesJson } from "@/lib/ai/anthropic";
import {
  dedupeWithinBatchParaphrase,
  duplicateScoreForBody,
  getDuplicateRejectThreshold,
} from "@/lib/ai/dedupe";
import { getQuestionLlmProvider } from "@/lib/ai/provider";
import { getCategoryLabels } from "@/lib/questionTaxonomy";
import { db } from "@/lib/db/client";
import { questionDrafts } from "@/lib/db/schema";

export type GeneratedQuestion = {
  body: string;
  correctAnswer: string;
  wrongAnswers: [string, string, string];
  category: string;
  subcategory: string;
  difficulty: 1 | 2 | 3;
  timeHint?: number;
};

export type QuestionPipelineInput = {
  category: string;
  topicHint?: string | null;
  /** Canonical label from `question_subcategories.label` when targeted. */
  subcategoryLabel?: string | null;
  /** Optional bucket notes from taxonomy, injected into prompts. */
  notesForGeneration?: string | null;
};

export type QuestionPipelineResult = {
  draftId: string;
  duplicateScore: number;
  selfReview: "pass" | "fail" | "skipped";
  provider: string;
  outcome: "pending_review" | "rejected_self_review" | "rejected_duplicate";
};

async function openaiJson<T>(system: string, user: string): Promise<T> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Empty OpenAI response");
  return JSON.parse(raw) as T;
}

function coerceGenerated(
  raw: unknown,
  fallbackCategory: string,
  allowedCategoryLabels: Set<string>,
  forcedSubcategory?: string
): GeneratedQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const body = typeof o.body === "string" ? o.body.trim() : "";
  const correctAnswer = typeof o.correctAnswer === "string" ? o.correctAnswer.trim() : "";
  const wrong = o.wrongAnswers;
  if (!body || !correctAnswer || !Array.isArray(wrong) || wrong.length !== 3) return null;
  const wrongAnswers = wrong.map((w) => String(w).trim()) as [string, string, string];
  const catRaw = typeof o.category === "string" ? o.category.trim() : fallbackCategory;
  const cat = allowedCategoryLabels.has(catRaw) ? catRaw : fallbackCategory;
  const sub =
    typeof forcedSubcategory === "string" && forcedSubcategory.length > 0
      ? forcedSubcategory
      : typeof o.subcategory === "string"
        ? o.subcategory.trim()
        : "General";
  const d = Number(o.difficulty);
  const difficulty = d === 1 || d === 2 || d === 3 ? d : 2;
  const th = Number(o.timeHint);
  const timeHint = th === 10 || th === 20 || th === 30 ? th : 20;
  return {
    body,
    correctAnswer,
    wrongAnswers,
    category: cat,
    subcategory: sub || "General",
    difficulty,
    timeHint,
  };
}

function sortGeneratedQuestions(items: GeneratedQuestion[]): GeneratedQuestion[] {
  return [...items].sort((a, b) => {
    const c = a.category.localeCompare(b.category);
    if (c !== 0) return c;
    const s = a.subcategory.localeCompare(b.subcategory);
    if (s !== 0) return s;
    if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
    return a.body.localeCompare(b.body);
  });
}

async function generateWithAnthropic(
  input: QuestionPipelineInput,
  allowedList: string[],
  allowedSet: Set<string>,
  forcedSubcategory: string | undefined
): Promise<{
  questions: GeneratedQuestion[];
  usage: Record<string, number | undefined>;
}> {
  const diversity = `Vary the angle; avoid repeating tired textbook facts unless the topic hint asks. Do not paraphrase the same question stem structure as common bar-trivia clichés in this category.`;
  const subLine = forcedSubcategory
    ? `Subcategory (use exactly this label in JSON): ${forcedSubcategory}.`
    : "";
  const notesLine = input.notesForGeneration ? `Bucket guidance: ${input.notesForGeneration}` : "";
  const user = `Category: ${input.category}. ${subLine}
Topic hint: ${input.topicHint ?? "general"}.
${notesLine}
${diversity}
Return ONLY valid JSON with shape:
{ "questions": [ { "body": string, "correctAnswer": string, "wrongAnswers": [string,string,string], "category": string, "subcategory": string, "difficulty": 1|2|3, "timeHint": 10|20|30 } ] }
Include exactly one question in the array. Category must be exactly one of: ${allowedList.join(", ")}.`;

  const { data, meta } = await anthropicMessagesJson<{ questions?: unknown[] }>({
    system: `You write bar trivia questions. Output JSON only. category must be exactly one of: ${allowedList.join(", ")}.`,
    user,
    maxTokens: 4096,
  });

  const rawList = Array.isArray(data.questions) ? data.questions : [];
  const questions = rawList
    .map((r) => coerceGenerated(r, input.category, allowedSet, forcedSubcategory))
    .filter((q): q is GeneratedQuestion => Boolean(q));

  return {
    questions,
    usage: { input: meta.inputTokens, output: meta.outputTokens },
  };
}

async function generateWithOpenAI(
  input: QuestionPipelineInput,
  allowedSet: Set<string>,
  forcedSubcategory: string | undefined
): Promise<{
  questions: GeneratedQuestion[];
  usage: Record<string, unknown>;
}> {
  const subLine = forcedSubcategory ? `Subcategory must be: ${forcedSubcategory}.` : "";
  const gen = await openaiJson<Record<string, unknown>>(
    `You write bar trivia questions. Return ONLY valid JSON with keys: body (string question), correctAnswer (string), wrongAnswers (array of exactly 3 plausible wrong strings), category (string), subcategory (string), difficulty (1|2|3), timeHint (10|20|30 optional, default 20).`,
    `Category: ${input.category}. ${subLine} Topic hint: ${input.topicHint ?? "general"}. ${input.notesForGeneration ? `Notes: ${input.notesForGeneration}` : ""}`
  );
  const one = coerceGenerated(gen, input.category, allowedSet, forcedSubcategory);
  return { questions: one ? [one] : [], usage: {} };
}

async function selfReviewAnthropic(items: GeneratedQuestion[]): Promise<{
  reviews: { index: number; verdict: "pass" | "fail"; reason: string }[];
  usage: Record<string, number | undefined>;
}> {
  const payload = JSON.stringify(
    items.map((q, i) => ({
      index: i,
      body: q.body,
      correct: q.correctAnswer,
      wrong: q.wrongAnswers,
    }))
  );
  const { data, meta } = await anthropicMessagesJson<{
    reviews?: { index: number; verdict: "pass" | "fail"; reason: string }[];
  }>({
    system: `You verify trivia factual quality. Return ONLY JSON: { "reviews": [ { "index": number, "verdict": "pass"|"fail", "reason": string } ] }
One entry per input index. Be strict on factual errors or ambiguous questions.`,
    user: `Review each item:\n${payload}`,
    maxTokens: 2048,
  });
  const reviews = Array.isArray(data.reviews) ? data.reviews : [];
  return { reviews, usage: { input: meta.inputTokens, output: meta.outputTokens } };
}

async function selfReviewOpenAI(items: GeneratedQuestion[]): Promise<{
  reviews: { index: number; verdict: "pass" | "fail"; reason: string }[];
}> {
  const q = items[0];
  if (!q) return { reviews: [] };
  const fact = await openaiJson<{ verdict?: "pass" | "fail"; note?: string }>(
    `You verify trivia factual accuracy. Return JSON { verdict: "pass"|"fail", note: string }.`,
    `Question: ${q.body}\nCorrect: ${q.correctAnswer}\nWrong: ${q.wrongAnswers.join(" | ")}`
  );
  // Mirror the Anthropic path: any non-"pass" verdict is treated as fail so a
  // malformed LLM response can never silently approve a draft.
  const verdict = fact.verdict === "pass" ? "pass" : "fail";
  return {
    reviews: [
      {
        index: 0,
        verdict,
        reason: (fact.note ?? (verdict === "fail" ? "missing self-review verdict" : "")) || "",
      },
    ],
  };
}

const PIPELINE_VERSION = "taxonomy-dedupe-v1";

export async function runQuestionDraftPipeline(input: QuestionPipelineInput): Promise<QuestionPipelineResult> {
  const provider = getQuestionLlmProvider();
  const allowedLabels = await getCategoryLabels();
  if (allowedLabels.length === 0) {
    throw new Error(
      "Question taxonomy is empty. Apply database migration 0004_question_taxonomy (and seed) before generating."
    );
  }
  const allowedSet = new Set(allowedLabels);
  if (!allowedSet.has(input.category)) {
    throw new Error(
      `Unknown category "${input.category}". Pick an active category label from the taxonomy (see /admin/question-taxonomy).`
    );
  }

  const subLabel = input.subcategoryLabel?.trim() || "General";

  const log: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    provider,
    pipelineVersion: PIPELINE_VERSION,
    steps: {} as Record<string, unknown>,
    resolved: { category: input.category, subcategory: subLabel },
  };

  let gen: GeneratedQuestion[] = [];
  let genUsage: Record<string, unknown> = {};

  const forcedSub = input.subcategoryLabel?.trim() ? subLabel : undefined;

  if (provider === "anthropic") {
    const r = await generateWithAnthropic(input, allowedLabels, allowedSet, forcedSub);
    gen = r.questions;
    genUsage = r.usage;
  } else {
    const r = await generateWithOpenAI(input, allowedSet, forcedSub);
    gen = r.questions;
    genUsage = r.usage;
  }

  (log.steps as Record<string, unknown>).generate = { count: gen.length, usage: genUsage };
  if (gen.length === 0) {
    throw new Error("Generation produced no valid questions");
  }

  gen = dedupeWithinBatchParaphrase(gen);
  const sorted = sortGeneratedQuestions(gen);
  (log.steps as Record<string, unknown>).sort = { keys: ["category", "subcategory", "difficulty", "body"] };
  (log.steps as Record<string, unknown>).withinBatchDedupe = { after: sorted.length, method: "paraphrase" };

  let base = sorted[0]!;
  base = {
    ...base,
    category: input.category,
    subcategory: subLabel,
  };

  const duplicateScore = await duplicateScoreForBody(base.body);
  const rejectThreshold = getDuplicateRejectThreshold();
  (log.steps as Record<string, unknown>).dedupe = {
    duplicateScore,
    method: "snippet_or_trgm",
    rejectThreshold,
  };

  if (duplicateScore >= rejectThreshold) {
    (log.steps as Record<string, unknown>).selfReview = { skipped: true, reason: "duplicate_similarity_gate" };
    const [draft] = await db
      .insert(questionDrafts)
      .values({
        body: base.body,
        correctAnswer: base.correctAnswer,
        wrongAnswers: [...base.wrongAnswers],
        category: base.category,
        subcategory: base.subcategory,
        difficulty: base.difficulty ?? 2,
        timeHint: base.timeHint ?? 20,
        status: "rejected",
        pipelineLog: JSON.stringify(log),
        duplicateScore,
        reviewNote: `auto-rejected: high similarity (score ${duplicateScore} ≥ ${rejectThreshold})`,
        reviewedAt: new Date(),
      })
      .returning({ id: questionDrafts.id });

    if (!draft) {
      throw new Error("Failed to insert duplicate-rejected draft");
    }

    return {
      draftId: draft.id,
      duplicateScore,
      selfReview: "skipped",
      provider,
      outcome: "rejected_duplicate",
    };
  }

  const forReview = [{ ...base }];

  let reviews: { index: number; verdict: "pass" | "fail"; reason: string }[] = [];
  let reviewUsage: Record<string, unknown> = {};
  if (provider === "anthropic") {
    const r = await selfReviewAnthropic(forReview);
    reviews = r.reviews;
    reviewUsage = r.usage;
  } else {
    const r = await selfReviewOpenAI(forReview);
    reviews = r.reviews;
  }
  (log.steps as Record<string, unknown>).selfReview = { reviews, usage: reviewUsage };

  const reviewByIndex = new Map<number, { verdict: "pass" | "fail"; reason: string }>();
  for (const rv of reviews) {
    if (typeof rv.index === "number" && (rv.verdict === "pass" || rv.verdict === "fail")) {
      reviewByIndex.set(rv.index, { verdict: rv.verdict, reason: rv.reason ?? "" });
    }
  }

  const rv0 =
    reviewByIndex.get(0) ??
    ({ verdict: "fail" as const, reason: "missing self-review output for item 0" } as const);

  const [draft] = await db
    .insert(questionDrafts)
    .values({
      body: base.body,
      correctAnswer: base.correctAnswer,
      wrongAnswers: [...base.wrongAnswers],
      category: base.category,
      subcategory: base.subcategory,
      difficulty: base.difficulty ?? 2,
      timeHint: base.timeHint ?? 20,
      status: "pending_review",
      pipelineLog: JSON.stringify(log),
      duplicateScore,
    })
    .returning({ id: questionDrafts.id });

  if (!draft) {
    throw new Error("Failed to insert draft");
  }

  if (rv0.verdict === "fail") {
    await db
      .update(questionDrafts)
      .set({
        status: "rejected",
        reviewNote: `self-review: ${rv0.reason}`.slice(0, 500),
        reviewedAt: new Date(),
      })
      .where(eq(questionDrafts.id, draft.id));
    return {
      draftId: draft.id,
      duplicateScore,
      selfReview: "fail",
      provider,
      outcome: "rejected_self_review",
    };
  }

  return {
    draftId: draft.id,
    duplicateScore,
    selfReview: "pass",
    provider,
    outcome: "pending_review",
  };
}
