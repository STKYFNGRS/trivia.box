/**
 * cleanupConnection.ts
 * 
 * Utility to clean up any lingering wallet connections and prevent auto-connection
 */

import { clearConnectionState } from './persistConnection';

/**
 * Cleans up any existing wallet connections
 * This should be called on initial page load to prevent auto-connection
 */
export function cleanupWalletConnections(): void {
  try {
    // Clear our custom connection state
    clearConnectionState();
    
    // Try to clear wagmi store directly
    try {
      localStorage.removeItem('wagmi.store');
      localStorage.removeItem('wagmi.cache');
    } catch (e) {
      console.warn('Error clearing wagmi storage:', e);
    }
    
    // Clear AppKit storage
    try {
      localStorage.removeItem('trivia-box-siwe-v3');
      sessionStorage.removeItem('trivia-box-siwe-v3');
    } catch (e) {
      console.warn('Error clearing AppKit storage:', e);
    }
    
    // Clear any other potential connection-related flags
    try {
      localStorage.removeItem('prevent_disconnect');
      sessionStorage.removeItem('prevent_disconnect');
      localStorage.removeItem('connected');
      sessionStorage.removeItem('connected');
      
      // Clear custom AppKit flags if any
      localStorage.removeItem('@appkit/siwe');
      sessionStorage.removeItem('@appkit/siwe');
    } catch (e) {
      console.warn('Error clearing additional connection flags:', e);
    }
    
    console.log('Wallet connections cleaned up to prevent auto-connection');
  } catch (err) {
    console.error('Error in cleanupWalletConnections:', err);
  }
}

/**
 * Add this to pages where you want to explicitly prevent auto-connection
 */
export function preventAutoConnection(): void {
  // Only execute in browser
  if (typeof window !== 'undefined') {
    // Set a flag to indicate we don't want auto-connection
    try {
      localStorage.setItem('prevent_auto_connect', 'true');
      window.dispatchEvent(new CustomEvent('preventAutoConnect'));
    } catch (e) {
      console.warn('Error setting prevent auto connect flag:', e);
    }
  }
}
