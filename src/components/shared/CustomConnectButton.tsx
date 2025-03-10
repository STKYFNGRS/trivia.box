'use client';
import { useCallback, useState, useEffect, useRef } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { base } from 'viem/chains';
import { modal } from '@/config/appkit';
import { useAppKitState } from '@reown/appkit/react';
import { isMobileDevice } from '@/utils/deviceDetect';
import { saveConnectionState } from '@/utils/persistConnection';

export default function CustomConnectButton() {
  const { isConnected, chainId, address } = useAccount();
  const { switchChain } = useSwitchChain();
  const [isConnecting, setIsConnecting] = useState(false);
  const { status } = useAppKitState();
  const connectionSavedRef = useRef(false);

  // Reset connecting state if AppKit disconnects
  useEffect(() => {
    if (status === 'unauthenticated' && isConnecting) {
      setIsConnecting(false);
    }
  }, [status, isConnecting]);

  // Debug logs and save connection state on successful connection
  useEffect(() => {
    // Log state changes
    console.log('[Debug] CustomConnectButton state:', {
      wagmiConnected: isConnected,
      chainId: chainId ? `${chainId} (0x${chainId.toString(16)})` : undefined,
      address: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : null,
      appKitStatus: status,
      isConnecting,
      timestamp: new Date().toISOString()
    });
    
    // When connected with an address, save the connection state
    // This helps ensure persistence
    if (isConnected && address && chainId && !connectionSavedRef.current) {
      saveConnectionState(address, chainId);
      connectionSavedRef.current = true;
      console.log('[Debug] Connection state saved after successful connection');
    }
  }, [isConnected, chainId, status, isConnecting, address]);
  
  // Reset saved flag when disconnected
  useEffect(() => {
    if (!isConnected) {
      connectionSavedRef.current = false;
    }
  }, [isConnected]);

  const handleConnect = useCallback(async () => {
    console.log('[Debug] Connect button clicked');
    if (isConnecting) return;
    
    try {
      setIsConnecting(true);
      
      if (isConnected) {
        if (chainId !== base.id) {
          console.log('[Debug] Switching chain to Base');
          await switchChain({ chainId: base.id });
        }
      } else {
        // On desktop, check if we're already in a connected state that just needs to be recognized
        const isDesktop = !isMobileDevice();
        if (isDesktop) {
          const wagmiStore = localStorage.getItem('wagmi.store');
          if (wagmiStore) {
            const wagmiData = JSON.parse(wagmiStore);
            const hasConnectedAccount = wagmiData?.state?.connections?.[0]?.accounts?.[0];
            if (hasConnectedAccount) {
              console.log('[Debug] Found existing connection in wagmi store, not showing modal');
              setIsConnecting(false);
              return;
            }
          }
        }
        
        console.log('[Debug] Opening connect modal');
        await modal.open();
        
        // After successful connection, immediately save state
        // This should help with persistence on both desktop and mobile
        const wagmiStore = localStorage.getItem('wagmi.store');
        if (wagmiStore) {
          try {
            const wagmiData = JSON.parse(wagmiStore);
            const connectedAccount = wagmiData?.state?.connections?.[0]?.accounts?.[0];
            const connectedChain = wagmiData?.state?.connections?.[0]?.chains?.[0]?.id;
            
            if (connectedAccount) {
              console.log('[Debug] Saving new connection state after modal');
              saveConnectionState(connectedAccount, connectedChain);
            }
          } catch (e) {
            console.warn('[Debug] Error checking wagmi store after connection', e);
          }
        }
      }
    } catch (error) {
      console.error('Failed to connect:', error);
    } finally {
      // Only reset connecting state if we're not in the middle of switching chains
      if (!isConnected || chainId === base.id) {
        setIsConnecting(false);
      }
    }
  }, [isConnected, chainId, switchChain, isConnecting]);

  // Reset connecting state after successful connection to Base
  useEffect(() => {
    if (isConnected && chainId === base.id && isConnecting) {
      setIsConnecting(false);
    }
  }, [isConnected, chainId, isConnecting]);

  const buttonText = isConnecting 
    ? 'Connecting...'
    : !isConnected 
      ? 'Connect Wallet' 
      : chainId !== base.id 
        ? 'Switch to Base' 
        : 'Connected';

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handleConnect}
        disabled={isConnecting}
        className="connect-button animate-fadeIn px-8 py-5 rounded-xl font-bold text-lg text-gray-900 transition-all duration-300 disabled:opacity-50 transform hover:scale-105 hover:shadow-amber-600/40 hover:shadow-lg border border-amber-500/40 relative overflow-hidden animate-pulse-button"
        style={{ 
          animationDelay: '0.6s',
          background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 35%, #b45309 70%, #92400e 100%)',
          boxShadow: '0 0 15px rgba(217, 119, 6, 0.5), 0 4px 15px rgba(217, 119, 6, 0.3), inset 0 1px 3px rgba(255, 255, 255, 0.4), inset 0 -2px 2px rgba(0, 0, 0, 0.2)'
        }}
      >
        <span className="relative z-10">{buttonText}</span>
        {/* Reflective highlight effect */}
        <span className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-white/30 to-transparent pointer-events-none"></span>
        <span className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/30 to-transparent pointer-events-none"></span>
        
        {/* Shimmer effect */}
        <span className="absolute inset-0 w-full h-full shimmer-effect pointer-events-none"></span>
      </button>
    </div>
  );
}