import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Unbounded } from "next/font/google";
import { Suspense } from "react";
import { PostHogProvider } from "@/components/analytics/PostHogProvider";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// Chunky geometric display face for arcade-neon hero + section titles. We
// only preload the heavy weights we actually use in the landing hero.
const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
});

const SITE_URL = (() => {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
})();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "trivia.box · Bar trivia, rebuilt.",
    template: "%s · trivia.box",
  },
  description:
    "Play live trivia in your local bar, in solo mode any time, or in a free house game every 30 minutes. Host smarter trivia nights with community decks and a real-time scoreboard.",
  applicationName: "trivia.box",
  keywords: [
    "trivia",
    "bar trivia",
    "pub quiz",
    "live trivia",
    "multiplayer trivia",
    "trivia for hosts",
    "trivia venue",
  ],
  // Favicons:
  //   - public/favicon.ico           → browsers auto-request /favicon.ico for
  //                                    every page; the file in public/ is
  //                                    served statically and bypasses
  //                                    middleware (see middleware.ts matcher).
  //   - public/apple-touch-icon.png  → referenced from manifest.ts at a
  //                                    stable URL.
  // We deliberately don't ship an `app/icon.svg` or duplicate the ICO under
  // `app/favicon.ico`; the latter would conflict with public/favicon.ico at
  // build time. No `metadata.icons` block either — it interacts badly with
  // `export const dynamic = "force-dynamic"` on the root layout (Next drops
  // the manually-listed <link>s from the initial HTML), and the browser's
  // default /favicon.ico request is enough to wire up the tab icon.
  // Keeping them as convention files (rather than under `metadata.icons`)
  // means Next injects the tags even for dynamically rendered routes and
  // sidesteps a known issue where `dynamic = "force-dynamic"` on the root
  // layout can drop the manually-listed icon <link>s from the initial HTML.
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "trivia.box",
    title: "trivia.box · Bar trivia, rebuilt.",
    description:
      "Free house games every 30 minutes, live venue nights, and solo runs. Play now, host tomorrow.",
  },
  twitter: {
    card: "summary_large_image",
    title: "trivia.box · Bar trivia, rebuilt.",
    description:
      "Free house games every 30 minutes, live venue nights, and solo runs.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0a0613",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const themed = (
    <ThemeProvider>
      {/* PostHog uses useSearchParams, which Next requires to be inside Suspense. */}
      <Suspense fallback={null}>
        <PostHogProvider>
          {children}
          <Toaster richColors />
        </PostHogProvider>
      </Suspense>
    </ThemeProvider>
  );

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${unbounded.variable} antialiased`}
      >
        {/* Skip-to-content link — hidden off-screen until it receives keyboard
            focus, at which point the browser brings it into view so keyboard
            users can jump past our marketing nav on every page. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-900 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--neon-magenta)]"
        >
          Skip to main content
        </a>
        {publishableKey ? (
          <ClerkProvider publishableKey={publishableKey}>{themed}</ClerkProvider>
        ) : (
          themed
        )}
      </body>
    </html>
  );
}
