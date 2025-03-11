'use client';

export default function FaviconLinks() {
  return (
    <>
      {/* Standard favicon */}
      <link rel="icon" href="/favicon.ico" />
      
      {/* Specific tag for MetaMask */}
      <link rel="shortcut icon" href="/favicon.ico" />
      
      {/* Size-specific favicons */}
      <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
      <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
      <link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png" />
      <link rel="icon" type="image/png" sizes="512x512" href="/android-chrome-512x512.png" />
      
      {/* Apple Touch Icon */}
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      
      {/* Web manifest */}
      <link rel="manifest" href="/site.webmanifest" />
    </>
  );
}
