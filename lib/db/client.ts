import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

/**
 * Neon `Pool` + `drizzle-orm/neon-serverless` supports `db.transaction` (unlike `neon-http`).
 * `max: 1` keeps serverless connection usage predictable; increase only if you measure contention.
 */
function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return new Pool({ connectionString: url, max: 1 });
}

const globalForDb = globalThis as unknown as {
  triviaBoxPool?: Pool;
  triviaBoxDb?: ReturnType<typeof drizzle<typeof schema>>;
};

function getPool(): Pool {
  if (!globalForDb.triviaBoxPool) {
    globalForDb.triviaBoxPool = createPool();
  }
  return globalForDb.triviaBoxPool;
}

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

function getDb(): DrizzleDb {
  if (!globalForDb.triviaBoxDb) {
    globalForDb.triviaBoxDb = drizzle(getPool(), { schema });
  }
  return globalForDb.triviaBoxDb;
}

/**
 * Lazy proxy so importing this module does not require `DATABASE_URL` to be set
 * (tests and build-time code can import things that transitively import `db`
 * without actually executing queries).
 */
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
}) as DrizzleDb;

export type Db = DrizzleDb;
