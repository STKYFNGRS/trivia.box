'use client';

import React, { useState } from 'react';
import { ProfileCard } from 'ethereum-identity-kit';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';

interface PlayerProfileCardProps {
  addressOrName: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function PlayerProfileCard({ addressOrName, isOpen, onClose }: PlayerProfileCardProps) {
  const [isError, setIsError] = useState(false);
  
  // Early return if not open
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative min-h-screen flex items-center justify-center py-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-md mx-auto"
        >
          <div className="rounded-xl overflow-hidden relative shadow-xl">
            {/* Close button positioned absolutely */}
            <button
              onClick={onClose}
              className="absolute z-50 rounded-full w-7 h-7 flex items-center justify-center bg-gray-800/80 hover:bg-gray-700/90 text-white transition-colors border border-gray-700"
              style={{ 
                top: '3px', 
                right: '32px' 
              }}
              aria-label="Close profile"
            >
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
            
            <ErrorBoundary fallback={
              <div className="p-8 bg-gray-900 text-center">
                <h3 className="text-xl font-bold text-white mb-2">Error Loading Profile</h3>
                <p className="text-gray-300 mb-4">There was a problem loading this profile.</p>
                <div className="w-24 h-24 rounded-full bg-gray-800 mx-auto mb-4 flex items-center justify-center">
                  <span className="text-2xl text-amber-500">
                    {addressOrName && addressOrName.startsWith('0x') 
                      ? addressOrName.slice(2, 4).toUpperCase() 
                      : addressOrName.slice(0, 1).toUpperCase()}
                  </span>
                </div>
                <p className="text-gray-400 break-all">
                  {addressOrName}
                </p>
              </div>
            }>
              <ProfileCard 
                addressOrName={addressOrName}
                darkMode={true}
                className="mx-auto"
              />
            </ErrorBoundary>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// Simple error boundary component for catching render errors
function ErrorBoundary({ children, fallback }: { children: React.ReactNode, fallback: React.ReactNode }) {
  const [hasError, setHasError] = useState(false);
  
  if (hasError) {
    return <>{fallback}</>;
  }
  
  return (
    <React.Suspense fallback={
      <div className="p-8 bg-gray-900 flex items-center justify-center">
        <div className="animate-spin h-10 w-10 border-4 border-amber-500 border-t-transparent rounded-full"></div>
      </div>
    }>
      <ErrorCatcher setHasError={setHasError}>
        {children}
      </ErrorCatcher>
    </React.Suspense>
  );
}

// Helper component to catch errors
class ErrorCatcher extends React.Component<{ 
  children: React.ReactNode, 
  setHasError: (hasError: boolean) => void 
}> {
  componentDidCatch(error: Error) {
    console.error("Error in ProfileCard:", error);
    this.props.setHasError(true);
  }
  
  render() {
    return this.props.children;
  }
}