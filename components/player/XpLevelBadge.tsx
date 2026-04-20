import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { xpToLevel } from "@/lib/xp";

/**
 * Compact "Level X · NNN XP · progress" badge. Pure render — takes the
 * raw `totalXp` and derives everything. Used on player dashboards,
 * leaderboard rows, and the public profile.
 */
export function XpLevelBadge({
  xp,
  size = "md",
  className,
}: {
  xp: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const { level, current, needed, progress } = xpToLevel(xp);
  const pct = Math.round(progress * 100);
  const isSmall = size === "sm";

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--neon-magenta)_30%,transparent)] bg-[color-mix(in_oklab,var(--neon-magenta)_8%,transparent)]",
        isSmall ? "px-2 py-1" : "px-3 py-2",
        className
      )}
      title={`${current}/${needed} XP toward next level`}
    >
      <Sparkles
        className={cn(
          "text-[var(--neon-magenta)]",
          isSmall ? "size-3" : "size-4"
        )}
      />
      <div className="flex flex-col leading-tight">
        <div
          className={cn(
            "font-semibold uppercase tracking-wide text-[var(--neon-magenta)]",
            isSmall ? "text-[10px]" : "text-xs"
          )}
        >
          Lv {level} · {xp.toLocaleString()} XP
        </div>
        {!isSmall ? (
          <div className="mt-1 h-1 w-28 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[var(--neon-magenta)]"
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
