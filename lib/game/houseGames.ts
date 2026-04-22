import { and, asc, desc, eq, gte, inArray, lte, notInArray, or, sql } from "drizzle-orm";
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

/**
 * Accepts the env override as either:
 *   - an `accounts.id` UUID (what the schema actually stores), OR
 *   - a Clerk user id (`user_...`) — looked up via `accounts.clerk_user_id`.
 *
 * The second form exists because it's a real easy footgun: `user_...` ids are
 * what you see in the Clerk dashboard and elsewhere in the app's own env
 * (e.g. `SITE_ADMIN_CLERK_USER_IDS`), so dropping the same value into
 * `TRIVIA_BOX_HOUSE_ACCOUNT_ID` feels natural — but then every session
 * insert blows up with "invalid input syntax for type uuid". Auto-resolving
 * the Clerk form into the corresponding account UUID keeps the cron working
 * regardless of which form the operator used.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveHouseAccountId(): Promise<string | null> {
  const fromEnv = process.env.TRIVIA_BOX_HOUSE_ACCOUNT_ID?.trim();
  if (fromEnv) {
    if (UUID_RE.test(fromEnv)) return fromEnv;
    if (fromEnv.startsWith("user_")) {
      const rows = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.clerkUserId, fromEnv))
        .limit(1);
      if (rows[0]) return rows[0].id;
      // Fall through — env pointed at a Clerk id that doesn't have an
      // `accounts` row yet, so we can still land on the site_admin fallback
      // below instead of hard-failing.
    }
  }

  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.accountType, "site_admin"))
    .orderBy(asc(accounts.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Return the soonest future house game, if one is scheduled. Powers the
 * post-game "Next house game starts in X min" chip inside `FinalStandings`
 * and the `/play` hub when we want to nudge players straight into the
 * next round. Returns `null` when no house account is configured or no
 * pending house game exists.
 */
export async function getNextUpcomingHouseGame(now = new Date()): Promise<{
  sessionId: string;
  joinCode: string;
  eventStartsAt: Date;
  theme: string | null;
} | null> {
  const houseAccountId = await resolveHouseAccountId();
  if (!houseAccountId) return null;
  const rows = await db
    .select({
      id: sessions.id,
      joinCode: sessions.joinCode,
      eventStartsAt: sessions.eventStartsAt,
      theme: sessions.theme,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.houseGame, true),
        eq(sessions.venueAccountId, houseAccountId),
        eq(sessions.status, "pending"),
        gte(sessions.eventStartsAt, now)
      )
    )
    .orderBy(asc(sessions.eventStartsAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    sessionId: row.id,
    joinCode: row.joinCode,
    eventStartsAt: row.eventStartsAt,
    theme: row.theme ?? null,
  };
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
 * sufficient vetted questions — caller falls back to an untitled mixed-bag
 * pull rather than skipping the house slot entirely.
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
 * Fallback pull used when no single subcategory has enough vetted questions
 * to seed a themed house game. Grabs `count` random vetted/non-retired
 * questions across every category so the scheduler can still produce a
 * (untitled) house session instead of going dark on `/play`. Caller splits
 * the flat list into the usual round-sized chunks.
 */
async function pullMixedVettedQuestions(
  count: number,
  excludeIds: string[]
): Promise<
  Array<{ id: string; category: string; subcategory: string }>
> {
  const rows = await db
    .select({
      id: questions.id,
      category: questions.category,
      subcategory: questions.subcategory,
    })
    .from(questions)
    .where(
      and(
        eq(questions.vetted, true),
        eq(questions.retired, false),
        excludeIds.length ? notInArray(questions.id, excludeIds) : undefined
      )
    )
    .orderBy(sql`random()`)
    .limit(count);
  return rows;
}

/** Shape of one round's question plan, used by both themed and mixed paths. */
type HouseRoundPlan = {
  category: string;
  questions: { id: string }[];
};

/**
 * Build round plans for a themed house game — every round pulls from the
 * same `(category, subcategory)` tuple so the session stays on-topic.
 * Returns an empty array when `smartPullQuestions` can't produce a single
 * round; caller treats that as a signal to fall back to mixed bag.
 */
async function buildThemedRoundPlans(
  houseAccountId: string,
  theme: { label: string; category: string }
): Promise<HouseRoundPlan[]> {
  const chosen = new Set<string>();
  const plans: HouseRoundPlan[] = [];
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
    plans.push({ category: theme.category, questions: picked });
  }
  return plans;
}

/**
 * Build round plans for the mixed-bag fallback: one big `random()`-ordered
 * pull across every vetted subcategory, chunked into fixed-size rounds.
 * Each round's `category` label is derived from the dominant category
 * within that chunk so the existing UI (round headers, per-round chips)
 * has something meaningful to show — the session itself stays themed-less
 * (`sessions.theme = null`).
 */
