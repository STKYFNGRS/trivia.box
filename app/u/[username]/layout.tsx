import type { ReactNode } from "react";
import { MarketingShell } from "@/components/marketing/MarketingShell";

/**
 * Public player profiles live on the marketing surface, so they share the
 * arcade-neon chrome (nav, footer, film grain). Wrapping here — rather than
 * inline on `page.tsx` — keeps the page component a clean data+content
 * server component, and guarantees there is always a way off the profile
 * page (site nav + sign-in / dashboard CTAs in the header).
 */
export default function PublicProfileLayout({ children }: { children: ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>;
}
