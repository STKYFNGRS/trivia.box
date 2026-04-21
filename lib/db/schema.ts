import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Postgres `bytea` column. Drizzle doesn't ship this natively, so we use
 *  customType — values go in/out as Buffer-compatible Uint8Arrays. */
const bytea = customType<{ data: Uint8Array; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    accountType: text("account_type").notNull(), // 'player' | 'host' | 'site_admin' (legacy 'venue' migrated via 0005)
    name: text("name").notNull(),
    email: text("email").notNull(),
    city: text("city").notNull(),
    /**
     * @deprecated Unused in application code. Venue images now live in
     * `venue_profiles.image_bytes`. Kept in the schema so legacy rows aren't
     * dropped silently; a future `drizzle/0010_drop_accounts_logo_url.sql`
     * can remove the column once we're sure no prod data depends on it.
     */
    logoUrl: text("logo_url"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    subscriptionActive: boolean("subscription_active").notNull().default(false),
    /**
     * Creator free-tier perk window. Phase 3.3 grants this for hitting
     * badge thresholds (e.g. 3 approved decks, top-rated deck); host-gate
     * checks read `subscriptionActive || creatorFreeUntil > now()`. Null
     * when no perk is active.
     */
    creatorFreeUntil: timestamp("creator_free_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("accounts_email_unique").on(t.email)]
);

export const venues = pgTable(
  "venues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("venues_account_id_idx").on(t.accountId)]
);

/**
 * First-class venue profile. One row per host/site_admin account. The slug is
 * globally unique and powers the public lobby URL `/v/[slug]`; `display_name`
 * is guaranteed non-empty (migration 0008 backfills it) so the host's location
 * dropdown never renders a UUID. Image is stored directly in Neon as `bytea`
 * so we don't take an external CDN dependency at this stage.
 */
export const venueProfiles = pgTable(
  "venue_profiles",
  {
    accountId: uuid("account_id")
      .primaryKey()
      .references(() => accounts.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    tagline: text("tagline"),
    description: text("description"),
    timezone: text("timezone"),
    imageMime: text("image_mime"),
    imageBytes: bytea("image_bytes"),
    imageUpdatedAt: timestamp("image_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("venue_profiles_slug_unique").on(t.slug),
    index("venue_profiles_slug_idx").on(t.slug),
  ]
);

export const hostVenueRelationships = pgTable(
  "host_venue_relationships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hostId: uuid("host_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"), // 'active' | 'past'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("host_venue_host_idx").on(t.hostId),
    index("host_venue_venue_idx").on(t.venueId),
  ]
);

/**
 * Host-authored question decks. Visibility transitions:
 *   private -> submitted -> public | rejected
 * `game_scoped` is a synthetic visibility used for the per-game hidden deck
 * created by the "Write custom questions for this game" flow.
 */
export const questionDecks = pgTable(
  "question_decks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    /** Optional cover art for marketplace listings. Raw bytes stored in Neon. */
    coverImageMime: text("cover_image_mime"),
    coverImageBytes: bytea("cover_image_bytes"),
    coverUpdatedAt: timestamp("cover_updated_at", { withTimezone: true }),
    /** Free-form discovery tags (e.g. "80s", "geography", "hard"). */
    tags: text("tags").array(),
    /** Site-admin curated "front-page" badge. */
    featured: boolean("featured").notNull().default(false),
    defaultCategory: text("default_category"),
    defaultSubcategory: text("default_subcategory"),
    visibility: text("visibility").notNull().default("private"),
    reviewedByAccountId: uuid("reviewed_by_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("question_decks_owner_slug_unique").on(t.ownerAccountId, t.slug),
    index("question_decks_visibility_idx").on(t.visibility),
    index("question_decks_owner_idx").on(t.ownerAccountId),
  ]
);

/** Player-submitted 1..5 ratings of public decks. Unique per (deck, player). */
export const deckRatings = pgTable(
  "deck_ratings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    deckId: uuid("deck_id")
      .notNull()
      .references(() => questionDecks.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    score: integer("score").notNull(), // 1..5 enforced in app
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("deck_ratings_deck_player_unique").on(t.deckId, t.playerId),
    index("deck_ratings_deck_idx").on(t.deckId),
  ]
);

/**
 * Materialized rollup of deck popularity / quality, refreshed on session
 * completion and on rating inserts. Kept as a separate table so the deck
 * marketplace can sort without aggregating on every page load.
 */
export const deckStats = pgTable("deck_stats", {
  deckId: uuid("deck_id")
    .primaryKey()
    .references(() => questionDecks.id, { onDelete: "cascade" }),
  timesUsed: integer("times_used").notNull().default(0),
  /** Sum of (playerCount * timesUsed) across sessions that drew from this deck. */
  totalPlayerPlays: integer("total_player_plays").notNull().default(0),
  ratingCount: integer("rating_count").notNull().default(0),
  avgRating: integer("avg_rating_x100").notNull().default(0), // rating * 100 for integer math
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Creator perks: badges awarded when a host hits thresholds like
 * "first approved deck," "3 approved decks," etc. Exposed on public
 * profiles and used to gate free-tier perks.
 */
export const creatorBadges = pgTable(
  "creator_badges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // creator | prolific_creator | top_rated_creator | featured_creator
    awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
    note: text("note"),
  },
  (t) => [
    uniqueIndex("creator_badges_account_kind_unique").on(t.accountId, t.kind),
    index("creator_badges_account_idx").on(t.accountId),
  ]
);

/**
 * Append-only ledger of creator perks granted. The primary write is
 * `free_month_organizer` (grants 30d of `creatorFreeUntil` on the
 * account). Kept append-only so we can audit why a given account has a
 * free window, and so we can extend later to waived review fees,
 * referral bonuses, etc.
 */
export const creatorPerkGrants = pgTable(
  "creator_perk_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    note: text("note"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    index("creator_perk_grants_account_idx").on(t.accountId),
    index("creator_perk_grants_kind_idx").on(t.kind),
  ]
);

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    body: text("body").notNull(),
    correctAnswer: text("correct_answer").notNull(),
    wrongAnswers: text("wrong_answers").array().notNull(), // length 3 enforced in app
    category: text("category").notNull(),
    subcategory: text("subcategory").notNull(),
    difficulty: integer("difficulty").notNull(), // 1 easy, 2 medium, 3 hard
    timeHint: integer("time_hint").notNull().default(20), // 10 | 20 | 30 seconds
    vetted: boolean("vetted").notNull().default(false),
    timesUsed: integer("times_used").notNull().default(0),
    retired: boolean("retired").notNull().default(false),
    /** Nullable for the canonical AI / site-admin-authored pool; set for deck-authored questions. */
    deckId: uuid("deck_id").references(() => questionDecks.id, { onDelete: "set null" }),
    /** Clerk-owned account that authored the question (null for legacy rows and AI drafts). */
    authorAccountId: uuid("author_account_id").references(() => accounts.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("questions_category_idx").on(t.category),
    index("questions_vetted_retired_idx").on(t.vetted, t.retired),
    index("questions_deck_idx").on(t.deckId),
  ]
);

/** Canonical taxonomy for AI generation and categorization (labels match `questions.category` / `subcategory`). */
export const questionCategories = pgTable(
  "question_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("question_categories_slug_unique").on(t.slug)]
);

export const questionSubcategories = pgTable(
  "question_subcategories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => questionCategories.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    notesForGeneration: text("notes_for_generation"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    /** Planning target for coverage heuristics (nullable). */
    targetCount: integer("target_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("question_subcategories_category_idx").on(t.categoryId),
    uniqueIndex("question_subcategories_category_slug_unique").on(t.categoryId, t.slug),
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hostAccountId: uuid("host_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    venueAccountId: uuid("venue_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"), // pending | active | completed
    timerMode: text("timer_mode").notNull().default("auto"), // auto | manual | hybrid
    runMode: text("run_mode").notNull().default("autopilot"), // hosted | autopilot
    secondsPerQuestion: integer("seconds_per_question"),
    joinCode: text("join_code").notNull(),
    eventStartsAt: timestamp("event_starts_at", { withTimezone: true }).notNull(),
    /** When non-null, session is paused: autopilot cron skips, clients show overlay. `start` clears this. */
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    eventTimezone: text("event_timezone").notNull(),
    hasPrize: boolean("has_prize").notNull().default(false),
    prizeDescription: text("prize_description"),
    /** How many top finishers earn a prize claim (1..5). NULL = legacy sessions. */
    prizeTopN: integer("prize_top_n"),
    /** Optional per-rank prize labels, 0-indexed. Falls back to `prizeDescription`. */
    prizeLabels: text("prize_labels").array(),
    /** Internal details shown on the claim page (redemption rules, expiry). */
    prizeInstructions: text("prize_instructions"),
    /** When prize claims expire after session completion. */
    prizeExpiresAt: timestamp("prize_expires_at", { withTimezone: true }),
    /**
     * Best-effort projected end time. Computed at creation from question
     * count + seconds/question (autopilot) or from a host-supplied duration
     * / end-time override (hosted). Used to auto-hide finished sessions
     * from the host dashboard list, and as a safety net for the stale
     * sweeper to close sessions a host forgot to mark complete. NULL for
     * legacy rows created before this column existed.
     */
    estimatedEndAt: timestamp("estimated_end_at", { withTimezone: true }),
    /** Free-to-play "house" session scheduled on a fixed minute grid by the cron. */
    houseGame: boolean("house_game").notNull().default(false),
    /**
     * Human-readable theme label for house games ("90s movies", "NBA finals", etc).
     * Populated from the chosen subcategory when the cron creates the session.
     * Optional for hosted sessions.
     */
    theme: text("theme"),
    listedPublic: boolean("listed_public").notNull().default(true),
    /**
     * Host-dashboard soft-hide. Stamped by the "Remove" button on the
     * Recent games list at `/dashboard/games`; NULL means still visible.
     * The session + its history tables are intentionally left intact so
     * player-facing leaderboards / XP / profiles don't forget past games.
     */
    hostHiddenAt: timestamp("host_hidden_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_join_code_unique").on(t.joinCode),
    index("sessions_house_idx").on(t.houseGame, t.eventStartsAt),
    index("sessions_estimated_end_idx").on(t.status, t.estimatedEndAt),
  ]
);

export const rounds = pgTable(
  "rounds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    roundNumber: integer("round_number").notNull(),
    category: text("category").notNull(),
    /** Per-round timer override (5..60 in steps of 5). NULL falls back to `sessions.secondsPerQuestion`. */
    secondsPerQuestion: integer("seconds_per_question"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rounds_session_idx").on(t.sessionId)]
);

export const sessionQuestions = pgTable(
  "session_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    questionOrder: integer("question_order").notNull(),
    status: text("status").notNull().default("pending"), // pending | active | locked | revealed | complete
    timeStarted: timestamp("time_started", { withTimezone: true }),
    timeLocked: timestamp("time_locked", { withTimezone: true }),
    /** Resolved timer (seconds) captured at the moment the question was started,
     *  so we can recompute points consistently even if the session timer was
     *  later changed. */
    timerSeconds: integer("timer_seconds"),
    /** Server wall-clock (Date.now()) when the host `start` action fired.
     *  Clients derive remaining = timerSeconds*1000 - (Date.now() - timerStartedAtMs). */
    timerStartedAtMs: bigint("timer_started_at_ms", { mode: "number" }),
  },
  (t) => [
    index("session_questions_session_idx").on(t.sessionId),
    index("session_questions_round_idx").on(t.roundId),
  ]
);

export const players = pgTable(
  "players",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: text("username").notNull(),
    email: text("email"),
    phone: text("phone"),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("players_username_unique").on(t.username),
    uniqueIndex("players_account_id_unique").on(t.accountId),
  ]
);

export const playerSessions = pgTable(
  "player_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    venueAccountId: uuid("venue_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    score: integer("score").notNull().default(0),
    rank: integer("rank"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("player_sessions_player_idx").on(t.playerId),
    index("player_sessions_session_idx").on(t.sessionId),
  ]
);

export const answers = pgTable(
  "answers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    sessionQuestionId: uuid("session_question_id")
      .notNull()
      .references(() => sessionQuestions.id, { onDelete: "cascade" }),
    answerGiven: text("answer_given").notNull(),
    isCorrect: boolean("is_correct").notNull(),
    timeToAnswerMs: integer("time_to_answer_ms").notNull(),
    /**
     * Server-derived elapsed time. Populated by the public answer endpoint
     * (migration 0010) and used by scoring in place of the client-supplied
     * `timeToAnswerMs`, which is now telemetry-only. Old rows remain NULL.
     */
    serverElapsedMs: integer("server_elapsed_ms"),
    /** Kahoot-style points scaled by server elapsed time. Includes any streak bonus. */
    pointsAwarded: integer("points_awarded").notNull().default(0),
    /** Streak count after this answer (0 on wrong, prev+1 on correct). */
    streakAtAnswer: integer("streak_at_answer").notNull().default(0),
    /**
     * Cheat-prevention fingerprints. All three are hashed / opaque strings -
     * the raw IP is never stored. Admins use these to cluster suspicious
     * answer patterns (e.g. 10 "correct" answers from the same ipHash in a
     * single session).
     */
    ipHash: text("ip_hash"),
    uaHash: text("ua_hash"),
    deviceId: text("device_id"),
    /**
     * Admin "this score doesn't count" marker. When set, ranks / stats
     * rollups exclude the row. Keeps history immutable while letting
     * operators cleanup cheating without deleting rows.
     */
    disqualifiedAt: timestamp("disqualified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("answers_player_idx").on(t.playerId),
    index("answers_sq_idx").on(t.sessionQuestionId),
    index("answers_ip_hash_idx").on(t.ipHash),
    // One answer per player per question: enforced at the DB level so that
    // concurrent answer submissions can never double-score.
    uniqueIndex("answers_player_session_question_uidx").on(t.playerId, t.sessionQuestionId),
  ]
);

/**
 * Denormalized rollup of lifetime player stats. Kept in sync by
 * `recordAnswer` (per-answer) and the session-completed hook (ranks / games).
 * Cheap source of truth for the player dashboard and leaderboards that don't
 * need query-time aggregation.
 */
export const playerStats = pgTable("player_stats", {
  playerId: uuid("player_id")
    .primaryKey()
    .references(() => players.id, { onDelete: "cascade" }),
  totalAnswered: integer("total_answered").notNull().default(0),
  totalCorrect: integer("total_correct").notNull().default(0),
  totalPoints: bigint("total_points", { mode: "number" }).notNull().default(0),
  /** Lifetime XP separate from points so we can tune economies independently. */
  totalXp: bigint("total_xp", { mode: "number" }).notNull().default(0),
  totalGames: integer("total_games").notNull().default(0),
  bestRank: integer("best_rank"),
  longestStreak: integer("longest_streak").notNull().default(0),
  fastestCorrectMs: integer("fastest_correct_ms"),
  lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
  /**
   * Daily challenge streak — number of consecutive UTC days the player has
   * played *today's* daily challenge. Bumped on completion via
   * `recordDailyChallengeCompletion` in `lib/game/dailyChallenge.ts`; a
   * gap of one day resets it to 1 (the day they just played).
   */
  dailyStreak: integer("daily_streak").notNull().default(0),
  longestDailyStreak: integer("longest_daily_streak").notNull().default(0),
  lastDailyPlayDate: date("last_daily_play_date", { mode: "string" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Append-only ledger of XP awards. The rollup on `player_stats.totalXp` is
 * derived; this table is the source of truth and also what powers the
 * "activity feed" on the player profile.
 */
export const playerXpEvents = pgTable(
  "player_xp_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    /** e.g. `session_complete`, `solo_complete`, `streak_bonus`, `deck_rated`. */
    kind: text("kind").notNull(),
    amount: integer("amount").notNull(),
    /** Optional refs so admins can trace an award back to a game / solo run. */
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    soloSessionId: uuid("solo_session_id").references(() => soloSessions.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("player_xp_events_player_idx").on(t.playerId, t.createdAt),
    index("player_xp_events_kind_idx").on(t.kind),
  ]
);

/**
 * Host-configured real-world prize for a game session. The host defines the
 * prize up front (e.g. "$50 tab, winner only"), and after the final
 * leaderboard is computed the session-completed hook materializes
 * `prizeClaims` rows for the eligible players.
 */
export const prizeClaims = pgTable(
  "prize_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    /** Redeemable at which venue (usually the host venue of `sessionId`). */
    venueAccountId: uuid("venue_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    finalRank: integer("final_rank").notNull(),
    prizeLabel: text("prize_label").notNull(),
    /** Free-form details (how to claim, expiry). Surfaced on the claim page. */
    prizeDetails: text("prize_details"),
    /** Short alphanumeric code the player shows at the venue to redeem. */
    claimCode: text("claim_code").notNull(),
    status: text("status").notNull().default("pending"), // pending | redeemed | expired | void
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    redeemedByAccountId: uuid("redeemed_by_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("prize_claims_code_unique").on(t.claimCode),
    index("prize_claims_player_idx").on(t.playerId),
    index("prize_claims_venue_idx").on(t.venueAccountId, t.status),
    index("prize_claims_session_idx").on(t.sessionId),
  ]
);

export const playerVenues = pgTable(
  "player_venues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    venueAccountId: uuid("venue_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    visits: integer("visits").notNull().default(1),
    firstVisit: timestamp("first_visit", { withTimezone: true }).notNull().defaultNow(),
    lastVisit: timestamp("last_visit", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("player_venues_player_venue_unique").on(t.playerId, t.venueAccountId),
  ]
);

export const questionVenueHistory = pgTable(
  "question_venue_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    venueAccountId: uuid("venue_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("qvh_question_venue_used_idx").on(t.questionId, t.venueAccountId, t.usedAt),
  ]
);

/**
 * @deprecated No runtime reads or writes — the legacy Resend venue→host invite
 * flow was retired when signup collapsed to a single player-default form.
 * Schema is retained only so existing rows in prod don't orphan; future
 * `drizzle/0010_drop_host_invites.sql` can remove the table outright.
 */
export const hostInvites = pgTable(
  "host_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    venueAccountId: uuid("venue_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("host_invites_token_unique").on(t.token)]
);

export const questionFlags = pgTable(
  "question_flags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    hostAccountId: uuid("host_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("question_flags_resolved_idx").on(t.resolvedAt)]
);

export const questionDrafts = pgTable(
  "question_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    body: text("body").notNull(),
    correctAnswer: text("correct_answer").notNull(),
    wrongAnswers: text("wrong_answers").array().notNull(),
    category: text("category").notNull(),
    subcategory: text("subcategory").notNull(),
    difficulty: integer("difficulty").notNull().default(2),
    timeHint: integer("time_hint").notNull().default(20),
    status: text("status").notNull().default("pending_review"),
    pipelineLog: text("pipeline_log"),
    duplicateScore: integer("duplicate_score"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("question_drafts_status_idx").on(t.status)]
);

export const questionGenerationJobs = pgTable(
  "question_generation_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    status: text("status").notNull().default("queued"),
    step: text("step").notNull().default("init"),
    category: text("category").notNull(),
    topicHint: text("topic_hint"),
    /** When null, runner picks subcategory by coverage gap for `category`. */
    subcategoryId: uuid("subcategory_id").references(() => questionSubcategories.id, { onDelete: "set null" }),
    draftId: uuid("draft_id").references(() => questionDrafts.id, { onDelete: "set null" }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("question_generation_jobs_status_idx").on(t.status),
    index("question_generation_jobs_subcategory_idx").on(t.subcategoryId),
  ]
);

export const achievementDefinitions = pgTable(
  "achievement_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    icon: text("icon"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("achievement_definitions_slug_unique").on(t.slug)]
);

export const playerAchievementGrants = pgTable(
  "player_achievement_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    achievementId: uuid("achievement_id")
      .notNull()
      .references(() => achievementDefinitions.id, { onDelete: "cascade" }),
    earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: text("metadata"),
  },
  (t) => [
    uniqueIndex("player_achievement_unique").on(t.playerId, t.achievementId),
    index("player_achievement_player_idx").on(t.playerId),
  ]
);

/**
 * Solo play: a single player grinds vetted questions against a clock without
 * touching the hosted-session / venue machinery. Each row is one run - when
 * a player finishes (or abandons after `SOLO_TIMEOUT_MS`), `completedAt` is
 * set and the row stops accepting answers.
 */
export const soloSessions = pgTable(
  "solo_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id").references(() => players.id, { onDelete: "cascade" }),
    /** Opaque cookie-backed id for anon play; one of `playerId` / `guestId` is set. */
    guestId: text("guest_id"),
    speed: text("speed").notNull().default("standard"), // chill | standard | blitz
    questionCount: integer("question_count").notNull().default(10),
    /** Null or empty array means "mix of everything". */
    categoryFilter: text("category_filter").array(),
    timerSeconds: integer("timer_seconds").notNull(),
    status: text("status").notNull().default("active"), // active | completed | abandoned
    totalScore: integer("total_score").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    /**
     * Set (to the UTC day) when the solo run is the player's attempt at
     * the global daily challenge, so we can enforce one-per-day and roll
     * streaks up on completion. Null for regular solo runs.
     */
    dailyChallengeDate: date("daily_challenge_date", { mode: "string" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("solo_sessions_player_idx").on(t.playerId),
    index("solo_sessions_guest_idx").on(t.guestId),
  ]
);

export const soloQuestions = pgTable(
  "solo_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    soloSessionId: uuid("solo_session_id")
      .notNull()
      .references(() => soloSessions.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    /** Server wall-clock when the question was first shown to this player. */
    shownAtMs: bigint("shown_at_ms", { mode: "number" }),
    answered: boolean("answered").notNull().default(false),
    correct: boolean("correct").notNull().default(false),
    /** Server-derived elapsed time between `shownAtMs` and answer receipt. */
    timeToAnswerMs: integer("time_to_answer_ms"),
    answerGiven: text("answer_given"),
    pointsAwarded: integer("points_awarded").notNull().default(0),
  },
  (t) => [
    index("solo_questions_session_idx").on(t.soloSessionId),
    uniqueIndex("solo_questions_session_position_unique").on(t.soloSessionId, t.position),
  ]
);

/**
 * Global "challenge of the day". Seeded once per UTC day — either by the
 * `house-games/tick` cron extension or lazily on first access to
 * `/play/daily`. `questionIds` is a small JSONB array of exactly 5
 * question UUIDs drawn from the vetted pool with a balanced difficulty
 * mix. Every player sees the same 5 questions for the day so we can
 * build a shareable daily leaderboard on top of it.
 */
export const dailyChallenges = pgTable("daily_challenges", {
  challengeDate: date("challenge_date", { mode: "string" }).primaryKey(),
  questionIds: jsonb("question_ids").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Per-account email opt-ins. One row per account; lazily upserted the
 * first time we read (dashboard) or try to send (triggers) for an
 * account, so the migration doesn't need a backfill. Defaults favour
 * "yes" for the rare-but-valuable messages (prize wins, weekly digest,
 * upcoming sessions at venues they've visited) and "no" for marketing
 * blasts, mirroring the FTC/CAN-SPAM best-practice of being clearly
 * opt-in for anything that isn't directly transactional.
 *
 * `unsubscribedAllAt`, when set, overrides every flag to `false` for
 * outgoing sends (the one-click unsubscribe link flips this bit). The
 * preferences UI can still edit individual flags, and saving any flag
 * clears `unsubscribedAllAt` so accounts that change their mind aren't
 * silently stuck at "all off".
 */
export const emailPreferences = pgTable("email_preferences", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  prizeWon: boolean("prize_won").notNull().default(true),
  weeklyDigest: boolean("weekly_digest").notNull().default(true),
  upcomingSessions: boolean("upcoming_sessions").notNull().default(true),
  marketing: boolean("marketing").notNull().default(false),
  unsubscribedAllAt: timestamp("unsubscribed_all_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Append-only ledger of transactional emails attempted. The composite
 * unique (`kind`, `dedupe_key`) is how `sendMail` guarantees idempotency:
 * the caller supplies a stable dedupe key (e.g. the prize-claim id) and
 * the `ON CONFLICT DO NOTHING` insert wins the race so a cron retry can
 * never double-send. `status` transitions queued -> sent|failed when the
 * Resend call returns. We intentionally don't store the full HTML — ops
 * can replay via the dedupe key + template if truly needed.
 */
export const sentEmails = pgTable(
  "sent_emails",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    toEmail: text("to_email").notNull(),
    kind: text("kind").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    subject: text("subject").notNull(),
    providerMessageId: text("provider_message_id"),
    status: text("status").notNull().default("queued"), // queued | sent | failed | skipped
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("sent_emails_kind_dedupe_unique").on(t.kind, t.dedupeKey),
    index("sent_emails_account_idx").on(t.accountId, t.createdAt),
  ]
);

/**
 * Venue follows — lightweight many-to-many for "save this venue" that
 * powers the FinalStandings "Follow" CTA and unlocks the venue's upcoming-
 * sessions digest. See `drizzle/0017_venue_follows.sql`.
 */
export const venueFollows = pgTable(
  "venue_follows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    venueAccountId: uuid("venue_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("venue_follows_player_venue_uidx").on(
      t.playerId,
      t.venueAccountId
    ),
    index("venue_follows_venue_idx").on(t.venueAccountId),
  ]
);

/**
 * Web Push subscriptions — one row per (account, browser endpoint). See
 * `drizzle/0020_push_subscriptions.sql`. Actual sending requires the
 * `web-push` npm dep and a VAPID keypair (see `lib/push/send.ts`).
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("push_subscriptions_endpoint_uidx").on(t.endpoint),
    index("push_subscriptions_account_idx").on(t.accountId),
  ]
);

/**
 * Seasons — named time windows over the answers table used to power the
 * "Season leaderboard" tab on `/leaderboards`. Hand-curated so admins can
 * roll them over on whatever cadence suits the operator without a
 * migration. See `drizzle/0019_seasons.sql`.
 */
export const seasons = pgTable(
  "seasons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("seasons_slug_uidx").on(t.slug),
    index("seasons_window_idx").on(t.startsAt, t.endsAt),
  ]
);

/**
 * Friendships — directed request rows that collapse into a symmetric social
 * graph once accepted. See `drizzle/0018_friendships.sql` for the rationale.
 *
 * `requester_id` is the user who tapped "Add friend"; `addressee_id` sees a
 * pending invite in their inbox. The row is re-used in place when accepted —
 * we do NOT duplicate it with the addressee as requester. The data layer in
 * `lib/friends.ts` handles the bi-directional lookup.
 */
export const friendships = pgTable(
  "friendships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    addresseeId: uuid("addressee_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("friendships_pair_uidx").on(t.requesterId, t.addresseeId),
    index("friendships_requester_idx").on(t.requesterId),
    index("friendships_addressee_idx").on(t.addresseeId),
  ]
);

export const questionPackages = pgTable(
  "question_packages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("question_packages_slug_unique").on(t.slug)]
);

export const questionPackageItems = pgTable(
  "question_package_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    packageId: uuid("package_id")
      .notNull()
      .references(() => questionPackages.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("question_package_items_package_idx").on(t.packageId),
    uniqueIndex("question_package_items_unique").on(t.packageId, t.questionId),
  ]
);

/* Relations (optional, for relational queries) */
export const accountsRelations = relations(accounts, ({ many, one }) => ({
  venues: many(venues),
  venueProfile: one(venueProfiles, {
    fields: [accounts.id],
    references: [venueProfiles.accountId],
  }),
}));

export const venuesRelations = relations(venues, ({ one }) => ({
  account: one(accounts, { fields: [venues.accountId], references: [accounts.id] }),
}));

export const venueProfilesRelations = relations(venueProfiles, ({ one }) => ({
  account: one(accounts, {
    fields: [venueProfiles.accountId],
    references: [accounts.id],
  }),
}));

export const questionCategoriesRelations = relations(questionCategories, ({ many }) => ({
  subcategories: many(questionSubcategories),
}));

export const questionSubcategoriesRelations = relations(questionSubcategories, ({ one }) => ({
  category: one(questionCategories, {
    fields: [questionSubcategories.categoryId],
    references: [questionCategories.id],
  }),
}));

export const questionDecksRelations = relations(questionDecks, ({ one, many }) => ({
  owner: one(accounts, { fields: [questionDecks.ownerAccountId], references: [accounts.id] }),
  reviewer: one(accounts, {
    fields: [questionDecks.reviewedByAccountId],
    references: [accounts.id],
  }),
  questions: many(questions),
}));

export const questionsRelations = relations(questions, ({ one }) => ({
  deck: one(questionDecks, { fields: [questions.deckId], references: [questionDecks.id] }),
  author: one(accounts, { fields: [questions.authorAccountId], references: [accounts.id] }),
}));
