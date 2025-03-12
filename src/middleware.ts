/**
 * Enhanced middleware function to ensure proper icon handling for wallet connect modals
 * TEMPORARILY DISABLED to test if this is causing favicon issues
 */

// Middleware handler for icon requests
export function middleware(request) {
  // Simply return undefined to pass all requests through without modification
  return undefined;
}

// Configure which paths this middleware will run on
// Using valid Next.js middleware matcher syntax
export const config = {
  matcher: [], // Empty matcher so this middleware doesn't run on any paths
};