import type { Appearance } from "@clerk/types";

/**
 * Shared Clerk appearance tuned to the cinematic-dark theme. Uses our CSS
 * tokens so Clerk's Elements inherit the same palette as the rest of the
 * marketing + auth surfaces. No external theme package is required.
 */
export const cinematicClerkAppearance: Appearance = {
  variables: {
    colorPrimary: "var(--stage-accent)",
    colorBackground: "var(--background)",
    colorText: "var(--foreground)",
    colorInputBackground: "var(--card)",
    colorInputText: "var(--foreground)",
    borderRadius: "var(--radius)",
    fontFamily: "var(--font-geist-sans)",
  },
  elements: {
    rootBox: "w-full",
    card:
      "bg-[var(--card)] shadow-[var(--shadow-hero)] ring-1 ring-white/10 border border-white/10 rounded-2xl",
    headerTitle: "text-foreground font-semibold tracking-tight",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButton:
      "border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-foreground",
    formFieldLabel: "text-muted-foreground font-medium",
    formButtonPrimary:
      "bg-[var(--neon-magenta)] text-[oklch(0.1_0.02_270)] hover:bg-[var(--neon-magenta)]/90 font-bold uppercase tracking-[0.1em]",
    footerActionLink: "text-[var(--neon-cyan)] hover:text-[var(--neon-cyan)]/80",
    dividerLine: "bg-white/10",
    dividerText: "text-muted-foreground",
  },
};
