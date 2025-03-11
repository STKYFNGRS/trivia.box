// This route is now deprecated as we're using static file delivery from public directory
// with middleware handling the CORS headers

export async function GET() {
  // Return a 308 permanent redirect to the static favicon
  return new Response(null, {
    status: 308, // Permanent redirect
    headers: {
      'Location': '/favicon.ico',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
