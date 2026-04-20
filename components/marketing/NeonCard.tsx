import { cn } from "@/lib/utils";

export type NeonTone = "magenta" | "cyan" | "lime" | "amber" | "violet";

const TONE_VARS: Record<NeonTone, string> = {
  magenta: "var(--neon-magenta)",
  cyan: "var(--neon-cyan)",
  lime: "var(--neon-lime)",
  amber: "var(--neon-amber)",
  violet: "var(--neon-violet)",
};

/**
 * Reusable arcade-style card. Renders a translucent glass body with a
 * tone-specific accent border + glow. `as` lets callers make it a link or
 * another element so the whole card becomes a hit target.
 *
 * Prefer this over raw `<Card>` on marketing surfaces — the body copy still
 * sits on top of a clean `var(--stage-surface)` base so contrast ratios stay
 * well above AA.
 */
type NeonCardOwnProps = {
  tone?: NeonTone;
  className?: string;
  children: React.ReactNode;
  interactive?: boolean;
  style?: React.CSSProperties;
};

/**
 * Polymorphic props: the `as` prop lets callers render the card as any
 * component (e.g. Next's `Link`) and TypeScript correctly infers the rest
 * of the props (like `href`) from that target component.
 */
type PolymorphicProps<C extends React.ElementType> = NeonCardOwnProps & {
  as?: C;
} & Omit<React.ComponentPropsWithoutRef<C>, keyof NeonCardOwnProps | "as">;

export function NeonCard<C extends React.ElementType = "div">({
  tone = "magenta",
  className,
  children,
  interactive = false,
  as,
  style,
  ...rest
}: PolymorphicProps<C>) {
  const Comp = (as ?? "div") as React.ElementType;
  const color = TONE_VARS[tone];
  return (
    <Comp
      {...rest}
      className={cn(
        "relative overflow-hidden rounded-2xl border p-6 text-white backdrop-blur",
        "transition-[transform,box-shadow,border-color] duration-300",
        interactive &&
          "hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:outline-none",
        className
      )}
      style={{
        ...(style ?? {}),
        background:
          "linear-gradient(180deg, color-mix(in oklab, var(--stage-surface) 96%, transparent), color-mix(in oklab, var(--stage-bg) 92%, transparent))",
        borderColor: `color-mix(in oklab, ${color} 35%, transparent)`,
        boxShadow: `inset 0 1px 0 0 color-mix(in oklab, ${color} 22%, transparent), 0 10px 40px -18px color-mix(in oklab, ${color} 55%, transparent)`,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 [[data-neon-card]:hover_&]:opacity-100"
      />
      {/* Accent gradient stripe — a subtle top-edge highlight. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        }}
      />
      {children}
    </Comp>
  );
}
