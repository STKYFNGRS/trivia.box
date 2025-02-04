'use client';

import { useEffect, useState } from 'react';

export default function Web3ModalButton() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  return (
    <>
      <style jsx global>{`
        w3m-button {
          --w3m-background-color: transparent !important;
          --w3m-accent-color: #FF3366 !important;
          --w3m-color-fg-1: white !important;
          --w3m-color-fg-2: rgba(255, 255, 255, 0.7) !important;
          --w3m-font-family: var(--font-geist-sans) !important;
          --w3m-button-border-radius: 999px !important;
          display: block;
        }
        w3m-button > button {
          background: linear-gradient(90deg, #FF3366, #FF8C42) !important;
          min-width: 180px !important;
          text-transform: none !important;
          border: none !important;
          transform: scale(1) !important;
          transition: all 0.3s ease !important;
          padding: 12px 32px !important;
          font-size: 16px !important;
          font-weight: 500 !important;
          box-shadow: 0 0 20px rgba(255, 51, 102, 0.4) !important;
        }
        w3m-button > button:hover {
          box-shadow: 0 0 30px rgba(255, 51, 102, 0.6) !important;
          opacity: 0.95 !important;
        }
      `}</style>
      <div dangerouslySetInnerHTML={{ __html: '<w3m-button />' }} />
    </>
  );
}