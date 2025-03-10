'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';

export default function DebugConnectionWrapper() {
  const [debugInfo, setDebugInfo] = useState<any>({});
  const { address, chainId, isConnected } = useAccount();
  const [appKitStatus, setAppKitStatus] = useState<string | undefined>(undefined);

  // Safer way to check AppKit state without using hooks that might not be available
  useEffect(() => {
    // Check if we're in development vs production
    const isDev = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || 
       window.location.hostname === '127.0.0.1');
    
    if (isDev) {
      // In development, we don't use AppKit state so just report that
      setAppKitStatus('disabled-in-dev');
    } else {
      // In production, try to access AppKit state if available
      try {
        const appkitModal = (window as any).__APPKIT_MODAL__;
        if (appkitModal && typeof appkitModal.getState === 'function') {
          const state = appkitModal.getState();
          setAppKitStatus(state?.status);
        } else {
          setAppKitStatus('not-initialized');
        }
      } catch (err) {
        console.warn('Could not access AppKit state:', err);
        setAppKitStatus('error');
      }
    }
  }, []);

  // Collect debug info in an effect to avoid render issues
  useEffect(() => {
    const newDebugInfo = {
      appKitStatus: appKitStatus,
      wagmiConnected: isConnected,
      address: address,
      chainId: chainId,
      timestamp: new Date().toISOString()
    };

    setDebugInfo(newDebugInfo);
    console.log('[Connection Debug]', newDebugInfo);
  }, [appKitStatus, isConnected, address, chainId]);

  // Add global error listener for SIWE errors
  useEffect(() => {
    const handleError = (event: any) => {
      if (
        event.reason && 
        typeof event.reason.message === 'string' && 
        (event.reason.message.includes('SIWE') || 
         event.reason.message.includes('sign') || 
         event.reason.message.includes('CAIP'))
      ) {
        console.error('[SIWE Debug] Error caught:', {
          message: event.reason.message,
          stack: event.reason.stack,
          chainId: chainId || 'unknown',
          state: {
            appKitStatus: appKitStatus,
            wagmiConnected: isConnected,
            address: address
          }
        });
      }
    };

    window.addEventListener('unhandledrejection', handleError);
    return () => window.removeEventListener('unhandledrejection', handleError);
  }, [chainId, appKitStatus, isConnected, address]);

  // This component doesn't render anything visible
  return null;
}