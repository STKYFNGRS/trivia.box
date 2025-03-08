export function middleware(request) {
  const url = new URL(request.url);
  
  // Special handling for favicon.ico requests
  if (url.pathname === '/favicon.ico') {
    // Redirect to our API route that properly handles the favicon
    url.pathname = '/api/favicon';
    return Response.redirect(url);
  }
  
  return new Response(null, { status: 200 });
}

// Configure which paths this middleware will run on
export const config = {
  matcher: ['/favicon.ico'],
};
