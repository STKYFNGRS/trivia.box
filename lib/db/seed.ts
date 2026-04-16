import { config } from "dotenv";
import { count } from "drizzle-orm";
import { questions } from "./schema";

const sample = [
  {
    body: "Which country won the FIFA World Cup in 2018?",
    correctAnswer: "France",
    wrongAnswers: ["Brazil", "Germany", "Argentina"],
    category: "Sports",
    subcategory: "Soccer",
    difficulty: 1,
    timeHint: 20,
  },
  {
    body: "How many players are on a basketball team on the court at one time per team?",
    correctAnswer: "5",
    wrongAnswers: ["6", "7", "4"],
    category: "Sports",
    subcategory: "Basketball",
    difficulty: 1,
    timeHint: 10,
  },
  {
    body: "In tennis, what is a score of zero called?",
    correctAnswer: "Love",
    wrongAnswers: ["Nil", "Deuce", "Ace"],
    category: "Sports",
    subcategory: "Tennis",
    difficulty: 2,
    timeHint: 20,
  },
  {
    body: "Which streaming show features the Upside Down?",
    correctAnswer: "Stranger Things",
    wrongAnswers: ["Dark", "The OA", "Westworld"],
    category: "Pop Culture",
    subcategory: "TV",
    difficulty: 1,
    timeHint: 20,
  },
  {
    body: "Who is known as the 'Queen of Pop'?",
    correctAnswer: "Madonna",
    wrongAnswers: ["Lady Gaga", "Britney Spears", "Beyoncé"],
    category: "Pop Culture",
    subcategory: "Music",
    difficulty: 2,
    timeHint: 20,
  },
  {
    body: "Which film won the first Academy Award for Best Picture?",
    correctAnswer: "Wings",
    wrongAnswers: ["Sunrise", "Metropolis", "The Jazz Singer"],
    category: "Pop Culture",
    subcategory: "Film",
    difficulty: 3,
    timeHint: 30,
  },
  {
    body: "In what year did the Berlin Wall fall?",
    correctAnswer: "1989",
    wrongAnswers: ["1987", "1991", "1985"],
    category: "History",
    subcategory: "Cold War",
    difficulty: 2,
    timeHint: 20,
  },
  {
    body: "Who was the first President of the United States?",
    correctAnswer: "George Washington",
    wrongAnswers: ["John Adams", "Thomas Jefferson", "Benjamin Franklin"],
    category: "History",
    subcategory: "US Presidents",
    difficulty: 1,
    timeHint: 10,
  },
  {
    body: "The ancient city of Pompeii was destroyed by which volcano?",
    correctAnswer: "Mount Vesuvius",
    wrongAnswers: ["Mount Etna", "Mount St. Helens", "Krakatoa"],
    category: "History",
    subcategory: "Ancient Rome",
    difficulty: 2,
    timeHint: 20,
  },
  {
    body: "Which empire was ruled by Genghis Khan?",
    correctAnswer: "Mongol Empire",
    wrongAnswers: ["Ottoman Empire", "Persian Empire", "Byzantine Empire"],
    category: "History",
    subcategory: "World Empires",
    difficulty: 3,
    timeHint: 30,
  },
] as const;

async function main() {
  config({ path: ".env.local" });
  config({ path: ".env" });
  const { db } = await import("./client");

  const [{ value: existing }] = await db.select({ value: count() }).from(questions);
  if (existing > 0) {
    console.log("Questions already present; skipping seed.");
    return;
  }

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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
