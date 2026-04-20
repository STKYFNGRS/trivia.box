import { Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";

export type TrophyWallProps = {
  title?: string;
  description?: string;
  items: {
    slug: string;
    title: string;
    description: string | null;
    icon: string | null;
    earnedAt: Date;
  }[];
  emptyTitle?: string;
  emptyDescription?: string;
};

/**
 * Grid wall of achievement grants. Used by both the public profile and the
 * owner dashboard — identical visuals, no dashboard-only affordances.
 *
 * Icons are optional short strings (emoji or unicode char) stored on
 * `achievement_definitions.icon`. When absent we fall back to a `Trophy`
 * lucide glyph so the grid never collapses.
 */
export function TrophyWall({
  title = "Trophies",
  description = "Earned by playing games and answering questions.",
  items,
  emptyTitle = "No trophies yet",
  emptyDescription = "Play games and answer questions to unlock achievements.",
}: TrophyWallProps) {
  return (
    <section className="flex flex-col gap-4">
      <SectionHeader
        title={`${title} · ${items.length}`}
        description={description}
      />
      {items.length === 0 ? (
        <EmptyState
          icon={<Trophy className="size-6" aria-hidden />}
          title={emptyTitle}
          description={emptyDescription}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => (
            <Card
              key={t.slug}
              className="overflow-hidden shadow-[var(--shadow-card)]"
            >
              <CardContent className="flex items-start gap-3 py-4">
                <div
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg text-xl"
                  style={{
                    background:
                      "linear-gradient(135deg, color-mix(in oklab, var(--neon-magenta) 22%, transparent), color-mix(in oklab, var(--neon-violet) 18%, transparent))",
                    color: "var(--neon-lime)",
                    boxShadow:
                      "0 0 0 1px color-mix(in oklab, var(--neon-magenta) 35%, transparent)",
                  }}
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
      )}
    </section>
  );
}
