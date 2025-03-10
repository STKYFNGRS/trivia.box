/**
 * Middleware function that adds CORS headers to icon requests
 * This is needed to fix the icon loading issues in the AppKit modal
 */
export function middleware(request) {
  const pathname = request.nextUrl?.pathname;
  
  // Check if this is an icon request
  if (
    pathname && (
      pathname.endsWith('.ico') ||
      pathname.endsWith('.png') ||
      pathname.includes('apple-touch-icon') ||
      pathname.includes('android-chrome')
    )
  ) {
    // Get the URL from the request
    const url = request.nextUrl.clone();
    
    // Create a response - we'll use the standard Response constructor
    const response = new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Cache-Control': 'public, max-age=86400'
      }
    });
    
    return response;
  }
  
  // For all other requests, continue as normal without modification
  return;
}

// Configure the middleware to only run for icon files
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