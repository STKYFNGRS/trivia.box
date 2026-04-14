import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return drizzle(neon(url), { schema });
}

const globalForDb = globalThis as unknown as { triviaBoxDb?: ReturnType<typeof createDb> };

export const db = globalForDb.triviaBoxDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.triviaBoxDb = db;
}

export type Db = typeof db;
