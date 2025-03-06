export const clearWeb3Storage = () => {
  // Handle deep links and persistent data
  try {
    // Clear WalletConnect preferences
    localStorage.removeItem('WALLETCONNECT_DEEPLINK_CHOICE');
    
    // Clear all session-related data
    Object.keys(window.sessionStorage).forEach(key => {
      if (key.includes('walletconnect') || key.includes('wc@')) {
        sessionStorage.removeItem(key);
      }
    });

    // Clear all local storage data
    Object.keys(window.localStorage).forEach(key => {
      if (
        key.startsWith('wc@2') || 
        key.startsWith('wagmi') || 
        key.startsWith('w3m') ||
        key.includes('walletconnect') ||
        key.includes('metamask')
      ) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error('Error clearing storage:', error);
  }
};