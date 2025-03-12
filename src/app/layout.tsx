import { Inter } from 'next/font/google';
import type { Metadata } from "next";
import "./globals.css";
import 'ethereum-identity-kit/css';
import Providers from "./providers";
import Script from 'next/script';
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

// Simple metadata - removing manifest reference
export const metadata: Metadata = {
  title: "Trivia Box - Web3 Trivia Game",
  description: "Test your knowledge, earn rewards, and compete with players worldwide!"
  // Not referencing manifest here to avoid conflicts
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
        
        {/* Barebones basic favicon setup */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="manifest" href="/site.webmanifest" />
        
        {/* MetaMask specific icon - directly reference our special icon */}
        <link rel="icon" type="image/png" sizes="32x32" href="/mm-icon.png" />
        <meta name="web3-extension-icon" content="/mm-icon.png" />
        <meta property="eth:chainId" content="8453" />
        
        {/* Include special MetaMask integration script */}
        <Script id="metamask-integration" strategy="afterInteractive">
          {`
          // Inject special MetaMask icon directly into the DOM
          document.addEventListener('DOMContentLoaded', function() {
            const iconLink = document.createElement('link');
            iconLink.rel = 'icon';
            iconLink.href = '/mm-icon.png';
            iconLink.type = 'image/png';
            document.head.appendChild(iconLink);
            
            console.log('[MetaMask] Integration script loaded');
          });
          `}
        </Script>
      </head>
      <body className="dark overflow-x-hidden">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
