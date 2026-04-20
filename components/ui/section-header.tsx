import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned actions (buttons, filters, etc.). */
  actions?: ReactNode;
  className?: string;
  /** Heading element for a11y. Defaults to `h2`. */
  as?: "h1" | "h2" | "h3";
};

/**
 * Consistent section header used across dashboard, admin, and marketing pages.
 *
 *   <SectionHeader
 *     eyebrow="Taxonomy"
 *     title="Coverage"
 *     description="Track how many vetted questions exist per subcategory."
 *     actions={<Button>Refresh</Button>}
 *   />
 */
export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  as: Heading = "h2",
}: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </div>
        ) : null}
        <Heading
          className={cn(
            "mt-1 font-semibold tracking-tight",
            Heading === "h1" && "text-3xl",
            Heading === "h2" && "text-2xl",
            Heading === "h3" && "text-xl",
          )}
        >
          {title}
        </Heading>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
