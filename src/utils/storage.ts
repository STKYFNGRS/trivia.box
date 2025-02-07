'use client';

// Storage keys
const STORAGE_KEYS = {
  CHAIN_ID: 'trivia_box_chain_id',
  WALLET_CONNECT: 'wc@2:client:0',
  CONNECTED_WALLET: 'w3m_connected_wallet_type',
  PREFERRED_VIEW: 'w3m_preferred_modal_view',
  WALLET_ID: 'w3m_wallet_id',
  SESSION: 'w3m_session',
  EMAIL: 'w3m_email',
  SOCIAL: 'w3m_social'
} as const;

type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
type StorageKeySet = Set<StorageKey>;

const createStorageKeySet = (keys: StorageKey[]): StorageKeySet => new Set(keys);

export const clearLocalStorage = () => {
  if (typeof window === 'undefined') return;

  // Keep essential storage items
  const keysToKeep = createStorageKeySet([
    STORAGE_KEYS.CHAIN_ID
  ]);

  Object.keys(localStorage).forEach(key => {
    if (!keysToKeep.has(key as StorageKey)) {
      localStorage.removeItem(key);
    }
  });
};

export const clearSessionStorage = () => {
  if (typeof window === 'undefined') return;
  sessionStorage.clear();
};

export const clearCookies = () => {
  if (typeof window === 'undefined') return;

  document.cookie.split(';').forEach(cookie => {
    document.cookie = cookie
      .replace(/^ +/, '')
      .replace(/=.*/, `=;expires=${new Date(0).toUTCString()};path=/`);
  });
};

export const clearIndexedDB = async () => {
  if (typeof window === 'undefined') return;

  const databases = await window.indexedDB.databases();
  databases.forEach(db => {
    if (db.name) {
      window.indexedDB.deleteDatabase(db.name);
    }
  });
};

export const clearAllStorage = async () => {
  clearLocalStorage();
  clearSessionStorage();
  clearCookies();
  await clearIndexedDB();
};

export const resetWeb3Modal = () => {
  if (typeof window === 'undefined') return;

  // Clear all Web3Modal-related storage
  Object.keys(localStorage)
    .filter(key => key.startsWith('w3m') || key.startsWith('wagmi') || key.startsWith('wc'))
    .forEach(key => localStorage.removeItem(key));
    
  // Clear session storage
  Object.keys(sessionStorage)
    .filter(key => key.startsWith('w3m') || key.startsWith('wagmi') || key.startsWith('wc'))
    .forEach(key => sessionStorage.removeItem(key));
};

// Helper functions for specific storage operations
export const setPreferredChainId = (chainId: number) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.CHAIN_ID, chainId.toString());
};

export const getPreferredChainId = (defaultChainId: number) => {
  if (typeof window === 'undefined') return defaultChainId;
  const chainId = localStorage.getItem(STORAGE_KEYS.CHAIN_ID);
  return chainId ? parseInt(chainId) : defaultChainId;
};

// Re-export resetWeb3Modal as clearWeb3Storage for backward compatibility
export { resetWeb3Modal as clearWeb3Storage };