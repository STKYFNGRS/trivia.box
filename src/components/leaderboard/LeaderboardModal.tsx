'use client';

import React, { useState, useEffect, useMemo } from 'react';
import PlayerProfileCard from './PlayerProfileCard';
import { X, Trophy, ExternalLink, Copy, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { lookupEnsName, lookupEnsAvatar } from '@/lib/ens';
import { getPrefetchedEns } from '@/lib/ens/prefetch';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  leaderboard: Array<{
    rank: number;
    address: string;
    points: number;
  }>;
  currentUserAddress?: string;
}

interface ENSProfile {
  address: string;
  name: string | null;
  avatar: string | null;
  description?: string | null;
  twitter?: string | null;
  github?: string | null;
  keybase?: string | null;
  telegram?: string | null;
  discord?: string | null;
  reddit?: string | null;
  url?: string | null;
  dweb?: string | null;
}

export default function LeaderboardModal({ isOpen, onClose, leaderboard, currentUserAddress }: LeaderboardModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerProfiles, setPlayerProfiles] = useState<Record<string, ENSProfile>>({});
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  // Display only 5 players at a time with scrolling
  const pageSize = 5;
  const [visibleLeaderboard, setVisibleLeaderboard] = useState<typeof leaderboard>([]);
  const [currentPage, setCurrentPage] = useState(0);

  // Load ENS profiles for players - more efficient version
  useEffect(() => {
    if (!isOpen || leaderboard.length === 0) return;
    
    setIsLoading(true);
    setError(null);
    
    // Initialize empty profiles for all addresses immediately to prevent UI jumps
    const initialProfiles: Record<string, ENSProfile> = {};
    leaderboard.forEach(entry => {
      initialProfiles[entry.address] = {
        address: entry.address,
        name: null,
        avatar: null
      };
    });
    
    // Initialize with any prefetched data
    leaderboard.forEach(entry => {
      const prefetched = getPrefetchedEns(entry.address);
      if (prefetched) {
        initialProfiles[entry.address] = {
          address: entry.address,
          name: prefetched.name,
          avatar: prefetched.avatar
        };
      }
    });
    
    setPlayerProfiles(initialProfiles);
    
    // Only load top 3 players immediately, queue the rest
    const addresses = leaderboard.map(entry => entry.address);
    const topAddresses = addresses.slice(0, 3);
    const remainingAddresses = addresses.slice(3);
    
    let isMounted = true;
    
    const loadProfiles = async () => {
      try {
        // Load top players first (in parallel)
        if (topAddresses.length > 0) {
          const topPromises = topAddresses.map(async (address) => {
            try {
              // Skip if we already have data from prefetch
              if (initialProfiles[address]?.name) return address;
              
              const name = await lookupEnsName(address);
              
              if (name && isMounted) {
                setPlayerProfiles(prev => ({
                  ...prev,
                  [address]: {
                    ...prev[address],
                    name
                  }
                }));
                
                // Then load avatar in background
                lookupEnsAvatar(name).then(avatar => {
                  if (avatar && isMounted) {
                    setPlayerProfiles(prev => ({
                      ...prev,
                      [address]: {
                        ...prev[address],
                        avatar
                      }
                    }));
                  }
                }).catch(() => {/* Silently fail */});
              }
            } catch (error) {
              // Silently fail for individual address
            }
            return address;
          });
          
          await Promise.all(topPromises);
        }
        
        // Then load remaining players with limited concurrency
        if (remainingAddresses.length > 0 && isMounted) {
          // Process three at a time
          const concurrentBatch = 3;
          
          for (let i = 0; i < remainingAddresses.length; i += concurrentBatch) {
            if (!isMounted) break;
            
            const batch = remainingAddresses.slice(i, i + concurrentBatch);
            await Promise.all(batch.map(async (address) => {
              try {
                // Skip if we already have data from prefetch
                if (initialProfiles[address]?.name) return address;
                
                const name = await lookupEnsName(address);
                
                if (name && isMounted) {
                  setPlayerProfiles(prev => ({
                    ...prev,
                    [address]: {
                      ...prev[address],
                      name
                    }
                  }));
                }
              } catch (error) {
                // Silently fail for individual address
              }
              return address;
            }));
            
            // Small delay between batches to prevent overwhelming the network
            if (i + concurrentBatch < remainingAddresses.length) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
        }
      } catch (err) {
        console.error('Error loading ENS profiles:', err);
        if (isMounted) {
          setError('Failed to load player profiles');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    
    loadProfiles();
    
    return () => {
      isMounted = false;
    };
  }, [isOpen, leaderboard]);

  const sortedLeaderboard = useMemo(() => {
    return [...leaderboard].sort((a, b) => a.rank - b.rank);
  }, [leaderboard]);

  useEffect(() => {
    // Update visible leaderboard
    setVisibleLeaderboard(sortedLeaderboard);
  }, [sortedLeaderboard]);

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="flex min-h-screen items-center justify-center p-4">
        <motion.div
          key="leaderboard-panel"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-4xl mt-28 pt-16 md:pt-10 md:mt-24"
        >
          <div className="rounded-2xl bg-gradient-to-br from-gray-900/90 to-gray-800/90 p-6 backdrop-blur-lg border border-amber-500/20 max-h-[70vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="mb-6 flex items-center">
              <div className="flex items-center gap-3 justify-center w-full relative">
                <Trophy className="h-6 w-6 text-amber-400" />
                <h2 className="text-xl font-bold text-white">Global Rankings</h2>
              </div>
              <div className="absolute right-0 top-0">
                <button
                  onClick={() => {
                    // Close both the PlayerProfileCard and LeaderboardModal
                    setSelectedPlayer(null);
                    onClose();
                    // Dispatch event to show game settings
                    window.dispatchEvent(new CustomEvent('showGameSettings'));
                  }}
                  className="rounded-lg p-1.5 text-amber-400 transition-colors hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Leaderboard Table */}
            <div className="overflow-y-auto pr-2 pb-2 flex-1 custom-scrollbar">
              {isLoading ? (
                <div className="py-8 text-center text-purple-300">
                  <div className="flex flex-col items-center space-y-3">
                    <div className="animate-spin rounded-full h-10 w-10 border-4 border-purple-500 border-t-transparent"></div>
                    <span>Loading global rankings...</span>
                  </div>
                </div>
              ) : error ? (
                <div className="py-8 text-center text-red-400 bg-red-900/20 backdrop-blur-md rounded-xl border border-red-500/20 p-4">
                  <div className="flex flex-col items-center space-y-2">
                    <X className="h-6 w-6" />
                    <span>{error}</span>
                    <button onClick={() => window.location.reload()} className="px-3 py-1 rounded-lg bg-red-800/20 hover:bg-red-800/40 border border-red-500/20 text-sm mt-2">
                      Retry
                    </button>
                  </div>
                </div>
              ) : sortedLeaderboard.length === 0 ? (
                <div className="py-8 text-center text-purple-300 bg-purple-900/20 backdrop-blur-md rounded-xl border border-purple-500/20 p-4">
                  <div className="flex flex-col items-center space-y-2">
                    <Trophy className="h-6 w-6 opacity-50" />
                    <span>No rankings found</span>
                    <span className="text-sm text-gray-400">Play more games to appear on the leaderboard!</span>
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-gray-700/40">
                  <table className="min-w-full divide-y divide-gray-700/40">
                    <thead className="bg-gray-900/60">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Rank</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Player</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Score</th>
                      </tr>
                    </thead>
                    <tbody className="bg-gray-900/30 divide-y divide-gray-700/40">
                      {sortedLeaderboard.map((player) => (
                        <tr 
                          key={player.address}
                          className={cn(
                            "hover:bg-gray-800/30 transition-colors relative cursor-pointer",
                            player.address === currentUserAddress && "bg-amber-900/10 hover:bg-amber-900/20"
                          )}
                          onClick={() => setSelectedPlayer(playerProfiles[player.address]?.name || player.address)}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <span className={cn(
                                "text-sm font-medium",
                                player.rank === 1 ? "text-yellow-500" :
                                player.rank === 2 ? "text-gray-400" :
                                player.rank === 3 ? "text-amber-600" :
                                "text-gray-300"
                              )}>
                                {player.rank === 1 && "🥇 "}
                                {player.rank === 2 && "🥈 "}
                                {player.rank === 3 && "🥉 "}
                                {player.rank}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-800/80 flex items-center justify-center ring-2 ring-amber-600/20 mr-3">
                                {playerProfiles[player.address]?.avatar ? (
                                  <Image
                                    src={playerProfiles[player.address].avatar!}
                                    alt={playerProfiles[player.address].name || formatAddress(player.address)}
                                    width={32}
                                    height={32}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                    unoptimized
                                  />
                                ) : playerProfiles[player.address]?.name ? (
                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-r from-amber-600 to-orange-600 text-gray-900 font-medium">
                                      {playerProfiles[player.address]?.name?.slice(0, 1).toUpperCase() || "?"}  
                                    </div>
                                ) : (
                                  <span className="text-sm text-amber-500">
                                    {player.address.slice(2, 4).toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-medium text-white">
                                  {playerProfiles[player.address]?.name || formatAddress(player.address)}
                                </span>
                                {playerProfiles[player.address]?.name && (
                                  <span className="text-xs text-gray-400">
                                    {formatAddress(player.address)}
                                  </span>
                                )}
                              </div>
                              
                              <div className="ml-2 flex space-x-1">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyAddress(player.address);
                                  }}
                                  className="text-gray-400 hover:text-amber-400 transition-colors"
                                  title="Copy address"
                                >
                                  {copiedAddress === player.address ? (
                                    <Check className="h-4 w-4" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </button>
                                <a 
                                  href={`https://etherscan.io/address/${player.address}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-gray-400 hover:text-amber-400 transition-colors"
                                  title="View on Etherscan"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <span className="text-lg font-bold text-amber-500">{player.points.toLocaleString()}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Information about ENS */}
            <div className="mt-6 p-4 rounded-lg bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-amber-600/10">
              <h3 className="text-lg font-semibold text-amber-400 mb-2">Ethereum Name Service (ENS)</h3>
              <p className="text-sm text-gray-300 mb-2">
                ENS provides human-readable names for cryptocurrency addresses and lets users set up public profiles. Your ENS profile will display your name, avatar, and social links on the leaderboard. Select a user name above and click on their folower count to view their <a href="https://efp.app/" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 underline">Ethereum Follow Protocol</a> information.
              </p>
              <div className="flex flex-col items-center mt-3 space-y-2">
                <span className="text-sm text-gray-300">Don&apos;t have an ENS name yet?</span>
                <a 
                  href="https://app.ens.domains" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-center w-full max-w-xs text-sm px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 text-gray-900 font-semibold rounded-md hover:shadow-md hover:shadow-amber-600/25 transition-all transform hover:scale-105"
                >
                  Get your ENS name
                </a>
              </div>
            </div>

            {/* Player Profile Card */}
            {selectedPlayer && (
              <PlayerProfileCard
                addressOrName={selectedPlayer}
                isOpen={!!selectedPlayer}
                onClose={() => setSelectedPlayer(null)}
              />
            )}

            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 -z-10 bg-black/70 backdrop-blur-sm"
              onClick={() => {
                setSelectedPlayer(null);
                onClose();
                window.dispatchEvent(new CustomEvent('showGameSettings'));
              }}
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}