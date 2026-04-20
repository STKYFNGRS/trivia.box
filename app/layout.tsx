import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { PostHogProvider } from "@/components/analytics/PostHogProvider";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "trivia.box",
  description: "Bar trivia platform for hosts and venues.",
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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {publishableKey ? (
          <ClerkProvider publishableKey={publishableKey}>{themed}</ClerkProvider>
        ) : (
          themed
        )}
      </body>
    </html>
  );
}
