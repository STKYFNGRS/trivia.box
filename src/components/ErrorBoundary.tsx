'use client';

import React, { ErrorInfo, ReactNode } from 'react';
import { log } from '@/utils/logger';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error details
    log.error('Error caught by boundary:', { 
      component: 'ErrorBoundary',
      meta: { 
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        isMobile: typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      }
    });
    
    this.setState({ error, errorInfo });
    
    // Send error to your analytics service
    if (typeof window !== 'undefined') {
      try {
        const errorData = {
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          timestamp: new Date().toISOString(),
          url: window.location.href,
          userAgent: navigator.userAgent
        };
        
        // Store error in localStorage for troubleshooting
        localStorage.setItem('last_error', JSON.stringify(errorData));
        
        // Log to console for debugging
        console.error('Application error:', errorData);
      } catch (e) {
        // Fallback logging if localStorage is unavailable
        console.error('Error capturing error details:', e);
      }
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Check if a fallback UI was provided
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      // Default fallback UI
      return (
        <div className="p-4 min-h-[60vh] flex flex-col items-center justify-center text-center">
          <div className="bg-amber-900/20 p-4 rounded-lg border border-amber-500/30 max-w-md">
            <h2 className="text-amber-500 text-xl font-bold mb-2">Something went wrong</h2>
            <p className="text-gray-300 mb-4">
              We encountered an error while loading the game. Let&rsquo;s try to fix this!
            </p>
            
            <div className="space-y-2">
              <button 
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 transition-colors rounded-md text-white w-full"
              >
                Refresh Page
              </button>
              
              <button 
                onClick={() => {
                  // Clear localStorage and reload
                  if (typeof window !== 'undefined') {
                    try {
                      // Keep wallet connection data
                      const wagmiStore = localStorage.getItem('wagmi.store');
                      const walletConnected = localStorage.getItem('wallet_last_connected');
                      
                      // Clear other data that might be causing issues
                      localStorage.clear();
                      
                      // Restore wallet data
                      if (wagmiStore) localStorage.setItem('wagmi.store', wagmiStore);
                      if (walletConnected) localStorage.setItem('wallet_last_connected', walletConnected);
                      
                      // Reload the page
                      window.location.reload();
                    } catch (e) {
                      console.error('Error clearing storage:', e);
                      window.location.reload();
                    }
                  }
                }}
                className="px-4 py-2 border border-amber-600 hover:border-amber-500 transition-colors rounded-md text-amber-500 hover:text-amber-400 w-full"
              >
                Clear Data &amp; Reload
              </button>
              
              {this.state.error && (
                <div className="mt-4 p-2 bg-black/50 rounded text-xs text-gray-400 text-left overflow-hidden">
                  <p className="font-mono">{this.state.error.message}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}