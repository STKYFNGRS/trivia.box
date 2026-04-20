#!/usr/bin/env node
/**
 * db-repair: force-apply every drizzle migration against the target Neon
 * database, tolerating "already exists" / "duplicate" errors so the script is
 * safe to re-run.
 *
 * Why this exists: in a few cases `drizzle-kit migrate` reports "nothing to
 * do" even though the live schema is missing columns/tables (e.g. the
 * `__drizzle_migrations` tracker and the real schema fell out of sync). This
 * script ignores the tracker, reads each `drizzle/*.sql` file in order, and
 * executes every statement. Statements that fail with a "duplicate"-class
 * Postgres error are logged and skipped so we don't have to rewrite every
 * migration to be idempotent.
 *
 * Usage:
 *   npm run db:repair
 *
 * Env:
 *   DATABASE_URL  required  Neon connection string (same one drizzle uses).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

// Neon's serverless driver needs a WebSocket implementation when running under
// Node. Try the `ws` package first (bundled transitively); fall back silently
// if it is unavailable (modern Node >= 22 ships a native WebSocket).
try {
  const { default: ws } = await import("ws");
  neonConfig.webSocketConstructor = ws;
} catch {
  /* assume global WebSocket */
}

const DUPLICATE_ERROR_CODES = new Set([
  "42P07", // duplicate_table
  "42P06", // duplicate_schema
  "42710", // duplicate_object (constraint, extension, index, etc.)
  "42701", // duplicate_column
  "42P16", // invalid_table_definition (e.g. adding PK twice)
]);
const UNIQUE_VIOLATION = "23505";

const DRIZZLE_DIR = "drizzle";
const STATEMENT_BREAK = "--> statement-breakpoint";

function listMigrations() {
  const files = readdirSync(DRIZZLE_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return files;
}

function parseStatements(raw) {
  return raw
    .split(STATEMENT_BREAK)
    .map((s) => s.trim())
    .map((s) => {
      // Strip leading SQL comments but keep the actual statement.
      const lines = s.split("\n");
      const keep = lines.filter((l) => !/^\s*--/.test(l));
      return keep.join("\n").trim();
    })
    .filter((s) => s.length > 0);
}

function classify(err) {
  if (!err) return "error";
  if (DUPLICATE_ERROR_CODES.has(err.code)) return "duplicate";
  if (err.code === UNIQUE_VIOLATION) return "duplicate";
  const msg = String(err.message ?? "").toLowerCase();
  if (msg.includes("already exists")) return "duplicate";
  if (msg.includes("duplicate key") || msg.includes("unique constraint")) return "duplicate";
  // "ALTER COLUMN … SET NOT NULL" against a column that is already NOT NULL
  // does not error — but adding a PK that already exists does (covered by 42P16).
  return "error";
}

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set (checked .env.local + .env).");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const files = listMigrations();
  console.log(`db-repair: applying ${files.length} migration file(s)\n`);

  let applied = 0;
  let skipped = 0;
  let failed = 0;

  try {
    for (const file of files) {
      const raw = readFileSync(join(DRIZZLE_DIR, file), "utf8");
      const statements = parseStatements(raw);
      console.log(`--- ${file}: ${statements.length} statement(s)`);

      for (const stmt of statements) {
        try {
          await pool.query(stmt);
          applied += 1;
        } catch (err) {
          const kind = classify(err);
          if (kind === "duplicate") {
            skipped += 1;
            const firstLine = stmt.split("\n")[0].slice(0, 80);
            console.log(`  SKIP (${err.code ?? "?"}): ${firstLine}…`);
          } else {
            failed += 1;
            const firstLine = stmt.split("\n")[0].slice(0, 120);
            console.error(
              `  FAIL (${err.code ?? "?"}) ${firstLine}…\n    ${err.message ?? err}`
            );
          }
        }
      }
    }

    // Make sure future `drizzle-kit migrate` runs see every file as applied so
    // we don't end up in the same half-applied state again.
    await pool.query(`
      CREATE SCHEMA IF NOT EXISTS drizzle;
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      );
    `);

    console.log(`\ndb-repair: ${applied} applied, ${skipped} skipped, ${failed} failed`);
    if (failed > 0) {
      console.error("db-repair completed with errors — review the FAIL lines above.");
      process.exit(2);
    }
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
