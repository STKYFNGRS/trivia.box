'use client';

import { useWeb3Modal } from '@web3modal/wagmi/react';
import WalletDisplay from './WalletDisplay';

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
  const { open } = useWeb3Modal();

  return (
    <header className="fixed top-0 left-0 right-0 p-6 z-50">
      <div className="max-w-7xl mx-auto">
        <div className="relative bg-[#0D1117]/90 rounded-2xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden backdrop-blur-xl">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-5" />
          
          <div className="relative px-6 py-4">
            <div className="flex items-center justify-between gap-6">
              {/* Left Section - Logo */}
              <div className="flex flex-col">
                <div className="text-2xl font-bold text-white">Trivia Box</div>

              </div>

              {/* Center Section - Stats Grid */}
              <div className="grid grid-cols-2 gap-4 min-w-[400px]">
                <div className="px-4 py-2 bg-black/20 rounded-lg border border-white/5 hover:border-yellow-500/20 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-yellow-500/10 flex items-center justify-center">
                      <svg className="w-3 h-3 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Score</div>
                      <div className="text-sm font-medium text-white">0 Points</div>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-2 bg-black/20 rounded-lg border border-white/5 hover:border-purple-500/20 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-purple-500/10 flex items-center justify-center">
                      <svg className="w-3 h-3 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Rank</div>
                      <div className="text-sm font-medium text-white">#1</div>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-2 bg-black/20 rounded-lg border border-white/5 hover:border-green-500/20 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-green-500/10 flex items-center justify-center">
                      <svg className="w-3 h-3 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Streak</div>
                      <div className="text-sm font-medium text-white">3 Wins</div>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-2 bg-black/20 rounded-lg border border-white/5 hover:border-orange-500/20 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-orange-500/10 flex items-center justify-center">
                      <svg className="w-3 h-3 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Next Game</div>
                      <div className="text-sm font-medium text-white">23:45</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Section - Leaderboard & Profile */}
              <div className="flex items-center gap-6">
                {/* Leaderboard */}
                <div className="px-4 py-3 bg-black/20 rounded-xl border border-white/5">
                  <div className="mb-2">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span className="text-sm font-medium text-white">Top Players</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-12 gap-y-2">
                    {mockLeaderboard.map((entry) => (
                      <div key={entry.rank} className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 text-sm">
                          <span className={`min-w-[1rem] text-right ${
                            entry.rank === 1 ? 'text-yellow-400' : 
                            entry.rank === 2 ? 'text-gray-400' : 
                            entry.rank === 3 ? 'text-amber-700' : 
                            'text-gray-500'}`}>
                            {entry.rank}
                          </span>
                          <span className="text-gray-400">{entry.address}</span>
                        </div>
                        <span className="text-white font-medium text-sm">{entry.points}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Profile */}
                <div onClick={() => open()} className="cursor-pointer transition-transform hover:scale-105">
                  <WalletDisplay />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}