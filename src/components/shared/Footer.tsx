'use client';
import React, { useState, useEffect } from 'react';
import About from '@/components/legal/About';
import PrivacyPolicy from '@/components/legal/PrivacyPolicy';
import TermsOfService from '@/components/legal/TermsOfService';
import { DownloadIcon } from 'lucide-react';

export default function Footer() {
  const [showAbout, setShowAbout] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  // Listen for the beforeinstallprompt event
  useEffect(() => {
    // This event fires when the app can be installed
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent browser from showing the default prompt
      e.preventDefault();
      // Store the event for later use
      setDeferredPrompt(e);
      // Show our install button
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check if app is already installed
    const checkIsInstalled = () => {
      if (window.matchMedia('(display-mode: standalone)').matches) {
        setIsInstallable(false);
      }
    };

    checkIsInstalled();
    window.addEventListener('appinstalled', () => {
      setIsInstallable(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Show the installation prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const choiceResult = await deferredPrompt.userChoice;
    
    // We no longer need the prompt
    setDeferredPrompt(null);
    
    if (choiceResult.outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
  };

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
              <button
                onClick={() => setShowAbout(true)}
                className="text-xs xs:text-sm text-gray-400 hover:text-amber-600 transition-colors mobile-touch-target"
              >
                About
              </button>
              <button
                onClick={() => setShowPrivacy(true)}
                className="text-xs xs:text-sm text-gray-400 hover:text-amber-600 transition-colors mobile-touch-target"
              >
                Privacy
              </button>
              <button
                onClick={() => setShowTerms(true)}
                className="text-xs xs:text-sm text-gray-400 hover:text-amber-600 transition-colors mobile-touch-target"
              >
                Terms
              </button>
              {isInstallable && (
                <button
                  onClick={handleInstallClick}
                  className="flex items-center text-xs xs:text-sm text-amber-500 hover:text-amber-600 transition-colors mobile-touch-target"
                >
                  <DownloadIcon className="inline-block w-4 h-4 mr-1" />
                  Install App
                </button>
              )}
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
      {showAbout && <About onClose={() => setShowAbout(false)} />}
      {showPrivacy && <PrivacyPolicy onClose={() => setShowPrivacy(false)} />}
      {showTerms && <TermsOfService onClose={() => setShowTerms(false)} />}
    </footer>
  );
}