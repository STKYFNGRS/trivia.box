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

// Define the base URL for favicons - adjust this based on your production domain
const BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://trivia.box' 
  : 'https://localhost:3000';

export const metadata: Metadata = {
  title: "Trivia Box - Web3 Trivia Game",
  description: "Test your knowledge, earn rewards, and compete with players worldwide!",
  icons: {
    icon: [
      { url: `${BASE_URL}/favicon.ico`, sizes: 'any', type: 'image/x-icon' },
      { url: `${BASE_URL}/favicon-16x16.png`, sizes: '16x16', type: 'image/png' },
      { url: `${BASE_URL}/favicon-32x32.png`, sizes: '32x32', type: 'image/png' },
      { url: `${BASE_URL}/android-chrome-192x192.png`, sizes: '192x192', type: 'image/png' },
      { url: `${BASE_URL}/android-chrome-512x512.png`, sizes: '512x512', type: 'image/png' },
    ],
    shortcut: { url: `${BASE_URL}/favicon.ico`, type: 'image/x-icon' },
    apple: [
      { url: `${BASE_URL}/apple-touch-icon.png`, sizes: '180x180', type: 'image/png' },
      { url: `${BASE_URL}/android-chrome-192x192.png`, sizes: '192x192', type: 'image/png' },
    ],
    other: [
      {
        rel: 'mask-icon',
        url: `${BASE_URL}/safari-pinned-tab.svg`,
        color: '#000000',
      },
    ],
  },
  appleWebApp: { 
    capable: true,
    title: "Trivia Box",
    statusBarStyle: "black-translucent"
  },
  manifest: `${BASE_URL}/site.webmanifest`
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
        {/* Primary meta tags */}
        <meta name="theme-color" content="#000000" />
        
        {/* Explicit favicon tags for MetaMask and other extensions with absolute URLs */}
        <link rel="icon" href={`${BASE_URL}/favicon.ico`} sizes="any" />
        <link rel="shortcut icon" href={`${BASE_URL}/favicon.ico`} />
        <link rel="icon" type="image/png" sizes="32x32" href={`${BASE_URL}/favicon-32x32.png`} />
        <link rel="icon" type="image/png" sizes="16x16" href={`${BASE_URL}/favicon-16x16.png`} />
        <link rel="apple-touch-icon" sizes="180x180" href={`${BASE_URL}/apple-touch-icon.png`} />
        
        {/* Additional tags specifically for web3 wallets */}
        <link rel="icon" type="image/png" sizes="192x192" href={`${BASE_URL}/android-chrome-192x192.png`} />
        <link rel="icon" type="image/png" sizes="512x512" href={`${BASE_URL}/android-chrome-512x512.png`} />
        
        {/* Web manifest with absolute URL */}
        <link rel="manifest" href={`${BASE_URL}/site.webmanifest`} />
      </head>
      <body className="dark overflow-x-hidden">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
