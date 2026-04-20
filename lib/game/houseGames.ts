import { and, asc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { db } from "@/lib/db/client";
import {
  accounts,
  questions,
  rounds,
  sessionQuestions,
  sessions,
} from "@/lib/db/schema";
import { smartPullQuestions } from "@/lib/game/questionPull";

/**
 * Always-on "house" games.
 *
 * The platform runs a free-to-play hosted game every 30 minutes so a player
 * landing on `/play` always has something waiting for them. House games:
 *
 *  - Use a dedicated platform account as both host and venue so the venue
 *    history / analytics tables keep working unchanged. The account id is
 *    read from `TRIVIA_BOX_HOUSE_ACCOUNT_ID`; if unset we fall back to the
 *    first `site_admin` account (useful locally). If neither exists the
 *    cron is a no-op and logs.
 *  - Always run in autopilot mode with 3 rounds of 5 questions each.
 *  - Are *topic themed*: every round pulls from a single vetted subcategory
 *    ("90s movies", "NBA finals", …) so the whole session feels like a
 *    mini-trivia night, not a random firehose. The chosen label is stored
 *    on `sessions.theme` so the UI can render a pill.
 *  - Are created ~10 minutes before `eventStartsAt` so players see them
 *    listed on the Play hub; the existing autopilot launcher cron picks
 *    them up at the scheduled time.
 *  - Never require a host to click "Start".
 */

const HOUSE_ROUND_COUNT = 3;
const HOUSE_QUESTIONS_PER_ROUND = 5;
const HOUSE_SECONDS_PER_QUESTION = 15;
/** Grid the cron schedules house games on. `30` → games at :00 and :30. */
const HOUSE_INTERVAL_MIN = 30;
const HOUSE_MIN_QUESTIONS_PER_THEME = HOUSE_ROUND_COUNT * HOUSE_QUESTIONS_PER_ROUND;

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

/**
 * Pick a single vetted subcategory with enough questions to cover every
 * round of the house game. Returns the theme label (subcategory) along with
 * its parent category so `smartPullQuestions` can still apply its category
 * filter and round-appropriate bias. Returns `null` if no subcategory has
 * sufficient vetted questions — caller treats that as a skippable no-op.
 */
async function pickHouseTheme(): Promise<{
  label: string;
  category: string;
} | null> {
  const rows = await db
    .select({
      subcategory: questions.subcategory,
      category: questions.category,
      n: sql<number>`count(*)`,
    })
    .from(questions)
    .where(and(eq(questions.vetted, true), eq(questions.retired, false)))
    .groupBy(questions.subcategory, questions.category)
    .having(sql`count(*) >= ${HOUSE_MIN_QUESTIONS_PER_THEME}`);

  if (rows.length === 0) return null;

  const pick = rows[Math.floor(Math.random() * rows.length)]!;
  return { label: pick.subcategory, category: pick.category };
}

/**
 * Create a single house game landing at the next boundary from `now`
 * (default grid is :00 / :30 UTC). Returns the new session id + chosen
 * theme. Throws if we can't find a platform account to own the game.
 */
export async function createHouseSession(now: Date): Promise<{
  sessionId: string;
  eventStartsAt: Date;
  theme: string;
  category: string;
}> {
  const houseAccountId = await resolveHouseAccountId();
  if (!houseAccountId) {
    throw new Error(
      "No TRIVIA_BOX_HOUSE_ACCOUNT_ID configured and no site_admin account found"
    );
  }

  const eventStartsAt = nextBoundaryMinutes(now, HOUSE_INTERVAL_MIN);
  const theme = await pickHouseTheme();
  if (!theme) {
    throw new Error(
      `No vetted subcategory has ≥${HOUSE_MIN_QUESTIONS_PER_THEME} questions to seed a themed house game`
    );
  }

  // Every round pulls from the same (category, subcategory) tuple so the
  // session stays on-topic end-to-end.
  const chosen = new Set<string>();
  const roundPlans: Array<{ questions: { id: string }[] }> = [];
  for (let i = 0; i < HOUSE_ROUND_COUNT; i++) {
    const picked = await smartPullQuestions({
      venueAccountId: houseAccountId,
      roundNumber: i + 1,
      category: theme.category,
      subcategory: theme.label,
      count: HOUSE_QUESTIONS_PER_ROUND,
      excludeQuestionIds: [...chosen],
    });
    for (const q of picked) chosen.add(q.id);
    if (picked.length === 0) continue;
    roundPlans.push({ questions: picked });
  }

  if (roundPlans.length === 0) {
    throw new Error("Could not pull any vetted questions for themed house game rounds");
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
        theme: theme.label,
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
          category: theme.category,
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

  return {
    sessionId,
    eventStartsAt,
    theme: theme.label,
    category: theme.category,
  };
}

/**
 * Entry point called by the cron. Idempotent — if a house game is already
 * queued for the next 30 minutes, does nothing.
 */
export async function scheduleNextHouseGame(now: Date): Promise<
  | { created: false; reason: string }
  | {
      created: true;
      sessionId: string;
      eventStartsAt: Date;
      theme: string;
      category: string;
    }
> {
  const houseAccountId = await resolveHouseAccountId();
  if (!houseAccountId) {
    return { created: false, reason: "no_house_account" };
  }
  const alreadyPlanned = await hasUpcomingHouseGame(
    houseAccountId,
    now,
    HOUSE_INTERVAL_MIN
  );
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

