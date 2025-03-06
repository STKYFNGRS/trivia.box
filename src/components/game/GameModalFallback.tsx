'use client';
import React from 'react';
import LoadingAnimation from '@/components/ui/LoadingAnimation';

export default function GameModalFallback() {
  return (
    <div className="fixed inset-0 z-50">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="relative w-full max-w-5xl mt-28 pt-16 md:pt-10 md:mt-24">
          <div className="rounded-2xl bg-gradient-to-br from-gray-900/90 to-gray-800/90 p-8 backdrop-blur-lg border border-amber-500/20 overflow-hidden flex flex-col h-[600px] justify-center items-center">
            <LoadingAnimation isLoading={true} />
            <p className="text-amber-500 mt-4 font-medium">Loading game...</p>
          </div>
          <div className="fixed inset-0 -z-10 bg-black/70 backdrop-blur-sm" />
        </div>
      </div>
    </div>
  );
}
