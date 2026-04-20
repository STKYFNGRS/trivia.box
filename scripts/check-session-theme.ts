/**
 * Probe: does the configured database actually have the `sessions.theme`
 * column introduced in migration `0013_session_theme`?
 *
 *   npm run db:check-theme
 *
 * Exits 0 if the column exists, 1 otherwise. Prints the DATABASE_URL host so
 * you can confirm you're pointed at the right instance.
 *
 * Uses `@neondatabase/serverless` (already a direct dep) so we don't pull in
 * a second Postgres client just for a one-shot probe.
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set (checked .env.local then .env)");
    process.exit(2);
  }

  let host = "unknown";
  try {
    host = new URL(url).host;
  } catch {
    // ignore
  }
  console.log(`[check-session-theme] connecting to ${host}`);

  const sql = neon(url);

  const rows = (await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'sessions'
      AND column_name  = 'theme';
  `) as { column_name: string; data_type: string }[];

  if (rows.length === 0) {
    console.error(
      `[check-session-theme] sessions.theme is MISSING on ${host}. Run 'npm run db:migrate' against this DATABASE_URL.`
    );
    process.exit(1);
  }

  const [row] = rows;
  console.log(
    `[check-session-theme] sessions.theme present (${row?.data_type})`
  );

  const countRows = (await sql`SELECT count(*)::text AS count FROM sessions;`) as {
    count: string;
  }[];
  console.log(
    `[check-session-theme] sessions row count: ${countRows[0]?.count ?? "?"}`
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("[check-session-theme] unexpected error:", err);
  process.exit(3);
});
