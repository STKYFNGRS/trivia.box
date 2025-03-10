'use client';

import dynamic from 'next/dynamic';

// Dynamically import the error wrapper component with SSR disabled
const SIWEErrorWrapper = dynamic(
  () => import('../wrappers/SIWEErrorWrapper'),
  { ssr: false }
);

/**
 * SIWEErrorHandler - Component that listens for SIWE errors and displays them in a user-friendly way
 * This helps diagnose and communicate issues with the Sign-In with Ethereum process
 * 
 * This is just a wrapper that dynamically loads the real implementation on the client side only
 */
export default function SIWEErrorHandler() {
  return <SIWEErrorWrapper />;
}