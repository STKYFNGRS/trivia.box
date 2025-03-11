'use client';

// This component specifically adds the favicon in the format MetaMask expects
export default function MetamaskFavicon() {
  // Only run in browser environment
  if (typeof document === 'undefined') return null;

  // Create and add the link element that MetaMask specifically looks for
  const link = document.createElement('link');
  link.rel = 'shortcut icon';
  link.href = `${window.location.origin}/favicon.ico`;
  link.type = 'image/x-icon';
  
  // Add to document head if it doesn't already exist
  const existing = document.querySelector('link[rel="shortcut icon"]');
  if (!existing) {
    document.head.appendChild(link);
  }
  
  return null;
}
