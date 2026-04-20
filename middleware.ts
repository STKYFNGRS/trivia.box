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
