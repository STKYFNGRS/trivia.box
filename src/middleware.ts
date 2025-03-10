/**
 * Enhanced middleware function to ensure proper icon handling for wallet connect modals
 */

// Middleware handler for icon requests
export function middleware(request) {
  // Get the path from the URL
  const { pathname } = request.nextUrl;
  
  // Check if this is an icon request
  const isIconRequest = 
    pathname.endsWith('.ico') || 
    pathname.endsWith('.png') || 
    pathname.includes('favicon') || 
    pathname.includes('icon') || 
    pathname.includes('chrome') || 
    pathname.includes('apple-touch');
  
  // Apply special CORS headers to icon requests to fix loading in AppKit modal
  if (isIconRequest) {
    // Create response object
    const response = new Response(null);
    
    // Add CORS and cache headers to allow loading from AppKit modal
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET');
    response.headers.set('Cache-Control', 'public, max-age=86400'); // Cache for a day
    
    return response;
  }
  
  // For all other requests, continue normally
  return new Response(null);
}

// Configure which paths this middleware will run on
// Using valid Next.js middleware matcher syntax
export const config = {
  matcher: [
    // Match favicon and icon files with valid patterns
    '/favicon.ico',
    '/(.*).ico',
    '/(.*).png',
    '/icon-:path*',
    '/apple-touch-icon:path*',
    '/android-chrome-:path*',
  ],
};