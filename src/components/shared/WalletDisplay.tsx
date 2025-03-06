'use client';
import { useState, useCallback, useEffect, memo } from 'react';
import { useAccount } from 'wagmi';
import { modal } from '@/config/appkit';
import { useAppKitState } from '@reown/appkit/react';
import { Award } from 'lucide-react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import useWalletData from '@/hooks/useWalletData';
import StatsDisplay from './StatsDisplay';

// Dynamically load modal components to reduce initial bundle size
const AchievementsDropdown = dynamic(() => import('../achievements/AchievementsDropdown'), {
  ssr: false
});

const LeaderboardModal = dynamic(() => import('../leaderboard/LeaderboardModal'), {
  ssr: false
});

interface WalletDisplayProps {
  onAchievementsClick: () => void;
}

// Memoize the wallet button to prevent unnecessary re-renders
const WalletButton = memo(({ 
  address, 
  ensName, 
  ensAvatar, 
  handleClick, 
  handleImageError 
}: { 
  address: string;
  ensName: string | null;
  ensAvatar: string | null;
  handleClick: () => void;
  handleImageError: (event: React.SyntheticEvent<HTMLImageElement>) => void;
}) => {
  // Format address display
  const displayName = ensName || (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : null);

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#1a1c2b] hover:bg-[#252838] transition-all border border-amber-600/20 hover:border-amber-600/40 group"
    >
      <div className="w-7 h-7 rounded-full overflow-hidden bg-[#1a1c2b] flex items-center justify-center ring-2 ring-amber-600/20 group-hover:ring-amber-600/40 transition-all">
        {ensAvatar ? (
          <>
            <Image
              src={ensAvatar}
              alt={displayName || address || ''}
              width={32}
              height={32}
              className="w-full h-full object-cover"
              onError={handleImageError}
              referrerPolicy="no-referrer"
              unoptimized
            />
            <span className="text-sm text-purple-300 hidden">
              {address?.slice(2, 4).toUpperCase()}
            </span>
          </>
        ) : ensName ? (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-r from-amber-600 to-orange-600 text-gray-900 font-medium">
            {ensName.slice(0, 1).toUpperCase()}
          </div>
        ) : (
          <span className="text-sm text-amber-500">
            {address?.slice(2, 4).toUpperCase()}
          </span>
        )}
      </div>
      <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">
        {displayName || `${address.slice(0, 6)}...${address.slice(-4)}`}
      </span>
    </button>
  );
});

WalletButton.displayName = 'WalletButton';

// Memoize the rank button to prevent unnecessary re-renders
const RankButton = memo(({ 
  rank, 
  onClick 
}: { 
  rank: number; 
  onClick: () => void;
}) => (
  <div 
    className="px-2 sm:px-3 py-1.5 rounded-xl bg-[#1a1c2b] hover:bg-[#252838] border border-amber-600/20 hover:border-amber-600/40 transition-all flex items-center cursor-pointer" 
    onClick={onClick}
  >
    <span className="text-gray-300 text-xs sm:text-sm mr-1 hidden sm:inline">Rank</span>
    <span className="text-amber-500 font-bold text-sm">#{rank}</span>
  </div>
));

RankButton.displayName = 'RankButton';

export default function WalletDisplay({ onAchievementsClick }: WalletDisplayProps) {
  const { address } = useAccount();
  
  // Use AppKit state for debugging purposes
  const appkitState = useAppKitState();
  
  // Use the optimized wallet data hook
  const { ensName, ensAvatar, stats, leaderboard, isLoading } = useWalletData(address);
  
  // Modal visibility states
  const [isAchievementsOpen, setIsAchievementsOpen] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  
  // Handle image loading error
  const handleImageError = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    console.warn('Avatar image failed to load, using fallback');
    
    event.currentTarget.style.display = 'none';
    const nextSibling = event.currentTarget.nextSibling as HTMLElement;
    if (nextSibling) {
      nextSibling.style.display = 'block';
    }
  }, []);
  
  // Handler for wallet button click
  const handleClick = useCallback(async () => {
    try {
      await modal.open();
    } catch (error) {
      console.error('Failed to open modal:', error);
    }
  }, []);

  // Show leaderboard handler
  const handleShowLeaderboard = useCallback(() => {
    setShowLeaderboard(true);
    window.dispatchEvent(new CustomEvent('hideGameSettings'));
  }, []);

  if (!address) return null;

  return (
    <div className="flex flex-col">
      {/* Top Navigation Bar with Logo and Wallet */}
      <div className="flex items-center justify-between mb-2">
        {/* Wallet Button - DO NOT WRAP THIS */}
        <WalletButton 
          address={address}
          ensName={ensName}
          ensAvatar={ensAvatar}
          handleClick={handleClick}
          handleImageError={handleImageError}
        />

        {/* Logo */}
        <div className="text-center">
          <h1 className="text-xl md:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-orange-600">
            Trivia Box
          </h1>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {/* Only show rank button when we have leaderboard data */}
          {leaderboard.length > 0 && (
            <RankButton 
              rank={stats?.rank || 1} 
              onClick={handleShowLeaderboard} 
            />
          )}
          
          {/* Achievements button */}
          <div
            role="button"
            tabIndex={0}
            onClick={onAchievementsClick}
            onKeyDown={(e) => e.key === 'Enter' && onAchievementsClick()}
            className={cn(
              "flex items-center justify-center px-2 py-1.5 rounded-xl cursor-pointer",
              "bg-[#1a1c2b] hover:bg-[#252838] transition-all",
              "border border-amber-600/20 hover:border-amber-600/40",
              "text-amber-500 hover:text-amber-400"
            )}
          >
            <Award className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Stats Bar - Using the optimized memoized component */}
      <StatsDisplay stats={stats} isLoading={isLoading} />

      {/* Modals */}
      {isAchievementsOpen && address && (
        <AchievementsDropdown 
          isOpen={isAchievementsOpen} 
          onClose={() => {
            setIsAchievementsOpen(false);
            window.dispatchEvent(new CustomEvent('showGameSettings'));
          }}
          walletAddress={address}
        />
      )}

      {showLeaderboard && (
        <LeaderboardModal
          isOpen={showLeaderboard}
          onClose={() => {
            setShowLeaderboard(false);
            window.dispatchEvent(new CustomEvent('showGameSettings'));
          }}
          leaderboard={leaderboard}
          currentUserAddress={address}
        />
      )}
    </div>
  );
}