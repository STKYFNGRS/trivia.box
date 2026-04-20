import type { MetadataRoute } from "next";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { playerStats, players, venueProfiles } from "@/lib/db/schema";

const SITE_URL = (() => {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
})();

// Static marketing surface. Kept as a list so crawlers pick up every entry
// (Next resolves each to an absolute URL against `metadataBase`).
const STATIC_ROUTES: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority?: number }[] = [
  { path: "/", changeFrequency: "daily", priority: 1.0 },
  { path: "/play", changeFrequency: "hourly", priority: 0.9 },
  { path: "/decks", changeFrequency: "daily", priority: 0.7 },
  { path: "/leaderboards", changeFrequency: "hourly", priority: 0.7 },
  { path: "/games/upcoming", changeFrequency: "hourly", priority: 0.8 },
  { path: "/sign-up", changeFrequency: "monthly", priority: 0.5 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const base: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  // Public venues — one per row.
  let venueEntries: MetadataRoute.Sitemap = [];
  try {
    const rows = await db
      .select({ slug: venueProfiles.slug, updatedAt: venueProfiles.updatedAt })
      .from(venueProfiles)
      .limit(5000);
    venueEntries = rows.map((v) => ({
      url: `${SITE_URL}/v/${v.slug}`,
      lastModified: v.updatedAt ?? now,
      changeFrequency: "weekly",
      priority: 0.6,
    }));
  } catch {
    // Sitemap is best-effort — DB hiccups shouldn't 500 a search-engine
    // fetch. Fall through with just the static routes.
  }

  // Top N public player profiles by lifetime XP. This is a deliberate cap
  // — we don't want to expose every player in the sitemap for scraping,
  // just the ones whose profiles are "canonical" bragging pages.
  let playerEntries: MetadataRoute.Sitemap = [];
  try {
    const rows = await db
      .select({
        username: players.username,
        updatedAt: playerStats.updatedAt,
      })
      .from(playerStats)
      .innerJoin(players, eq(players.id, playerStats.playerId))
      .orderBy(desc(playerStats.totalXp))
      .limit(200);
    playerEntries = rows.map((p) => ({
      url: `${SITE_URL}/u/${encodeURIComponent(p.username)}`,
      lastModified: p.updatedAt ?? now,
      changeFrequency: "daily",
      priority: 0.5,
    }));
  } catch {
    // Same fail-open.
  }

  return [...base, ...venueEntries, ...playerEntries];
}
