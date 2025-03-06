/**
 * Type-safe compatibility layer for Next.js 14.1.0 route handlers
 */
import { NextResponse } from 'next/dist/server/web/spec-extension/response';

// Use the standard Request type for the NextRequest
export type NextRequest = Request;

// Export the NextResponse for actual use
export { NextResponse };

/**
 * Type-safe route handler for Next.js App Router
 */
export type RouteHandler<Params = Record<string, string>> = (
  request: NextRequest, 
  context: { params: Params }
) => Promise<NextResponse> | NextResponse;
