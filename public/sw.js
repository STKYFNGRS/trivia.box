/**
 * Trivia.Box service worker — Web Push receiver + focus-aware click
 * handler. Kept deliberately small because PWA offline is NOT the goal:
 * most of our surfaces are dynamic and we'd rather 404 than serve stale
 * leaderboards.
 */

self.addEventListener("install", (event) => {
  // Activate the new worker immediately; nothing to cache.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  /** @type {{ title?: string, body?: string, url?: string, tag?: string }} */
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    // Body wasn't JSON — treat the string as body text.
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Trivia.Box";
  const options = {
    body: payload.body || "New activity on your Trivia.Box profile.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: payload.url || "/" },
    tag: payload.tag,
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // If we already have a Trivia.Box tab open, focus it rather than
      // popping a duplicate window.
      for (const client of windowClients) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            client.focus();
            if ("navigate" in client) {
              return client.navigate(targetUrl);
            }
            return;
          }
        } catch (_e) {
          // Malformed URL on the client — fall through.
        }
      }
      return self.clients.openWindow(targetUrl);
    })()
  );
});
