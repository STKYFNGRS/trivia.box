// metamask.ts - Specialized MetaMask integration support
// This helps ensure MetaMask can properly recognize our dApp

// Export metadata needed for MetaMask integration
export const metamaskConfig = {
  appName: 'Trivia Box',
  appIcon: '/mm-icon.png',  // Use our specific MetaMask icon
  chainId: '8453',          // Base chain ID
  description: 'Web3 Trivia Game - Test your knowledge and earn rewards!',
};

// Helper function to initialize MetaMask integration
export const initMetaMask = () => {
  if (typeof window !== 'undefined') {
    // Set specific meta tags for MetaMask
    const iconLink = document.createElement('link');
    iconLink.rel = 'icon';
    iconLink.href = metamaskConfig.appIcon;
    iconLink.type = 'image/png';
    document.head.appendChild(iconLink);
    
    // Add web3 extension specific meta tags
    const metaMaskIcon = document.createElement('meta');
    metaMaskIcon.name = 'web3-extension-icon';
    metaMaskIcon.content = metamaskConfig.appIcon;
    document.head.appendChild(metaMaskIcon);
    
    // Add chain ID meta tag
    const chainIdMeta = document.createElement('meta');
    chainIdMeta.setAttribute('property', 'eth:chainId');
    chainIdMeta.content = metamaskConfig.chainId;
    document.head.appendChild(chainIdMeta);
    
    console.log('[MetaMask] Integration initialized');
  }
};
