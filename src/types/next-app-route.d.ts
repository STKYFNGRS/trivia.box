/**
 * Type definitions for Next.js App Router Route Handlers
 * Compatible with Next.js 14.1.0
 */

declare module 'next/server' {
  interface RouteHandlerContext<P = Record<string, string>> {
    params: P;
  }
}

// Type augmentation for Next.js App Router
declare global {
  interface RouteSegment<Segment extends string> {
    __segment: Segment;
  }
}
