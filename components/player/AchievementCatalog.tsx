import { CheckCircle2, Lock, Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { cn } from "@/lib/utils";

export type AchievementCatalogRow = {
  slug: string;
  title: string;
  description: string;
  icon: string;
  earned: boolean;
  earnedAt: Date | null;
  progress: number;
  progressLabel: string;
};

type Props = {
  rows: AchievementCatalogRow[];
  /**
   * Extra achievements to show under "Bonus trophies" — the dynamic
   * per-category / per-venue grants (`scholar_*`, `regular_*`,
   * `local_legend_*`) that don't belong in the fixed progress grid.
   */
  bonus?: Array<{
    slug: string;
    title: string;
    description: string | null;
    icon: string | null;
    earnedAt: Date;
  }>;
};

/**
 * Locked + unlocked achievements grid. Rendered on
 * `/dashboard/player/achievements` (owner-only; public profile keeps
 * the `TrophyWall` earned-only grid to avoid telling visitors which
 * trophies a player is grinding toward).
 */
export function AchievementCatalog({ rows, bonus = [] }: Props) {
  const earnedCount = rows.filter((r) => r.earned).length;
  const totalCount = rows.length;
  const completion = totalCount === 0 ? 0 : earnedCount / totalCount;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <SectionHeader
          title={`Baseline trophies · ${earnedCount} / ${totalCount}`}
          description="Answer questions, finish games, and crack the top three to fill out the wall."
        />
        <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.22em] text-white/60">
            <span>Overall</span>
            <span className="tabular-nums text-white/80">
              {Math.round(completion * 100)}%
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[var(--stage-accent)] transition-[width] duration-500"
              style={{ width: `${Math.round(completion * 100)}%` }}
              aria-hidden
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <CatalogCard key={r.slug} row={r} />
          ))}
        </div>
      </section>

      {bonus.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title={`Bonus trophies · ${bonus.length}`}
            description="Per-category scholars and per-venue regulars — these unlock automatically the first time you qualify."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bonus.map((t) => (
              <Card
                key={t.slug}
                className="overflow-hidden shadow-[var(--shadow-card)]"
              >
                <CardContent className="flex items-start gap-3 py-4">
                  <div
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-xl text-amber-200 ring-1 ring-amber-400/30"
                  >
                    {t.icon ?? <Trophy className="size-5" aria-hidden />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-foreground truncate text-sm font-semibold">
                      {t.title}
                    </div>
                    {t.description ? (
                      <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                        {t.description}
                      </p>
                    ) : null}
                    <div className="text-muted-foreground/80 mt-1 text-[0.7rem] uppercase tracking-[0.14em] tabular-nums">
                      {t.earnedAt.toISOString().slice(0, 10)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function CatalogCard({ row }: { row: AchievementCatalogRow }) {
  const pct = Math.round(row.progress * 100);
  return (
    <Card
      className={cn(
        "overflow-hidden shadow-[var(--shadow-card)] transition-colors",
        row.earned ? "ring-1 ring-[var(--stage-accent)]/40" : null
      )}
    >
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-start gap-3">
          <div
            aria-hidden
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg text-xl transition-colors",
              row.earned
                ? "bg-[var(--stage-accent)]/20 text-[var(--stage-accent)] ring-1 ring-[var(--stage-accent)]/40"
                : "bg-white/5 text-white/40 ring-1 ring-white/10"
            )}
          >
            {row.earned ? (
              row.icon ?? <Trophy className="size-5" aria-hidden />
            ) : (
              <Lock className="size-5" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <span className="truncate">{row.title}</span>
              {row.earned ? (
                <CheckCircle2
                  className="size-4 shrink-0 text-[var(--stage-accent)]"
                  aria-label="Earned"
                />
              ) : null}
            </div>
            <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
              {row.description}
            </p>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-white/60">
            <span>{row.earned ? "Unlocked" : "Progress"}</span>
            <span className="tabular-nums text-white/80">
              {row.earned
                ? row.earnedAt?.toISOString().slice(0, 10) ?? ""
                : `${pct}%`}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                row.earned
                  ? "bg-[var(--stage-accent)]"
                  : "bg-white/30"
              )}
              style={{ width: `${pct}%` }}
              aria-hidden
            />
          </div>
          <div className="text-muted-foreground mt-1 text-[11px]">
            {row.progressLabel}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
