'use client';

import { Calendar, CircleDollarSign, Trophy } from 'lucide-react';
import { useAccount } from "wagmi";
import Header from "./shared/Header";
import Footer from "./shared/Footer";
import GameModal from "./game/GameModal";
import ParticleBackground from "./ui/ParticleBackground";
import CustomConnectButton from "./shared/CustomConnectButton";

export default function ClientPage() {
  const { isConnected } = useAccount();

  return (
    <div className="min-h-screen bg-[#0D0D17] relative overflow-hidden">
      <ParticleBackground />
      
      {isConnected ? (
        <>
          <Header />
          <main className="relative flex flex-col items-center justify-center min-h-screen px-4 py-20">
            {/* Connected state content */}
          </main>
          <GameModal />
        </>
      ) : (
        <main className="relative flex flex-col items-center justify-center min-h-screen px-4">
         <div className="relative max-w-4xl mx-auto px-2 sm:px-4 py-6 sm:py-0">
            <div className="absolute inset-0 bg-gradient-to-r from-[#FF3366]/10 via-transparent to-[#FF8C42]/10 blur-3xl pointer-events-none" />
            
            <div className="relative text-center space-y-8">
              <div className="space-y-4">
                <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight">
                  <span className="text-[#E8DED1]">Welcome to</span>
                  <br />
                  <span className="bg-gradient-to-r from-[#FF3366] to-[#FF8C42] text-transparent bg-clip-text">
                    Trivia.Box
                  </span>
                </h1>
                
                <p className="text-lg sm:text-xl lg:text-2xl font-medium text-[#D4A373]">
                  Test your knowledge, earn rewards, and climb the global leaderboard
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 py-8 sm:py-12 animate-fade-in-up" style={{animationDelay: '200ms'}}>
                <div className="p-4 sm:p-6 rounded-2xl bg-[#0D0D17]/90 border border-[#FF3366]/20 shadow-lg shadow-[#FF3366]/5 group hover:border-[#FF3366]/40 transition-all duration-300">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#FF3366]/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <Calendar className="w-6 h-6 text-[#FF3366] group-hover:rotate-12 transition-transform duration-300" />
                    </div>
                    <span className="font-medium text-[#E8DED1]">Daily Challenges</span>
                  </div>
                </div>

                <div className="p-4 sm:p-6 rounded-2xl bg-[#0D0D17]/90 border border-[#FF6B6B]/20 shadow-lg shadow-[#FF6B6B]/5 group hover:border-[#FF6B6B]/40 transition-all duration-300">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#FF6B6B]/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <CircleDollarSign className="w-6 h-6 text-[#FF6B6B] group-hover:rotate-12 transition-transform duration-300" />
                    </div>
                    <span className="font-medium text-[#E8DED1]">Win Rewards</span>
                  </div>
                </div>

                <div className="p-4 sm:p-6 rounded-2xl bg-[#0D0D17]/90 border border-[#FF8C42]/20 shadow-lg shadow-[#FF8C42]/5 group hover:border-[#FF8C42]/40 transition-all duration-300">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#FF8C42]/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <Trophy className="w-6 h-6 text-[#FF8C42] group-hover:rotate-12 transition-transform duration-300" />
                    </div>
                    <span className="font-medium text-[#E8DED1]">Global Rankings</span>
                  </div>
                </div>
              </div>

              <div className="pt-6 flex flex-col items-center gap-2">
                <CustomConnectButton />
                <span className="text-sm text-white/50">Open Beta</span>
              </div>
            </div>
          </div>
        </main>
      )}
      <Footer />
    </div>
  );
}