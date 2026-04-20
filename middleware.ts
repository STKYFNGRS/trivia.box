import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/join(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/signup(.*)",
  "/game/(.*)/play(.*)",
  "/game/(.*)/display(.*)",
  "/api/webhooks/(.*)",
  "/api/ably/token",
  "/api/game/public(.*)",
  "/api/cron/(.*)",
  "/games/upcoming(.*)",
  "/u/(.*)",
  "/v/(.*)",
  "/api/venues/(.*)",
  // Always-available play surfaces (single-player + 15-min house games). The
  // landing page at /play shows upcoming house games and the solo CTA; solo
  // gameplay lives at /play/solo. Both work for signed-in and anonymous
  // users so guests can try the product before signing up.
  "/play",
  "/play/(.*)",
  "/api/solo/(.*)",
  // Public discovery pages: community deck marketplace and global/venue
  // leaderboards. Ratings (POST) still require auth at the route level.
  "/decks",
  "/decks/(.*)",
  "/leaderboards",
  "/leaderboards/(.*)",
  "/api/decks/public(.*)",
  // Public marketplace surfaces. Rating POSTs (`/api/decks/[id]/rate`) still
  // require auth at the route level; listing + detail are open.
  "/api/decks/([^/]+)/public(.*)",
  "/creators/(.*)",
  "/api/stats/global",
  "/api/stats/venue/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
