// Simple middleware for handling icon requests
export function middleware(request) {
  const url = new URL(request.url);
  
  // Special handling for icon files to ensure proper CORS headers
  if (url.pathname.endsWith('.ico') || 
      url.pathname.includes('chrome') || 
      url.pathname.includes('apple-touch') || 
      url.pathname.endsWith('.png')) {
    
    // Return a Response object with headers directly
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Cache-Control': 'public, max-age=86400' // Cache for 24 hours
      }
    });
  }
  
  // Continue to the next middleware by simply not returning anything
  // This is how Next.js middleware works when we want to pass through
  return undefined;
}

// Configure which paths this middleware will run on
export const config = {
  matcher: [
    '/favicon.ico',
    '/android-chrome-192x192.png',
    '/android-chrome-512x512.png',
    '/apple-touch-icon.png',
    '/favicon-16x16.png',
    '/favicon-32x32.png',
  ],
};
