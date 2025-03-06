'use client';

import React, { ReactNode, useEffect } from 'react';
import { Toaster } from 'sonner';
import { useAchievementNotifications } from '@/hooks/useAchievementNotifications';

interface AchievementProviderProps {
  children: ReactNode;
}

export default function AchievementProvider({ children }: AchievementProviderProps) {
  // Initialize achievement notification listener
  useAchievementNotifications();
  
  return (
    <>
      {children}
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 5000,
          className: "bg-gradient-to-br from-gray-900/90 to-gray-800/70 backdrop-blur-md border border-amber-500/40"
        }}
      />
    </>
  );
}