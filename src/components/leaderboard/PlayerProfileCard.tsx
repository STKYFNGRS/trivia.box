'use client';

import React from 'react';
import { ProfileCard } from 'ethereum-identity-kit';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';

interface PlayerProfileCardProps {
  addressOrName: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function PlayerProfileCard({ addressOrName, isOpen, onClose }: PlayerProfileCardProps) {
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
            
            <ProfileCard 
              addressOrName={addressOrName}
              darkMode={true}
              className="mx-auto"
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}