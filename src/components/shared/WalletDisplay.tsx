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
import WalletDataService from '@/services/wallet/WalletDataService';
import { lookupEnsName, lookupEnsAvatar } from '@/lib/ens';

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
  console.log('WalletButton render with address:', address);
  console.log('WalletButton render with ensName:', ensName);
  console.log('WalletButton render with ensAvatar:', ensAvatar);

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



export default function WalletDisplay({ onAchievementsClick, onLeaderboardOpen }: { onAchievementsClick: () => void, onLeaderboardOpen?: (isOpen: boolean) => void }) {
  const { address } = useAccount();
  
  // Use AppKit state for debugging purposes
  const appkitState = useAppKitState();
  
  // Use the optimized wallet data hook
  const { ensName, ensAvatar, stats, leaderboard, isLoading } = useWalletData(address);
  
  // Direct ENS resolution as backup for when useWalletData fails
  const [directEnsName, setDirectEnsName] = useState<string | null>(null);
  const [directEnsAvatar, setDirectEnsAvatar] = useState<string | null>(null);
  
  // Attempt direct ENS resolution as a fallback
  useEffect(() => {
    let mounted = true;
    
    async function resolveEnsDirectly() {
      if (!address || ensName) return; // Don't run if we have ensName from useWalletData
      
      try {
        // Set environment for correct RPC selection
        if (typeof window !== 'undefined') {
          const isDevelopment = window.location.hostname === 'localhost' || 
                            window.location.hostname === '127.0.0.1';
          (window as any).ENV_TYPE = isDevelopment ? 'development' : 'production';
        }
        
        console.log('Direct ENS resolution attempt for address:', address);
        const name = await lookupEnsName(address);
        
        if (name && mounted) {
          console.log('Direct ENS name resolved:', name);
          setDirectEnsName(name);
          
          // Now try to get avatar
          const avatar = await lookupEnsAvatar(name);
          if (avatar && mounted) {
            console.log('Direct ENS avatar resolved:', avatar);
            setDirectEnsAvatar(avatar);
          }
        }
      } catch (error) {
        console.error('Direct ENS resolution error:', error);
      }
    }
    
    resolveEnsDirectly();
    
    return () => {
      mounted = false;
    };
  }, [address, ensName]);
  
  // Use direct resolution as fallback if useWalletData fails
  const effectiveEnsName = ensName || directEnsName;
  const effectiveEnsAvatar = ensAvatar || directEnsAvatar;
  
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

  // Make achievements and leaderboard mutually exclusive
  useEffect(() => {
    if (showLeaderboard && isAchievementsOpen) {
      // If leaderboard is shown, hide achievements
      setIsAchievementsOpen(false);
    }
  }, [showLeaderboard, isAchievementsOpen]);
  
  // Add a forced refresh on initial render
  useEffect(() => {
    if (address) {
      // Clear any existing ENS cache for this address to force fresh resolution
      console.log('WalletDisplay: Forcing fresh ENS resolution for initial render');
      
      // Small timeout to ensure everything is ready
      const refreshTimer = setTimeout(() => {
        try {
          // Force a refresh of wallet data
          window.dispatchEvent(new CustomEvent('refreshWalletStats'));
        } catch (error) {
          console.error('Error triggering refresh:', error);
        }
      }, 500);
      
      return () => clearTimeout(refreshTimer);
    }
  }, [address]);
  
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
    // Always close achievements first before showing leaderboard
    setIsAchievementsOpen(false);
    
    // Then show leaderboard
    setShowLeaderboard(true);
    window.dispatchEvent(new CustomEvent('hideGameSettings'));
    
    // Notify parent component about leaderboard state change
    if (onLeaderboardOpen) {
      onLeaderboardOpen(true);
    }
  }, [onLeaderboardOpen]);

  if (!address) return null;

  return (
    <div className="flex flex-col">
      {/* Top Navigation Bar with Logo and Wallet */}
      <div className="flex items-center justify-between mb-2">
        {/* Wallet Button - DO NOT WRAP THIS */}
        <WalletButton 
          address={address}
          ensName={effectiveEnsName}
          ensAvatar={effectiveEnsAvatar}
          handleClick={handleClick}
          handleImageError={handleImageError}
        />

        {/* Hidden debug button for ENS data refresh (only in development environment) */}
        {typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
          <button
            onClick={() => {
              console.log('Manually refreshing wallet data');
              if (WalletDataService.getInstance) {
                WalletDataService.getInstance().invalidateCache(address);
              }
              window.dispatchEvent(new CustomEvent('refreshWalletStats'));
            }}
            className="text-xs text-gray-600 hover:text-amber-400 absolute -bottom-4 left-0"
          >
            (Debug: Refresh)
          </button>
        )}

        {/* Logo */}
        <div className="text-center">
          <h1 className="text-xl md:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-orange-600">
            Trivia Box
          </h1>
        </div>

        {/* Achievements button */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            // First close leaderboard if it's open
            if (showLeaderboard) {
              setShowLeaderboard(false);
              if (onLeaderboardOpen) {
                onLeaderboardOpen(false);
              }
            }
            
            // Let parent handle the achievements opening logic
            onAchievementsClick();
          }}
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

      {/* Stats Bar - Using the optimized memoized component */}
      <StatsDisplay 
        stats={stats} 
        isLoading={isLoading} 
        onRankClick={handleShowLeaderboard}
        hasLeaderboard={leaderboard.length > 0}
      />

      {/* Modals */}
      {isAchievementsOpen && address && (
        <AchievementsDropdown 
          isOpen={isAchievementsOpen} 
          onClose={() => {
            // First close achievements in local state
            setIsAchievementsOpen(false);
            
            // Then dispatch event to show game settings
            window.dispatchEvent(new CustomEvent('showGameSettings'));
          }}
          walletAddress={address}
        />
      )}

      {showLeaderboard && (
        <LeaderboardModal
          isOpen={showLeaderboard}
          onClose={() => {
            // First update local state
            setShowLeaderboard(false);
            
            // Then show game settings
            window.dispatchEvent(new CustomEvent('showGameSettings'));
            
            // Notify parent component about leaderboard state change
            if (onLeaderboardOpen) {
              onLeaderboardOpen(false);
            }
          }}
          leaderboard={leaderboard}
          currentUserAddress={address}
        />
      )}
    </div>
  );
}