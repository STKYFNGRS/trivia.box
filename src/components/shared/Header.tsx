'use client';
import { useAccount } from 'wagmi';
import EnhancedWalletDisplay from './EnhancedWalletDisplay';

interface HeaderProps {
  onAchievementsClick: () => void;
  onLeaderboardOpen?: (isOpen: boolean) => void;
}

export default function Header({ onAchievementsClick, onLeaderboardOpen }: HeaderProps) {
  const { isConnected } = useAccount();
  
  if (!isConnected) return null;

  return (
    <header className="fixed top-0 left-0 right-0 z-30 safe-top">
      {/* Black overlay backdrop similar to the game options modal */}
      <div className="absolute inset-0 -z-10 bg-black/70 backdrop-blur-sm"></div>
      <div className="border-b border-amber-600/20 hardware-accelerated">
        <div className="container mx-auto px-2 sm:px-4 py-2">
          <EnhancedWalletDisplay onAchievementsClick={onAchievementsClick} onLeaderboardOpen={onLeaderboardOpen} />
        </div>
      </div>
    </header>
  );
}