async function buildMixedRoundPlans(): Promise<HouseRoundPlan[]> {
  const total = HOUSE_ROUND_COUNT * HOUSE_QUESTIONS_PER_ROUND;
  const picks = await pullMixedVettedQuestions(total, []);
  if (picks.length === 0) return [];

  const plans: HouseRoundPlan[] = [];
  for (let r = 0; r < HOUSE_ROUND_COUNT; r++) {
    const chunk = picks.slice(
      r * HOUSE_QUESTIONS_PER_ROUND,
      (r + 1) * HOUSE_QUESTIONS_PER_ROUND
    );
    if (chunk.length === 0) continue;
    const counts = new Map<string, number>();
    for (const q of chunk) counts.set(q.category, (counts.get(q.category) ?? 0) + 1);
    const dominantCategory =
      [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Mixed";
    plans.push({
      category: dominantCategory,
      questions: chunk.map((q) => ({ id: q.id })),
    });
  }
  return plans;
}

/**
 * Create a single house game landing at the next boundary from `now`
 * (default grid is :00 / :30 UTC). Prefers a themed session (every round
 * pulled from the same subcategory) when at least one subcategory has
 * enough vetted questions; otherwise falls back to a mixed-bag untitled
 * session so the `/play` hub is never empty while a fresh catalog is
 * still filling up. Throws only when no platform account is available or
 * the vetted bank is completely empty.
 */
export async function createHouseSession(
  now: Date,
  options: { eventStartsAt?: Date } = {}
): Promise<{
  sessionId: string;
  eventStartsAt: Date;
  theme: string | null;
  category: string;
  mode: "themed" | "mixed";
}> {
  const houseAccountId = await resolveHouseAccountId();
  if (!houseAccountId) {
    throw new Error(
      "No TRIVIA_BOX_HOUSE_ACCOUNT_ID configured and no site_admin account found"
    );
  }

  // The cron always lands on the next :00/:30 boundary, but the admin UI
  // can pre-schedule a house game at an explicit moment (e.g. 8pm Friday
  // for a feature night). We still snap to whole seconds so the autopilot
  // launcher's `<= now()` check isn't racing sub-second drift.
  let eventStartsAt: Date;
  if (options.eventStartsAt) {
    eventStartsAt = new Date(options.eventStartsAt);
    eventStartsAt.setUTCMilliseconds(0);
    if (Number.isNaN(eventStartsAt.getTime())) {
      throw new Error("Invalid eventStartsAt");
    }
    if (eventStartsAt.getTime() <= now.getTime()) {
      throw new Error("eventStartsAt must be in the future");
    }
  } else {
    eventStartsAt = nextBoundaryMinutes(now, HOUSE_INTERVAL_MIN);
  }

  const theme = await pickHouseTheme();
  let mode: "themed" | "mixed" = "themed";
  let roundPlans: HouseRoundPlan[] = theme
    ? await buildThemedRoundPlans(houseAccountId, theme)
    : [];

  if (roundPlans.length === 0) {
    mode = "mixed";
    roundPlans = await buildMixedRoundPlans();
  }

  if (roundPlans.length === 0) {
    throw new Error(
      "No vetted questions available to seed a house game (themed or mixed)"
    );
  }

  const storedTheme = mode === "themed" ? theme!.label : null;
  const primaryCategory =
    mode === "themed" ? theme!.category : roundPlans[0]!.category;

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
        theme: storedTheme,
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

  return {
    sessionId,
    eventStartsAt,
    theme: storedTheme,
    category: primaryCategory,
    mode,
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
      theme: string | null;
      category: string;
      mode: "themed" | "mixed";
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

/**
 * List house games for the admin panel. Returns upcoming (pending / active
 * / paused, start time in the near past or future) and recent completed
 * / cancelled rows — split by status so the UI can render two sections.
 * Kept here rather than in a route handler because the filter logic and
 * the `houseGame = true` invariant belong next to the other house-game
 * queries.
 */
export async function listHouseGames(
  now: Date,
  limit = 20
): Promise<{
  upcoming: Array<{
    id: string;
    joinCode: string;
    status: string;
    eventStartsAt: Date;
    theme: string | null;
  }>;
  recent: Array<{
    id: string;
    joinCode: string;
    status: string;
    eventStartsAt: Date;
    estimatedEndAt: Date | null;
    theme: string | null;
  }>;
}> {
  // Anything whose start time is still within the last hour and flagged
  // active/pending/paused counts as "current" — mirrors `hasUpcomingHouseGame`.
  const recentWindow = new Date(now.getTime() - 60 * 60 * 1000);

  const upcomingRows = await db
    .select({
      id: sessions.id,
      joinCode: sessions.joinCode,
      status: sessions.status,
      eventStartsAt: sessions.eventStartsAt,
      theme: sessions.theme,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.houseGame, true),
        inArray(sessions.status, ["pending", "active", "paused"]),
        gte(sessions.eventStartsAt, recentWindow)
      )
    )
    .orderBy(asc(sessions.eventStartsAt))
    .limit(limit);

  const recentRows = await db
    .select({
      id: sessions.id,
      joinCode: sessions.joinCode,
      status: sessions.status,
      eventStartsAt: sessions.eventStartsAt,
      estimatedEndAt: sessions.estimatedEndAt,
      theme: sessions.theme,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.houseGame, true),
        inArray(sessions.status, ["completed", "cancelled"]),
        // Scoped to the last 7 days so the admin view stays focused. Older
        // history is still accessible via the recap/session URLs.
        gte(
          sessions.eventStartsAt,
          new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        ),
        lte(sessions.eventStartsAt, now)
      )
    )
    .orderBy(desc(sessions.eventStartsAt))
    .limit(limit);

  return { upcoming: upcomingRows, recent: recentRows };
}

/**
 * Cancel a pending house game. Sets `status = cancelled` so the
 * auto-launch cron stops picking it up, and clears the player-facing
 * "Next house game in X min" chip. Returns `false` if the session isn't
 * a pending house game (already started, wrong id, or not flagged).
 */
export async function cancelHouseGame(sessionId: string): Promise<boolean> {
  const rows = await db
    .select({
      id: sessions.id,
      houseGame: sessions.houseGame,
      status: sessions.status,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const row = rows[0];
  if (!row || !row.houseGame) return false;
  if (row.status !== "pending") return false;
  await db
    .update(sessions)
    .set({ status: "cancelled" })
    .where(eq(sessions.id, sessionId));
  return true;
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

