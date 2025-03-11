import { Inter } from 'next/font/google';
import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: "Trivia Box - Web3 Trivia Game",
  description: "Test your knowledge, earn rewards, and compete with players worldwide!",
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any', type: 'image/x-icon' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: { url: '/favicon.ico', type: 'image/x-icon' },
    apple: [
      { url: '/apple-touch-icon.png', type: 'image/png' },
      { url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    other: [
      {
        rel: 'mask-icon',
        url: '/safari-pinned-tab.svg',
        color: '#000000',
      },
    ],
  },
  appleWebApp: { 
    capable: true,
    title: "Trivia Box",
    statusBarStyle: "black-translucent"
  },
  manifest: '/site.webmanifest'
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, 
  userScalable: false,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="shortcut icon" href="/favicon.ico" type="image/x-icon" />
      </head>
      <body className="dark overflow-x-hidden">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
