/**
 * Fetcher function optimized for both client and server components.
 * 
 * This avoids URL parsing errors by using the native fetch API directly.
 * It handles both absolute and relative URLs appropriately.
 */
export async function fetcher(url: string) {
  // For client-side fetch, ensure we have proper URL format
  let fetchUrl = url;
  
  // Handle relative URLs
  if (typeof window !== 'undefined') {
    // Running on client
    if (!url.startsWith('http') && !url.startsWith('/')) {
      fetchUrl = '/' + url;
    }
    
    // For client-side fetch, use full URL by combining with origin
    if (!url.startsWith('http')) {
      fetchUrl = window.location.origin + fetchUrl;
    }
  } else {
    // Server-side - just ensure we have a leading slash for relative URLs
    if (!url.startsWith('http') && !url.startsWith('/')) {
      fetchUrl = '/' + url;
    }
  }
  
  try {
    // Add a timestamp to URLs for APIs that might be cached
    if (fetchUrl.includes('/api/game') || fetchUrl.includes('session')) {
      const separator = fetchUrl.includes('?') ? '&' : '?';
      fetchUrl = `${fetchUrl}${separator}_t=${Date.now()}`;
    }
    
    // Direct fetch without URL constructor
    const res = await fetch(fetchUrl, {
      headers: {
        'Cache-Control': 'no-cache, no-store',
        'Pragma': 'no-cache'
      }
    });
    
    if (!res.ok) {
      throw new Error(`API error: ${res.status} ${res.statusText}`);
    }
    
    return res.json();
  } catch (error) {
    console.error(`Error fetching from ${fetchUrl}:`, error);
    throw error;
  }
}
