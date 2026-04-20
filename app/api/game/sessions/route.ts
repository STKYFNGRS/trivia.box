import { auth } from "@clerk/nextjs/server";
import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import {
  questionDecks,
  questionPackageItems,
  questions as questionsTable,
  rounds,
  sessionQuestions,
  sessions,
} from "@/lib/db/schema";
import { slugifyDeckName } from "@/lib/decks";
import { wallClockToUtcDate } from "@/lib/game/eventStartUtc";
import {
  countSmartPullEligible,
  getVettedQuestionsByOrderedIds,
  smartPullQuestions,
  type PulledQuestion,
} from "@/lib/game/questionPull";
import { InsufficientQuestionPoolError } from "@/lib/game/sessionQuestionPoolError";
import { assertHostCanUseVenue } from "@/lib/game/sessionPermissions";
import { computeEstimatedEndAt } from "@/lib/game/sessionEndTime";
import { hasEffectiveOrganizerSubscription } from "@/lib/subscription";
import { isValidIanaTimeZone } from "@/lib/timezones";

const customQuestionSchema = z.object({
  body: z.string().trim().min(5).max(500),
  correctAnswer: z.string().trim().min(1).max(160),
  wrongAnswers: z.array(z.string().trim().min(1).max(160)).length(3),
  difficulty: z.number().int().min(1).max(3).default(2),
});

/** Shared validator for per-question timer: 5..60 in 5-second increments. */
const secondsPerQuestionSchema = z
  .number()
  .int()
  .min(5)
  .max(60)
  .refine((n) => n % 5 === 0, { message: "secondsPerQuestion must be a multiple of 5" });

const roundSchema = z
  .object({
    roundNumber: z.number().int().min(1).max(50),
    category: z.string().min(1),
    questionsPerRound: z.number().int().min(1).max(50).default(10),
    /** Directly pinned vetted question ids (legacy "paste UUIDs" flow). */
    questionIds: z.array(z.string().uuid()).max(50).optional(),
    /** Source a deck owned by the caller or an approved public deck. */
    deckId: z.string().uuid().optional(),
    /**
     * Inline-authored questions for this game; stored under a hidden
     * `game_scoped` deck. May be fewer than `questionsPerRound` when
     * `randomFillCount` makes up the difference.
     */
    customQuestions: z.array(customQuestionSchema).min(1).max(50).optional(),
    /**
     * Explicit random smart-pull count. When set alongside `questionIds` or
     * `customQuestions`, fills the remainder of the round from the vetted
     * pool. `questionIds.length + customQuestions.length + randomFillCount`
     * must equal `questionsPerRound`.
     */
    randomFillCount: z.number().int().min(0).max(50).optional(),
    /** Per-round override; NULL means "use the session default". */
    secondsPerQuestion: secondsPerQuestionSchema.optional(),
  })
  .superRefine((r, ctx) => {
    // Deck source is still exclusive - a deck is an authoritative ordered
    // list, mixing smart-pull into it would break host expectations.
    if (r.deckId) {
      if (r.questionIds?.length || r.customQuestions?.length || r.randomFillCount !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "deckId cannot be combined with questionIds, customQuestions, or randomFillCount",
        });
      }
      return;
    }
    const pins = r.questionIds?.length ?? 0;
    const customs = r.customQuestions?.length ?? 0;
    if (r.randomFillCount !== undefined) {
      const sum = pins + customs + r.randomFillCount;
      if (sum !== r.questionsPerRound) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `pinned (${pins}) + custom (${customs}) + randomFillCount (${r.randomFillCount}) must equal questionsPerRound (${r.questionsPerRound})`,
        });
      }
    } else if (customs > 0 && customs !== r.questionsPerRound) {
      // Without explicit randomFillCount, customs must be a full round
      // (legacy behavior). Hosts who want a partial custom + smart-pull mix
      // pass randomFillCount.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `customQuestions (${customs}) must equal questionsPerRound (${r.questionsPerRound}) unless randomFillCount is set`,
      });
    }
  });

