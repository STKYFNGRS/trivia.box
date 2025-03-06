import React from 'react';

export default function Footer() {
  return (
    <footer className="w-full px-4 sm:px-6 py-4 z-40 safe-bottom">
      <div className="max-w-5xl mx-auto">
        <div className="bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-md p-4 rounded-xl border border-amber-600/20 hover:border-amber-600/30 transition-all hardware-accelerated">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-3 md:space-y-0 px-2">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-amber-600 to-orange-600 flex items-center justify-center shadow-md">
                <span className="text-gray-900 font-bold text-xs">T.B</span>
              </div>
              <span className="text-sm text-gray-300 font-medium">Trivia.Box</span>
            </div>
            
            <div className="flex space-x-4 xs:space-x-8">
              <a href="#" className="text-xs xs:text-sm text-gray-400 hover:text-amber-600 transition-colors mobile-touch-target">About</a>
              <a href="#" className="text-sm text-gray-400 hover:text-amber-600 transition-colors">Privacy</a>
              <a href="#" className="text-sm text-gray-400 hover:text-amber-600 transition-colors">Terms</a>
            </div>

            <div className="text-xs sm:text-sm text-gray-400">
              © 2024-2025 {' '}
              <a 
                href="https://www.dude.box" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-amber-600 transition-colors"
              >
                Dude dot box LLC
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}