// Fix for Next.js route handler type issues
declare module 'next/server' {
  interface RouteHandlerContext {
    params: Record<string, string | string[]>
  }
}
