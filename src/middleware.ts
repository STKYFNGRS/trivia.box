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
  
  // Apply CORS headers to icon requests
  if (isIconRequest) {
    // Instead of creating a new response, modify the headers of the original response
    // This way, the actual icon file content is preserved
    const response = Response.next();
    
    // Add CORS and caching headers
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET');
    response.headers.set('Cache-Control', 'public, max-age=86400');
    
    return response;
  }
  
  // For all other requests, continue normally
  return Response.next();
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