function normalizeHHmm(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

const createSchema = z
  .object({
    venueAccountId: z.string().uuid(),
    timerMode: z.enum(["auto", "manual", "hybrid"]),
    runMode: z.enum(["hosted", "autopilot"]).optional().default("autopilot"),
    secondsPerQuestion: secondsPerQuestionSchema.optional(),
    packageId: z.string().uuid().optional(),
    rounds: z.array(roundSchema).min(1).max(12),
    eventLocalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    eventLocalTime: z.string().min(1).max(8),
    eventTimezone: z.string().min(1).max(80),
    hasPrize: z.boolean(),
    listedPublic: z.boolean().optional().default(true),
    prizeDescription: z.string().max(500).optional(),
    /**
     * Hosted-mode only. If set (minutes), the session's `estimated_end_at`
     * is `eventStartsAt + hostDurationMinutes`. Ignored for autopilot (which
     * computes from question count), and overridden by
     * `hostEndsAtOverride` when both are present.
     */
    hostDurationMinutes: z.number().int().min(5).max(480).optional(),
    /**
     * Hosted-mode only. Explicit ISO end-time. Wins over
     * `hostDurationMinutes`. Must be strictly after `eventStartsAt`
     * (validated by the computation clamp).
     */
    hostEndsAtOverride: z.string().datetime().optional(),
  })
  .superRefine((data, ctx) => {
    if (!isValidIanaTimeZone(data.eventTimezone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid IANA time zone",
        path: ["eventTimezone"],
      });
    }
    const t = normalizeHHmm(data.eventLocalTime);
    if (!t) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "eventLocalTime must be HH:mm (24h)",
        path: ["eventLocalTime"],
      });
    }
    if (data.hasPrize && !(data.prizeDescription ?? "").trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "prizeDescription is required when hasPrize is true",
        path: ["prizeDescription"],
      });
    }
  });

/**
 * Resolve a round's `deckId` into a concrete list of pulled questions. Enforces
 * access rules: the deck must either be owned by the caller or have
 * `visibility === 'public'`. Returns the first `questionsPerRound` non-retired
 * questions in creation order so repeat runs of the same deck have a stable
 * experience.
 */
async function loadDeckQuestions(input: {
  deckId: string;
  ownerAccountId: string;
  roundNumber: number;
  questionsPerRound: number;
}): Promise<PulledQuestion[]> {
  const [deck] = await db
    .select()
    .from(questionDecks)
    .where(eq(questionDecks.id, input.deckId))
    .limit(1);
  if (!deck) {
    throw new Error(`Deck not found: ${input.deckId}`);
  }
  const isOwner = deck.ownerAccountId === input.ownerAccountId;
  const isPublic = deck.visibility === "public";
  if (!isOwner && !isPublic) {
    throw new Error(`Deck ${input.deckId} is not available to this host`);
  }
  const rows = await db
    .select()
    .from(questionsTable)
    .where(
      and(
        eq(questionsTable.deckId, input.deckId),
        eq(questionsTable.retired, false)
      )
    )
    .orderBy(asc(questionsTable.createdAt))
    .limit(input.questionsPerRound);
  if (rows.length < input.questionsPerRound) {
    throw new InsufficientQuestionPoolError(
      input.roundNumber,
      deck.name,
      input.questionsPerRound,
      rows.length,
      0
    );
  }
  return rows;
}

/**
 * Materialize a `customQuestions` round spec into concrete question rows stored
 * under a per-session `game_scoped` deck. We lazily create the deck the first
 * time a session needs one, so games that never use custom authoring don't
 * pollute the decks table.
 */
async function materializeCustomQuestions(input: {
  ownerAccountId: string;
  sessionLabel: string;
  customQuestions: z.infer<typeof customQuestionSchema>[];
  defaultCategory: string;
  /** Caller-supplied; `null` means "create one lazily and cache". */
  gameScopedDeckIdRef: { current: string | null };
}): Promise<PulledQuestion[]> {
  if (input.customQuestions.length === 0) return [];

  if (!input.gameScopedDeckIdRef.current) {
    const slugBase = slugifyDeckName(`game-${input.sessionLabel}-${Date.now()}`);
    const [deck] = await db
      .insert(questionDecks)
      .values({
        ownerAccountId: input.ownerAccountId,
        name: `Custom for session ${input.sessionLabel}`,
        slug: slugBase,
        description: "Auto-created hidden deck for inline custom questions in a single game.",
        visibility: "game_scoped",
      })
      .returning();
    if (!deck) throw new Error("Failed to create per-game deck");
    input.gameScopedDeckIdRef.current = deck.id;
  }

  const deckId = input.gameScopedDeckIdRef.current;
  const inserted: PulledQuestion[] = [];
  for (const q of input.customQuestions) {
    const [row] = await db
      .insert(questionsTable)
      .values({
        body: q.body,
        correctAnswer: q.correctAnswer,
        wrongAnswers: q.wrongAnswers,
        category: input.defaultCategory,
        subcategory: "Custom",
        difficulty: q.difficulty,
        vetted: true,
        retired: false,
        deckId,
        authorAccountId: input.ownerAccountId,
      })
      .returning();
    if (!row) throw new Error("Failed to store custom question");
    inserted.push(row);
  }
  return inserted;
}

