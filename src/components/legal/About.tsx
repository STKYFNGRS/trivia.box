import React from 'react';

interface AboutProps {
  onClose: () => void;
}

export default function About({ onClose }: AboutProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}></div>
      <div 
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl border border-amber-600/20 bg-gradient-to-br from-gray-900/90 to-gray-800/90 p-6 shadow-xl"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-gray-400 hover:bg-gray-800/50 hover:text-amber-600 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <h2 className="text-2xl font-bold text-amber-500 mb-6">About Trivia.Box</h2>
        
        <div className="text-gray-300 space-y-6">
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">Our Mission</h3>
            <p>
              Trivia.Box is on a mission to revolutionize online trivia games by combining the excitement of 
              competitive knowledge challenges with web3 technology. We believe learning should be fun and rewarding, 
              and we&apos;re creating a platform where curious minds can test their knowledge while earning real rewards.
            </p>
          </section>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">How It Works</h3>
            <p>
              Trivia.Box offers daily challenges across multiple categories, from technology and science to pop culture 
              and sports. Players can customize their game experience by selecting the number of questions, difficulty level, 
              and preferred categories.
            </p>
            <p>
              Our global leaderboard lets you compete with players worldwide, while our reward system lets you earn tokens 
              and NFTs based on your knowledge and quick responses.
            </p>
          </section>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">Players Share in Our Success</h3>
            <p>
              Trivia.Box operates on a revolutionary principle: <span className="text-amber-300 font-medium">the players who make our game great deserve to share in its success</span>. 
              Unlike traditional platforms that keep all advertising revenue, we've created a groundbreaking economic model that directly rewards our community.
            </p>
            <p>
              When you see ads on Trivia.Box, that revenue doesn't just go to our bottom line—it's systematically used to provide{' '}
              <span className="text-amber-300 font-medium">real equity value to our token ecosystem</span>. This means every question you answer 
              and every game you play not only tests your knowledge but also contributes to a growing token pool that flows back to our players.
            </p>
            <p>
              Through this player-first approach, your trivia skills translate into tangible rewards. The better you perform, the more you earn—creating 
              a virtuous cycle where your entertainment directly benefits you. It's not just about playing a game; it's about being a stakeholder 
              in a community where <span className="text-amber-300 font-medium">your participation has real value</span>.
            </p>
            <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/30 p-3 rounded-lg border border-amber-600/30 mt-2">
              <p className="text-amber-300 font-medium">In short: When Trivia.Box succeeds, you succeed. Your knowledge isn't just tested—it's rewarded.</p>
            </div>
          </section>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">Web3 Integration</h3>
            <p>
              By connecting your wallet, you can:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Securely track your progress and achievements</li>
              <li>Earn and collect exclusive NFTs</li>
              <li>Receive tokens for correct answers and win streaks</li>
              <li>Participate in special blockchain-themed trivia challenges</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">Our Team</h3>
            <p>
              Trivia.Box was founded by a team of trivia enthusiasts and blockchain developers who wanted to 
              create an engaging and rewarding educational platform. Our diverse team brings together expertise in 
              game design, blockchain technology, and educational content creation.
            </p>
          </section>
          
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-amber-400">Contact Us</h3>
            <p>
              Have questions, suggestions, or feedback? We&apos;d love to hear from you!
            </p>
            <p className="text-amber-400">host@trivia.box</p>
          </section>

          <section className="mt-8 pt-6 border-t border-gray-700">
            <p className="text-sm text-gray-400">
              © 2024-2025 Dude dot box LLC. All rights reserved.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}