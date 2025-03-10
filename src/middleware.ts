/**
 * Middleware function that adds proper headers for icon requests
 * This ensures icons load correctly in the wallet connect modals
 */
export function middleware(request) {
  // For any request for images or icons, we'll add CORS headers
  const url = request.nextUrl;
  
  if (url.pathname.includes('.png') || 
      url.pathname.includes('.ico') || 
      url.pathname.includes('apple-touch-icon') ||
      url.pathname.includes('icon')) {
    
    // Create response that continues to the actual file
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Cache-Control': 'public, max-age=86400',
        'X-Middleware-Cache': 'no-cache'
      }
    });
  }
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image).*)',
    '/:path*/favicon.ico',
    '/:path*/apple-touch-icon.png',
    '/:path*/android-chrome-192x192.png',
    '/:path*/android-chrome-512x512.png'
  ],
};