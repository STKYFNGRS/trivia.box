import { config } from "dotenv";
import { and, count, eq } from "drizzle-orm";
import {
  accounts,
  achievementDefinitions,
  questionPackageItems,
  questionPackages,
  questions,
  venues,
} from "./schema";

// Keep these in sync with the taxonomy labels seeded by migration
// 0004_question_taxonomy. If you rename a subcategory in the taxonomy, update
// the matching entry here so re-seeding doesn't create "Unmapped questions"
// in the admin taxonomy panel.
const SPORTS_SUBS = [
  "Pro US leagues",
  "Olympics & world games",
  "College sports",
  "Individual sports",
  "Rules & records",
  "General sports trivia",
];
const POP_CULTURE_SUBS = [
  "Celebrities & influencers",
  "Internet & memes",
  "Fashion & beauty",
  "Social media platforms",
  "Brands & products",
  "General pop culture",
];
const HISTORY_SUBS = [
  "Ancient history",
  "Medieval & early modern",
  "US history",
  "World wars & conflicts",
  "Modern history",
  "Historical figures",
];

const sample = [
  {
    body: "Which country won the FIFA World Cup in 2018?",
    correctAnswer: "France",
    wrongAnswers: ["Brazil", "Germany", "Argentina"],
    category: "Sports",
    subcategory: "General sports trivia",
    difficulty: 1,
    timeHint: 20,
  },
  {
    body: "How many players are on a basketball team on the court at one time per team?",
    correctAnswer: "5",
    wrongAnswers: ["6", "7", "4"],
    category: "Sports",
    subcategory: "Pro US leagues",
    difficulty: 1,
    timeHint: 10,
  },
  {
    body: "In tennis, what is a score of zero called?",
    correctAnswer: "Love",
    wrongAnswers: ["Nil", "Deuce", "Ace"],
    category: "Sports",
    subcategory: "Individual sports",
    difficulty: 2,
    timeHint: 20,
  },
  {
    body: "Which streaming show features the Upside Down?",
    correctAnswer: "Stranger Things",
    wrongAnswers: ["Dark", "The OA", "Westworld"],
    category: "Movies & TV",
    subcategory: "Television series",
    difficulty: 1,
    timeHint: 20,
  },
  {
    body: "Who is known as the 'Queen of Pop'?",
    correctAnswer: "Madonna",
    wrongAnswers: ["Lady Gaga", "Britney Spears", "Beyoncé"],
    category: "Music",
    subcategory: "Rock & pop",
    difficulty: 2,
    timeHint: 20,
  },
  {
    body: "Which film won the first Academy Award for Best Picture?",
    correctAnswer: "Wings",
    wrongAnswers: ["Sunrise", "Metropolis", "The Jazz Singer"],
    category: "Movies & TV",
    subcategory: "Classic film",
    difficulty: 3,
    timeHint: 30,
  },
  {
    body: "In what year did the Berlin Wall fall?",
    correctAnswer: "1989",
    wrongAnswers: ["1987", "1991", "1985"],
    category: "History",
    subcategory: "Modern history",
    difficulty: 2,
    timeHint: 20,
  },
  {
    body: "Who was the first President of the United States?",
    correctAnswer: "George Washington",
    wrongAnswers: ["John Adams", "Thomas Jefferson", "Benjamin Franklin"],
    category: "History",
    subcategory: "US history",
    difficulty: 1,
    timeHint: 10,
  },
  {
    body: "The ancient city of Pompeii was destroyed by which volcano?",
    correctAnswer: "Mount Vesuvius",
    wrongAnswers: ["Mount Etna", "Mount St. Helens", "Krakatoa"],
    category: "History",
    subcategory: "Ancient history",
    difficulty: 2,
    timeHint: 20,
  },
  {
    body: "Which empire was ruled by Genghis Khan?",
    correctAnswer: "Mongol Empire",
    wrongAnswers: ["Ottoman Empire", "Persian Empire", "Byzantine Empire"],
    category: "History",
    subcategory: "Medieval & early modern",
    difficulty: 3,
    timeHint: 30,
  },
  // Extra vetted rows so default 10 questions/round per category works with
  // GameSetup + smartPull. Subcategories here must exist in the active
  // taxonomy (see lib/db/schema.ts seed / 0004_question_taxonomy.sql) or they
  // show up in the "Unmapped questions" panel on the admin taxonomy page.
  ...extraSeedQuestions("Sports", "S", 8, SPORTS_SUBS),
  ...extraSeedQuestions("Pop Culture", "P", 8, POP_CULTURE_SUBS),
  ...extraSeedQuestions("History", "H", 7, HISTORY_SUBS),
];

type SeedQuestion = {
  body: string;
  correctAnswer: string;
  wrongAnswers: readonly [string, string, string];
  category: string;
  subcategory: string;
  difficulty: 1 | 2 | 3;
  timeHint: 10 | 20 | 30;
};

function extraSeedQuestions(
  category: string,
  tag: string,
  n: number,
  subcats: string[]
): SeedQuestion[] {
  return Array.from({ length: n }, (_, i) => ({
    body: `[Seed ${tag}-${i + 1}] Local demo: which token is the correct trivia seed label?`,
    correctAnswer: "SEED",
    wrongAnswers: ["ALT-A", "ALT-B", "ALT-C"] as const,
    category,
    subcategory: subcats[i % subcats.length] ?? "General",
    difficulty: ((i % 3) + 1) as 1 | 2 | 3,
    timeHint: 20,
  }));
}

