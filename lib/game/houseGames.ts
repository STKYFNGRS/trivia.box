import { and, asc, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { db } from "@/lib/db/client";
import {
  accounts,
  questionCategories,
  questions,
  rounds,
  sessionQuestions,
  sessions,
} from "@/lib/db/schema";
import { smartPullQuestions } from "@/lib/game/questionPull";

/**
 * Always-on "house" games.
 *
 * The platform runs a free-to-play hosted game every 15 minutes so a player
 * landing on `/play` always has something waiting for them. House games:
 *
 *  - Use a dedicated platform account as both host and venue so the venue
 *    history / analytics tables keep working unchanged. The account id is
 *    read from `TRIVIA_BOX_HOUSE_ACCOUNT_ID`; if unset we fall back to the
 *    first `site_admin` account (useful locally). If neither exists the
 *    cron is a no-op and logs.
 *  - Always run in autopilot mode with 3 rounds of 5 questions each.
 *  - Are created ~10 minutes before `eventStartsAt` so players see them
 *    listed on the Play hub; the existing autopilot launcher cron picks
 *    them up at the scheduled time.
 *  - Never require a host to click "Start".
 */

const HOUSE_ROUND_COUNT = 3;
const HOUSE_QUESTIONS_PER_ROUND = 5;
const HOUSE_SECONDS_PER_QUESTION = 15;
/** Grid the cron schedules house games on. `15` → games at :00, :15, :30, :45. */
const HOUSE_INTERVAL_MIN = 15;

const placeholder = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 18);

/** Minutes until the next `:00 / :15 / :30 / :45` boundary from `from`. */
function nextBoundaryMinutes(from: Date, intervalMin: number): Date {
  const d = new Date(from);
  d.setUTCSeconds(0, 0);
  const m = d.getUTCMinutes();
  const add = intervalMin - (m % intervalMin);
  d.setUTCMinutes(m + (add === 0 ? intervalMin : add));
  return d;
}

export async function resolveHouseAccountId(): Promise<string | null> {
  const fromEnv = process.env.TRIVIA_BOX_HOUSE_ACCOUNT_ID?.trim();
  if (fromEnv) return fromEnv;

  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.accountType, "site_admin"))
    .orderBy(asc(accounts.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Is there already a pending or active house game landing in the next
 * `lookaheadMin` minutes? Caller uses this to skip scheduling.
 */
export async function hasUpcomingHouseGame(
  houseAccountId: string,
  now: Date,
  lookaheadMin: number
): Promise<boolean> {
  void lookaheadMin; // kept in signature for readability; any upcoming game covers us.
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.houseGame, true),
        eq(sessions.venueAccountId, houseAccountId),
        or(eq(sessions.status, "pending"), eq(sessions.status, "active")),
        gte(sessions.eventStartsAt, new Date(now.getTime() - 60 * 60 * 1000))
      )
    )
    .limit(1);
  return rows.length > 0;
}

async function pickHouseCategories(): Promise<string[]> {
  // Prefer taxonomy ordering so house games cover the "showcase" categories
  // first, but fall back to raw `questions.category` if taxonomy is empty.
  const cats = await db
    .select({ label: questionCategories.label })
    .from(questionCategories)
    .where(eq(questionCategories.active, true))
    .orderBy(asc(questionCategories.sortOrder), asc(questionCategories.label));

  const labels = cats.length
    ? cats.map((c) => c.label)
    : (
        await db
          .select({ label: questions.category })
          .from(questions)
          .where(and(eq(questions.vetted, true), eq(questions.retired, false)))
          .groupBy(questions.category)
          .orderBy(desc(sql`count(*)`))
      ).map((r) => r.label);

  if (labels.length === 0) return [];

  // Random subset of 3 (or whatever we have), preferring labels with the most
  // vetted questions.
  const shuffled = [...labels].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, HOUSE_ROUND_COUNT);
}

/**
 * Create a single house game landing at the next 15-minute boundary from
 * `now`. Returns the new session id + pending join code (the real join code
 * is issued at launch time). Throws if we can't find a platform account to
 * own the game.
 */
