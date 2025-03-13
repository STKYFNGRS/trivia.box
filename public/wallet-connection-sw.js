const CACHE_NAME = 'trivia-box-wallet-cache-v1';

// Install event - cache necessary resources
self.addEventListener('install', event => {
  self.skipWaiting(); // Ensure new service worker becomes active immediately
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll([
        '/', // Cache the main page
        '/api/rpc-proxy', // Cache the API endpoint
        // Add other essential resources
      ]);
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - respond with cached resources when offline
self.addEventListener('fetch', event => {
  // Only intercept API requests
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // Return cached response for API endpoint if available
          return caches.match(event.request);
        })
    );
  }
});

// Store wallet connection state in IndexedDB for persistence
const DB_NAME = 'WalletConnectionDB';
const STORE_NAME = 'walletState';

// Helper functions for IndexedDB operations
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onerror = event => {
      reject('Error opening IndexedDB');
    };
    
    request.onsuccess = event => {
      resolve(event.target.result);
    };
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
  });
}

function storeWalletState(state) {
  return openDatabase().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      // Store with a fixed ID for easy retrieval
      const request = store.put({
        id: 'currentWalletState',
        ...state,
        lastUpdated: Date.now()
      });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject('Error storing wallet state');
    });
  });
}

function getWalletState() {
  return openDatabase().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get('currentWalletState');
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject('Error getting wallet state');
    });
  });
}

// Message event - handle wallet connection persistence
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'STORE_WALLET_STATE') {
    // Store wallet state in IndexedDB for persistence
    storeWalletState(event.data.payload);
  } else if (event.data && event.data.type === 'GET_WALLET_STATE') {
    // Retrieve wallet state
    getWalletState().then(state => {
      event.ports[0].postMessage({ walletState: state });
    });
  }
});
