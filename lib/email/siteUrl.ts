/**
 * Resolve the user-facing base URL for links embedded in emails. Mirrors
 * the fallback chain used in `app/robots.ts` / `app/layout.tsx` so that
 * every outbound message links to the same origin the browser sees. No
 * trailing slash.
 */
export function resolveSiteUrl(): string {
  const env =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (env && env.trim().length > 0) return env.trim().replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel && vercel.trim().length > 0) {
    return `https://${vercel.trim().replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
}
