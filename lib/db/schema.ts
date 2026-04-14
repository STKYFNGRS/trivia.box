import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    accountType: text("account_type").notNull(), // 'host' | 'venue'
    name: text("name").notNull(),
    email: text("email").notNull(),
    city: text("city").notNull(),
    logoUrl: text("logo_url"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    subscriptionActive: boolean("subscription_active").notNull().default(false),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("questions_category_idx").on(t.category),
    index("questions_vetted_retired_idx").on(t.vetted, t.retired),
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
    secondsPerQuestion: integer("seconds_per_question"),
    joinCode: text("join_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sessions_join_code_unique").on(t.joinCode)]
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
    status: text("status").notNull().default("pending"), // pending | active | revealed | complete
    timeStarted: timestamp("time_started", { withTimezone: true }),
    timeLocked: timestamp("time_locked", { withTimezone: true }),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("players_username_unique").on(t.username)]
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("answers_player_idx").on(t.playerId),
    index("answers_sq_idx").on(t.sessionQuestionId),
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

/* Relations (optional, for relational queries) */
export const accountsRelations = relations(accounts, ({ many }) => ({
  venues: many(venues),
}));

export const venuesRelations = relations(venues, ({ one }) => ({
  account: one(accounts, { fields: [venues.accountId], references: [accounts.id] }),
}));
