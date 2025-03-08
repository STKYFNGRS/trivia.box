'use client';
import { useAccount } from 'wagmi';
import WalletDisplay from './WalletDisplay';

interface HeaderProps {
  onAchievementsClick: () => void;
  onLeaderboardOpen?: (isOpen: boolean) => void;
}

export default function Header({ onAchievementsClick, onLeaderboardOpen }: HeaderProps) {
  const { isConnected } = useAccount();
  
  if (!isConnected) return null;

  return (
    <header className="fixed top-0 left-0 right-0 z-30 safe-top">
      {/* Using a solid background color that matches the visual appearance in screenshots */}
      <div className="bg-[#171923] border-b border-amber-600/20 hardware-accelerated">
        <div className="container mx-auto px-2 sm:px-4 py-2">
          <WalletDisplay onAchievementsClick={onAchievementsClick} onLeaderboardOpen={onLeaderboardOpen} />
        </div>
      </div>
    </header>
  );
}