export async function createHouseSession(now: Date): Promise<{
  sessionId: string;
  eventStartsAt: Date;
  categories: string[];
}> {
  const houseAccountId = await resolveHouseAccountId();
  if (!houseAccountId) {
    throw new Error(
      "No TRIVIA_BOX_HOUSE_ACCOUNT_ID configured and no site_admin account found"
    );
  }

  const eventStartsAt = nextBoundaryMinutes(now, HOUSE_INTERVAL_MIN);
  const categories = await pickHouseCategories();
  if (categories.length === 0) {
    throw new Error("No vetted questions available to seed a house game");
  }

  const roundPlans: Array<{ category: string; questions: { id: string }[] }> = [];
  const chosen = new Set<string>();
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i]!;
    const picked = await smartPullQuestions({
      venueAccountId: houseAccountId,
      roundNumber: i + 1,
      category: cat,
      count: HOUSE_QUESTIONS_PER_ROUND,
      excludeQuestionIds: [...chosen],
    });
    for (const q of picked) chosen.add(q.id);
    if (picked.length < HOUSE_QUESTIONS_PER_ROUND) {
      // Not enough to keep the round meaningful; skip and hope the other
      // rounds are healthy. We still create the session so the cron doesn't
      // get stuck retrying.
      if (picked.length === 0) continue;
    }
    roundPlans.push({ category: cat, questions: picked });
  }
  if (roundPlans.length === 0) {
    throw new Error("Could not pull any vetted questions for house game rounds");
  }

  const pendingCode = `pending_${placeholder()}`;

  const sessionId = await db.transaction(async (tx) => {
    const [session] = await tx
      .insert(sessions)
      .values({
        hostAccountId: houseAccountId,
        venueAccountId: houseAccountId,
        status: "pending",
        timerMode: "auto",
        runMode: "autopilot",
        secondsPerQuestion: HOUSE_SECONDS_PER_QUESTION,
        joinCode: pendingCode,
        eventStartsAt,
        eventTimezone: "UTC",
        hasPrize: false,
        prizeDescription: null,
        listedPublic: true,
        houseGame: true,
      })
      .returning({ id: sessions.id });

    if (!session) throw new Error("Failed to create house session");

    for (let i = 0; i < roundPlans.length; i++) {
      const plan = roundPlans[i]!;
      const [round] = await tx
        .insert(rounds)
        .values({
          sessionId: session.id,
          roundNumber: i + 1,
          category: plan.category,
          secondsPerQuestion: HOUSE_SECONDS_PER_QUESTION,
        })
        .returning({ id: rounds.id });
      if (!round) throw new Error("Failed to create house round");

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

  return { sessionId, eventStartsAt, categories: roundPlans.map((p) => p.category) };
}

/**
 * Entry point called by the cron. Idempotent — if a house game is already
 * queued for the next 30 minutes, does nothing.
 */
export async function scheduleNextHouseGame(now: Date): Promise<
  | { created: false; reason: string }
  | { created: true; sessionId: string; eventStartsAt: Date; categories: string[] }
> {
  const houseAccountId = await resolveHouseAccountId();
  if (!houseAccountId) {
    return { created: false, reason: "no_house_account" };
  }
  const alreadyPlanned = await hasUpcomingHouseGame(houseAccountId, now, 30);
  if (alreadyPlanned) {
    return { created: false, reason: "already_scheduled" };
  }
  const result = await createHouseSession(now);
  return { created: true, ...result };
}

/** Public lookup: the next upcoming or currently-live house game, if any. */
export async function getNextHouseGame(now: Date) {
  const rows = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      joinCode: sessions.joinCode,
      eventStartsAt: sessions.eventStartsAt,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.houseGame, true),
        inArray(sessions.status, ["pending", "active"]),
        gte(sessions.eventStartsAt, new Date(now.getTime() - 60 * 60 * 1000))
      )
    )
    .orderBy(asc(sessions.eventStartsAt))
    .limit(1);
  return rows[0] ?? null;
}

