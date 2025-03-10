'use client';

import { useAppKitState } from '@reown/appkit/react';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';

export default function SIWEErrorWrapper() {
  const [error, setError] = useState<string | null>(null);
  const { status } = useAppKitState();
  const { chainId } = useAccount();

  useEffect(() => {
    // Check if we're in development mode
    const isDevelopment = 
      typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    
    // Only set up error handlers in production mode where SIWE is enabled
    if (isDevelopment) {
      return; // Don't set up error handlers in development
    }
    // Listen for SIWE-specific errors that our custom error handler dispatches
    const handleSIWEError = (event: CustomEvent) => {
      console.log('[SIWE Debug] Error event received:', event.detail);
      setError(event.detail?.message || 'Authentication failed. Please try again.');
      
      // Auto-clear error after 5 seconds
      setTimeout(() => setError(null), 5000);
    };

    // Listen for global unhandled SIWE errors
    const handleUnhandledRejection = (event: any) => {
      if (
        event.reason && 
        typeof event.reason.message === 'string' && 
        (
          event.reason.message.includes('CAIP') || 
          event.reason.message.includes('verify') ||
          event.reason.message.includes('sign')
        )
      ) {
        // Format a better error message
        let message = 'Wallet verification failed.';
        
        if (event.reason.message.includes('CaipNetwork not found')) {
          if (chainId) {
            message = `Network ${chainId} is not supported for verification. Please try switching to Ethereum Mainnet or Base.`;
          } else {
            message = 'Your current network is not supported. Please switch to Ethereum Mainnet or Base.';
          }
        }
        
        setError(message);
        
        // Auto-clear error after 7 seconds
        setTimeout(() => setError(null), 7000);
      }
    };

    // Reset error when status changes
    if (status === 'authenticated') {
      setError(null);
    }

    // Listen for custom SIWE errors and unhandled rejections
    window.addEventListener('siwe-error', handleSIWEError as EventListener);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    return () => {
      window.removeEventListener('siwe-error', handleSIWEError as EventListener);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [status, chainId]);

  // Only render if there's an error to show
  if (!error) return null;

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-red-900/90 text-white px-4 py-3 rounded-lg shadow-lg border border-red-700 flex items-center max-w-md">
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className="h-5 w-5 mr-2 text-red-300 flex-shrink-0" 
          viewBox="0 0 20 20" 
          fill="currentColor"
        >
          <path 
            fillRule="evenodd" 
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" 
            clipRule="evenodd" 
          />
        </svg>
        <div>
          <p>{error}</p>
          <p className="text-sm text-red-300 mt-1">
            Try refreshing or switching to a supported network (Base or Ethereum)
          </p>
        </div>
      </div>
    </div>
  );
}