async function main() {
  config({ path: ".env.local" });
  config({ path: ".env" });
  const { db } = await import("./client");

  const [{ value: existing }] = await db.select({ value: count() }).from(questions);
  if (existing === 0) {
    for (const q of sample) {
      if (q.wrongAnswers.length !== 3) {
        throw new Error("Each question must have exactly 3 wrong answers");
      }
    }

    await db.insert(questions).values(
      sample.map((q) => ({
        body: q.body,
        correctAnswer: q.correctAnswer,
        wrongAnswers: [...q.wrongAnswers],
        category: q.category,
        subcategory: q.subcategory,
        difficulty: q.difficulty,
        timeHint: q.timeHint,
        vetted: true,
      }))
    );

    console.log(`Seeded ${sample.length} questions.`);
  } else {
    console.log("Questions already present; skipping full question seed.");
  }

  // Opt-in: only top up demo rows when explicitly requested. Without this
  // gate, every `npm run db:seed` (which we run to refresh achievements /
  // packages / the demo venue) would silently insert vetted "[Seed X-N]
  // Local demo" placeholder questions until each MVP category had ≥10
  // vetted rows — polluting the real question library admins are building.
  // Enable with `SEED_SUPPLEMENT=1 npm run db:seed` on a fresh DB only.
  if (process.env.SEED_SUPPLEMENT === "1") {
    await supplementCategoryMinimums();
  }

  await seedAchievementsAndPackages();
  await seedDemoVenueIfEmpty();
}

/** Ensures each MVP category has at least 10 vetted questions (for existing DBs that only had the small sample). */
async function supplementCategoryMinimums() {
  const { db } = await import("./client");
  const targets = [
    { category: "Sports", tag: "S", subcats: SPORTS_SUBS },
    { category: "Pop Culture", tag: "P", subcats: POP_CULTURE_SUBS },
    { category: "History", tag: "H", subcats: HISTORY_SUBS },
  ] as const;

  for (const c of targets) {
    const [{ value: have }] = await db
      .select({ value: count() })
      .from(questions)
      .where(
        and(eq(questions.category, c.category), eq(questions.vetted, true), eq(questions.retired, false))
      );
    const need = Math.max(0, 10 - (have ?? 0));
    if (need === 0) continue;

    const rows = extraSeedQuestions(c.category, c.tag, need, [...c.subcats]);
    await db.insert(questions).values(
      rows.map((q) => ({
        body: q.body,
        correctAnswer: q.correctAnswer,
        wrongAnswers: [...q.wrongAnswers],
        category: q.category,
        subcategory: q.subcategory,
        difficulty: q.difficulty,
        timeHint: q.timeHint,
        vetted: true,
      }))
    );
    console.log(`Supplemented ${need} vetted question(s) for category "${c.category}" (target ≥10).`);
  }
}

/** Synthetic host account + linked venue row for local/testing when the db is empty. */
async function seedDemoVenueIfEmpty() {
  const { db } = await import("./client");
  const [{ value: hostCount }] = await db
    .select({ value: count() })
    .from(accounts)
    .where(eq(accounts.accountType, "host"));
  if (hostCount > 0) {
    console.log("Host accounts already present; skipping demo host seed.");
    return;
  }

  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: "seed_demo_host",
      accountType: "host",
      name: "Demo Host",
      email: "demo-host-seed@local.trivia.box",
      city: "Demo City",
      subscriptionActive: true,
    })
    .returning({ id: accounts.id });

  if (!account) {
    console.warn("Demo host account insert returned no row.");
    return;
  }

  await db.insert(venues).values({
    accountId: account.id,
    address: "1 Seed Row (local demo - not a sign-in user)",
  });

  console.log("Seeded demo host account + address for empty DB (clerk_user_id=seed_demo_host).");
}

async function seedAchievementsAndPackages() {
  const { db } = await import("./client");
  const { BASELINE_ACHIEVEMENTS } = await import("../game/achievements");

  // Upsert baseline achievement definitions. Safe to run repeatedly: the
  // unique index on `slug` means `onConflictDoNothing` turns re-seeding into a
  // no-op for already-present rows, but picks up newly added definitions.
  for (const def of BASELINE_ACHIEVEMENTS) {
    await db
      .insert(achievementDefinitions)
      .values({
        slug: def.slug,
        title: def.title,
        description: def.description,
        icon: def.icon,
      })
      .onConflictDoNothing({ target: achievementDefinitions.slug });
  }
  const ac = await db.select({ value: count() }).from(achievementDefinitions);
  console.log(`Achievement definitions present: ${ac[0]?.value ?? 0}.`);

  const pc = await db.select({ value: count() }).from(questionPackages);
  if ((pc[0]?.value ?? 0) === 0) {
    const rows = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.vetted, true))
      .limit(10);
    if (rows.length > 0) {
      const [pkg] = await db
        .insert(questionPackages)
        .values({
          slug: "starter-mix",
          name: "Starter mix (10)",
          description: "First ten vetted questions in the database",
        })
        .returning({ id: questionPackages.id });
      if (pkg) {
        await db.insert(questionPackageItems).values(
          rows.map((r, i) => ({
            packageId: pkg.id,
            questionId: r.id,
            sortOrder: i,
          }))
        );
        console.log("Seeded starter question package.");
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
