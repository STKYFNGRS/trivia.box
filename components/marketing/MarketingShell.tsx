import { FilmGrain } from "./FilmGrain";
import { MarketingFooter } from "./MarketingFooter";
import { MarketingNav } from "./MarketingNav";

/**
 * Shared marketing chrome: nav on top, footer at bottom, and a fixed film
 * grain overlay. Pages opt in by wrapping their content:
 *
 *   <MarketingShell>
 *     <main>...</main>
 *   </MarketingShell>
 *
 * We use a component wrapper (not a Next route group) so we don't have to
 * move existing URLs under `app/(marketing)/*`. Any page that wants the
 * arcade-neon chrome just imports this.
 */
export function MarketingShell({
  children,
  // `wide` lets a page opt out of the default centered container and instead
  // use a full-bleed layout with its own internal max width. Used by the
  // landing hero + deck carousel which need edge-to-edge visuals.
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="relative min-h-screen bg-[var(--stage-bg)] text-white">
      <FilmGrain />
      <div className="relative z-10 flex min-h-screen flex-col">
        <MarketingNav />
        <main id="main-content" className={wide ? "flex-1" : "flex-1"}>
          {children}
        </main>
        <MarketingFooter />
      </div>
    </div>
  );
}
