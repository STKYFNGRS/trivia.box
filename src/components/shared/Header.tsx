'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import WalletDisplay from './WalletDisplay';
import { modal } from '@/context';

interface LeaderboardEntry {
  rank: number;
  address: string;
  points: number;
}

const mockLeaderboard: LeaderboardEntry[] = [
  { rank: 1, address: "0x1234...5678", points: 2500 },
  { rank: 2, address: "0xabcd...efgh", points: 2350 },
  { rank: 3, address: "0x8765...4321", points: 2200 },
  { rank: 4, address: "0xffff...9999", points: 2150 },
  { rank: 5, address: "0xaaaa...bbbb", points: 2100 },
  { rank: 6, address: "0x1111...2222", points: 2050 },
  { rank: 7, address: "0x3333...4444", points: 2000 },
  { rank: 8, address: "0x5555...6666", points: 1950 },
  { rank: 9, address: "0x7777...8888", points: 1900 },
  { rank: 10, address: "0x9999...0000", points: 1850 }
];

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 p-2 sm:p-6 z-50">
      <div className="max-w-8xl mx-auto">
        <div className="relative bg-[#0D1117]/90 rounded-xl sm:rounded-2xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden backdrop-blur-xl">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-5" />
          
          {/* Mobile View */}
          <div className="sm:hidden relative p-3">
            <div className="flex items-center justify-between">
              <div className="text-xl font-bold text-white">Trivia Box</div>
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors"
              >
                <Menu className="w-6 h-6 text-white" />
              </button>
            </div>
            
            {isMenuOpen && (
              <div className="mt-4 space-y-4">
                <div className="space-y-4">
                  <WalletDisplay />
                  <div className="grid grid-cols-2 gap-2">
                    <StatsCard icon={<path d="M13 10V3L4 14h7v7l9-11h-7z" />} label="Score" value="0 Points" color="yellow" />
                    <StatsCard icon={<path d="M9 12l2 2 4-4m5.6-4A12 12 0 0 0 12 2.9 12 12 0 0 0 3 9c0 5.6 3.8 10.3 9 11.6C17.2 19.3 21 14.6 21 9c0-1-.1-2.1-.4-3" />} label="Rank" value="#1" color="purple" />
                    <StatsCard icon={<path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />} label="Streak" value="3 Wins" color="green" />
                    <StatsCard icon={<path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />} label="Next Game" value="23:45" color="orange" />
                  </div>
                </div>
                <div className="bg-black/20 rounded-xl border border-white/5 p-3">
                  <LeaderboardContent />
                </div>
              </div>
            )}
          </div>

          {/* Desktop View */}
          <div className="hidden sm:block relative p-6">
            <div className="flex justify-between gap-8">
              <div className="text-2xl font-bold text-white">Trivia Box</div>

              <div className="flex-1 flex justify-between gap-8">
                {/* Stats Panel */}
                <div className="flex-1 flex items-start gap-8 bg-black/20 rounded-xl border border-white/5 p-4">
                  <div onClick={() => modal.open()} className="cursor-pointer transition-transform hover:scale-105">
                    <WalletDisplay />
                  </div>
                  
                  <div className="flex-1 grid grid-cols-2 gap-4">
                    <StatsCard icon={<path d="M13 10V3L4 14h7v7l9-11h-7z" />} label="Score" value="0 Points" color="yellow" />
                    <StatsCard icon={<path d="M9 12l2 2 4-4m5.6-4A12 12 0 0 0 12 2.9 12 12 0 0 0 3 9c0 5.6 3.8 10.3 9 11.6C17.2 19.3 21 14.6 21 9c0-1-.1-2.1-.4-3" />} label="Rank" value="#1" color="purple" />
                    <StatsCard icon={<path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />} label="Streak" value="3 Wins" color="green" />
                    <StatsCard icon={<path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />} label="Next Game" value="23:45" color="orange" />
                  </div>
                </div>

                {/* Leaderboard Panel */}
                <div className="bg-black/20 rounded-xl border border-white/5 p-4 min-w-[400px]">
                  <LeaderboardContent />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function LeaderboardContent() {
  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span className="text-sm font-medium text-white">Top Players</span>
      </div>
      <div className="grid grid-cols-2 gap-x-12 gap-y-2">
        {mockLeaderboard.map((entry) => (
          <div key={entry.rank} className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span className={`min-w-[1.5rem] text-right ${
                entry.rank === 1 ? 'text-yellow-400' : 
                entry.rank === 2 ? 'text-gray-400' : 
                entry.rank === 3 ? 'text-amber-700' : 
                'text-gray-500'}`}>
                {entry.rank}
              </span>
              <span className="text-gray-400 text-xs sm:text-sm">{entry.address}</span>
            </div>
            <span className="text-white font-medium text-xs sm:text-sm">{entry.points}</span>
          </div>
        ))}
      </div>
    </>
  );
}

interface StatsCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: 'yellow' | 'purple' | 'green' | 'orange';
}

function StatsCard({ icon, label, value, color }: StatsCardProps) {
  const colors = {
    yellow: 'bg-yellow-500/10 text-yellow-400',
    purple: 'bg-purple-500/10 text-purple-400',
    green: 'bg-green-500/10 text-green-400',
    orange: 'bg-orange-500/10 text-orange-400',
  };

  return (
    <div className={`px-3 py-2 bg-black/20 rounded-lg border border-white/5 hover:border-${color}-500/20 transition-colors`}>
      <div className="flex items-center gap-2">
        <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md ${colors[color]} flex items-center justify-center`}>
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}>
            {icon}
          </svg>
        </div>
        <div>
          <div className="text-xs text-gray-400">{label}</div>
          <div className="text-xs sm:text-sm font-medium text-white">{value}</div>
        </div>
      </div>
    </div>
  );
}