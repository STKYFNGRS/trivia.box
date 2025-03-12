import { Inter } from 'next/font/google';
import type { Metadata } from "next";
import "./globals.css";
import 'ethereum-identity-kit/css';
import Providers from "./providers";

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

// Use relative URLs for favicons to work across environments
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
      { url: '/apple-touch-icon-new.png', sizes: '32x32', type: 'image/png' },
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
  // Reference both manifest files for maximum compatibility
  manifest: '/manifest.json',
  metadataBase: new URL('https://www.trivia.box'),
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
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#000000" />
        <meta name="mobile-web-app-capable" content="yes" />
        
        {/* Special meta tag for MetaMask and web3 extension support */}
        <meta name="web3-extension-icon" content="/metamask-icon.png" />
        <meta property="eth:chainId" content="8453" /> {/* Base chain ID */}
        
        {/* Explicit favicon tags with relative paths - crucial for wallet extensions */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        
        {/* Specific tags for MetaMask and other web3 extensions */}
        <link rel="icon" type="image/png" sizes="32x32" href="/metamask-icon.png" />
        <link rel="apple-touch-icon" sizes="32x32" href="/apple-touch-icon-new.png" />
        
        {/* Include other icon sizes */}
        <link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/android-chrome-512x512.png" />
        
        {/* Web3 wallet specific tags */}
        <meta property="og:image" content="/android-chrome-512x512.png" />
        <meta property="og:image:width" content="512" />
        <meta property="og:image:height" content="512" />
        
        {/* Include references to both manifest files for maximum compatibility */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="manifest" href="/site.webmanifest" crossOrigin="use-credentials" />
      </head>
      <body className="dark overflow-x-hidden">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