async function buildRoundQuestions(input: {
  venueAccountId: string;
  roundNumber: number;
  category: string;
  questionsPerRound: number;
  questionIds: string[] | undefined;
  randomFillCount?: number | undefined;
  excludeQuestionIds: string[];
}): Promise<PulledQuestion[]> {
  const want = input.questionsPerRound;
  const pinned = input.questionIds?.length
    ? await getVettedQuestionsByOrderedIds(input.questionIds.slice(0, want), {
        expectedCategory: input.category,
      })
    : [];
  const exclude = [...input.excludeQuestionIds, ...pinned.map((q) => q.id)];
  const need =
    input.randomFillCount !== undefined ? input.randomFillCount : Math.max(0, want - pinned.length);
  if (need <= 0) {
    return pinned.slice(0, want);
  }

  const available = await countSmartPullEligible({
    venueAccountId: input.venueAccountId,
    category: input.category,
    excludeQuestionIds: exclude,
  });
  if (available < need) {
    throw new InsufficientQuestionPoolError(
      input.roundNumber,
      input.category,
      need,
      available,
      pinned.length
    );
  }

  const pulled = await smartPullQuestions({
    venueAccountId: input.venueAccountId,
    roundNumber: input.roundNumber,
    category: input.category,
    count: need,
    excludeQuestionIds: exclude,
  });
  if (pinned.length + pulled.length < want) {
    throw new Error(
      `Not enough vetted questions for round ${input.roundNumber} (${input.category}) after pinned picks`
    );
  }
  return [...pinned, ...pulled].slice(0, want);
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await getAccountByClerkUserId(userId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 400 });
  }
  if (account.accountType === "player") {
    return NextResponse.json({ error: "Players cannot create sessions" }, { status: 403 });
  }
  if (!hasEffectiveOrganizerSubscription(account)) {
    return NextResponse.json({ error: "Subscription required" }, { status: 402 });
  }

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;
  const eventLocalTimeNorm = normalizeHHmm(body.eventLocalTime);
  if (!eventLocalTimeNorm) {
    return NextResponse.json({ error: "Invalid eventLocalTime" }, { status: 400 });
  }
  const eventStartsAt = wallClockToUtcDate(body.eventLocalDate, eventLocalTimeNorm, body.eventTimezone.trim());

  if (body.timerMode !== "manual" && !body.secondsPerQuestion) {
    return NextResponse.json({ error: "secondsPerQuestion required for auto/hybrid" }, { status: 400 });
  }

  try {
    await assertHostCanUseVenue(account, body.venueAccountId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 });
  }

  let packageQuestionIds: string[] = [];
  if (body.packageId) {
    const items = await db
      .select({ questionId: questionPackageItems.questionId })
      .from(questionPackageItems)
      .where(eq(questionPackageItems.packageId, body.packageId))
      .orderBy(asc(questionPackageItems.sortOrder));
    packageQuestionIds = items.map((i) => i.questionId);
    if (packageQuestionIds.length === 0) {
      return NextResponse.json({ error: "Package is empty" }, { status: 400 });
    }
  }

  const planned: Array<{
    roundNumber: number;
    category: string;
    questionsPerRound: number;
    secondsPerQuestion: number | null;
    questions: PulledQuestion[];
  }> = [];

  let pkgCursor = 0;
  const sessionLabel = nanoid(6);
  const gameScopedDeckIdRef: { current: string | null } = { current: null };
  try {
    for (const r of body.rounds) {
      const exclude = planned.flatMap((p) => p.questions.map((q) => q.id));
      let questions: PulledQuestion[];
      if (r.deckId) {
        // Deck-sourced rounds ignore smart pull / package cursor: the deck is
        // the authoritative list. We still pass through the category label
        // chosen in the UI so the rounds table stays readable.
        questions = await loadDeckQuestions({
          deckId: r.deckId,
          ownerAccountId: account.id,
          roundNumber: r.roundNumber,
          questionsPerRound: r.questionsPerRound,
        });
      } else if (r.customQuestions?.length) {
        // Custom questions may be a partial list; the remainder is pulled
        // from the vetted pool for the round's category when `randomFillCount`
        // is set. The sum is already validated by `roundSchema.superRefine`,
        // but we guard again with a friendly error.
        const fillCount = r.randomFillCount ?? 0;
        if (r.customQuestions.length + fillCount !== r.questionsPerRound) {
          return NextResponse.json(
            {
              error: `Round ${r.roundNumber}: custom (${r.customQuestions.length}) + smart-pull fill (${fillCount}) must equal questionsPerRound (${r.questionsPerRound}).`,
            },
            { status: 400 }
          );
        }
        const customs = await materializeCustomQuestions({
          ownerAccountId: account.id,
          sessionLabel,
          customQuestions: r.customQuestions,
          defaultCategory: r.category,
          gameScopedDeckIdRef,
        });
        if (fillCount > 0) {
          // Excludes both the session-level accumulator and the custom
          // questions we just created so smart-pull can't re-pick them.
          const fills = await buildRoundQuestions({
            venueAccountId: body.venueAccountId,
            roundNumber: r.roundNumber,
            category: r.category,
            questionsPerRound: fillCount,
            questionIds: undefined,
            randomFillCount: fillCount,
            excludeQuestionIds: [...exclude, ...customs.map((q) => q.id)],
          });
          questions = [...customs, ...fills];
        } else {
          questions = customs;
        }
      } else {
        let roundQuestionIds = r.questionIds;
        if (!roundQuestionIds?.length && packageQuestionIds.length) {
          const take = Math.min(r.questionsPerRound, packageQuestionIds.length - pkgCursor);
          if (take > 0) {
            roundQuestionIds = packageQuestionIds.slice(pkgCursor, pkgCursor + take);
            pkgCursor += take;
          }
        }
        questions = await buildRoundQuestions({
          venueAccountId: body.venueAccountId,
          roundNumber: r.roundNumber,
          category: r.category,
          questionsPerRound: r.questionsPerRound,
          questionIds: roundQuestionIds,
          randomFillCount: r.randomFillCount,
          excludeQuestionIds: exclude,
        });
      }
      planned.push({
        roundNumber: r.roundNumber,
        category: r.category,
        questionsPerRound: r.questionsPerRound,
        secondsPerQuestion: r.secondsPerQuestion ?? null,
        questions,
      });
    }
  } catch (e) {
    if (e instanceof InsufficientQuestionPoolError) {
      return NextResponse.json(
        {
          error: e.message,
          code: e.code,
          roundNumber: e.roundNumber,
          category: e.category,
          needed: e.needed,
          available: e.available,
          pinnedCount: e.pinnedCount,
        },
        { status: 400 }
      );
    }
    if (
      e instanceof Error &&
      (e.message.startsWith("Question not found or not vetted") ||
        e.message.includes("expects") ||
        e.message.startsWith("Deck not found") ||
        e.message.includes("is not available to this host"))
    ) {
      return NextResponse.json({ error: e.message, code: "INVALID_QUESTION_ID" }, { status: 400 });
    }
    throw e;
  }

  const joinCode = `pending_${nanoid(18)}`;

  const totalQuestionCount = planned.reduce((sum, p) => sum + p.questions.length, 0);
  const estimatedEndAt = computeEstimatedEndAt({
    eventStartsAt,
    questionCount: totalQuestionCount,
    secondsPerQuestion: body.secondsPerQuestion ?? null,
    runMode: body.runMode,
    hostDurationMinutes: body.hostDurationMinutes ?? null,
    hostOverrideEndsAt: body.hostEndsAtOverride ? new Date(body.hostEndsAtOverride) : null,
  });

  const sessionId = await db.transaction(async (tx) => {
    const [session] = await tx
      .insert(sessions)
      .values({
        hostAccountId: account.id,
        venueAccountId: body.venueAccountId,
        status: "pending",
        timerMode: body.timerMode,
        runMode: body.runMode,
        secondsPerQuestion: body.secondsPerQuestion ?? null,
        joinCode,
        eventStartsAt,
        eventTimezone: body.eventTimezone.trim(),
        estimatedEndAt,
        hasPrize: body.hasPrize,
        prizeDescription: body.hasPrize ? (body.prizeDescription ?? "").trim() : null,
        listedPublic: body.listedPublic ?? true,
      })
      .returning({ id: sessions.id });

    if (!session) {
      throw new Error("Failed to create session");
    }

    for (const plan of planned) {
      const [round] = await tx
        .insert(rounds)
        .values({
          sessionId: session.id,
          roundNumber: plan.roundNumber,
          category: plan.category,
          secondsPerQuestion: plan.secondsPerQuestion,
        })
        .returning({ id: rounds.id });

      if (!round) {
        throw new Error("Failed to create round");
      }

      let order = 1;
      for (const q of plan.questions) {
        await tx.insert(sessionQuestions).values({
          sessionId: session.id,
          roundId: round.id,
          questionId: q.id,
          questionOrder: order++,
          status: "pending",
        });
      }
    }

    return session.id;
  });

  return NextResponse.json({ sessionId });
}
