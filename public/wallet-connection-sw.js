/**
 * Service Worker for Wallet Connection Persistence
 * Helps maintain wallet state across page refreshes, especially on mobile
 */

const CACHE_NAME = 'trivia-box-wallet-cache-v1';
const WALLET_DB_NAME = 'WalletConnectionState';
const WALLET_STORE_NAME = 'walletState';

// Install event - cache necessary resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache core pages and assets
      return cache.addAll([
        '/',
        '/site.webmanifest'
      ]);
    })
  );
  
  console.log('[Wallet SW] Service worker installed');
  self.skipWaiting(); // Ensure the new service worker activates immediately
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(
        keyList.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  
  console.log('[Wallet SW] Service worker activated');
  self.clients.claim(); // Take control of all clients
});

// Open (or create) the IndexedDB for wallet state
function openWalletDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WALLET_DB_NAME, 1);
    
    request.onerror = event => {
      console.error('[Wallet SW] IndexedDB error:', event.target.error);
      reject(event.target.error);
    };
    
    request.onsuccess = event => {
      resolve(event.target.result);
    };
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(WALLET_STORE_NAME)) {
        const store = db.createObjectStore(WALLET_STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

// Save wallet state to IndexedDB
async function saveWalletState(data) {
  try {
    const db = await openWalletDB();
    const tx = db.transaction(WALLET_STORE_NAME, 'readwrite');
    const store = tx.objectStore(WALLET_STORE_NAME);
    
    // Add a unique ID and timestamp if not present
    const stateToSave = {
      ...data,
      id: data.id || `wallet_${Date.now()}`,
      timestamp: data.timestamp || Date.now()
    };
    
    store.put(stateToSave);
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = event => {
        console.error('[Wallet SW] Error saving wallet state:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('[Wallet SW] Error accessing IndexedDB:', error);
    throw error;
  }
}

// Get the latest wallet state from IndexedDB
async function getLatestWalletState() {
  try {
    const db = await openWalletDB();
    const tx = db.transaction(WALLET_STORE_NAME, 'readonly');
    const store = tx.objectStore(WALLET_STORE_NAME);
    const index = store.index('timestamp');
    
    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, 'prev'); // Get most recent first
      
      request.onsuccess = event => {
        const cursor = event.target.result;
        if (cursor) {
          resolve(cursor.value);
        } else {
          resolve(null);
        }
      };
      
      request.onerror = event => {
        console.error('[Wallet SW] Error getting wallet state:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('[Wallet SW] Error accessing IndexedDB:', error);
    throw error;
  }
}

// Message event - handle messages from the main thread
self.addEventListener('message', event => {
  // Check for wallet state saving
  if (event.data && event.data.type === 'SAVE_WALLET_STATE') {
    console.log('[Wallet SW] Received wallet state to save:', event.data.payload);
    saveWalletState(event.data.payload)
      .then(() => {
        // Respond to the client if they're expecting a response
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ success: true });
        }
      })
      .catch(error => {
        console.error('[Wallet SW] Error saving wallet state:', error);
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ success: false, error: error.message });
        }
      });
  }
  
  // Check for wallet state retrieval
  else if (event.data && event.data.type === 'GET_WALLET_STATE') {
    getLatestWalletState()
      .then(state => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ success: true, state });
        }
      })
      .catch(error => {
        console.error('[Wallet SW] Error retrieving wallet state:', error);
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ success: false, error: error.message });
        }
      });
  }
});

// Fetch event - respond with cached resources or network
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip cross-origin requests to avoid CORS issues
  if (!event.request.url.startsWith(self.location.origin)) return;
  
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // Return cached response if available
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // Otherwise fetch from network
      return fetch(event.request).then(response => {
        // Don't cache if not a valid response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        
        // Clone the response so we can return one and cache one
        const responseToCache = response.clone();
        
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        
        return response;
      });
    })
  );
});

console.log('[Wallet SW] Service worker registered');
