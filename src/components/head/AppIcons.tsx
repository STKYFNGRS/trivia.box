// AppIcons.tsx - Component for consistent icon loading
'use client';

import React from 'react';

/**
 * AppIcons component ensures consistent loading of app icons and favicons
 * This approach helps with MetaMask and other web3 extensions
 */
const AppIcons: React.FC = () => (
  <>
    {/* Basic favicons */}
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="shortcut icon" href="/favicon.ico" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
    
    {/* MetaMask specific icon */}
    <link rel="icon" type="image/png" sizes="32x32" href="/metamask-icon.png" />
    
    {/* Apple touch icons */}
    <link rel="apple-touch-icon" sizes="32x32" href="/apple-touch-icon-new.png" />
    <link rel="apple-touch-icon" sizes="152x152" href="/android-chrome-192x192.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/android-chrome-192x192.png" />
    
    {/* Android/Chrome icons */}
    <link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png" />
    <link rel="icon" type="image/png" sizes="512x512" href="/android-chrome-512x512.png" />
    
    {/* Web App Manifest Files */}
    <link rel="manifest" href="/manifest.json" />
    <link rel="manifest" href="/site.webmanifest" crossOrigin="use-credentials" />
    
    {/* Special meta tag for MetaMask and web3 extension support */}
    <meta name="web3-extension-icon" content="/metamask-icon.png" />
    <meta property="eth:chainId" content="8453" />
    
    {/* OpenGraph image for sharing */}
    <meta property="og:image" content="/android-chrome-512x512.png" />
    <meta property="og:image:width" content="512" />
    <meta property="og:image:height" content="512" />
  </>
);

export default AppIcons;