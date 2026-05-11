// RIVEN service worker — minimal install/activate, navigation cache strategy,
// plus Web Push handlers.

// Bumped from v2 → v3 so existing installs upgrade and pick up the new
// fetch handler that serves the welcome page stale-while-revalidate.
const CACHE = "riven-v3";
const WELCOME_PATH = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Prime the welcome page + manifest into cache so the very first
      // navigation post-install is already cached. Don't fail install if
      // the network fetch errors — SW still activates.
      try {
        await cache.addAll([WELCOME_PATH, "/manifest.json"]);
      } catch {
        /* ignore — install proceeds */
      }
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Welcome page — stale-while-revalidate. The previous policy was
  // network-first, which meant every navigation waited on TTFB. On slow
  // networks (school wifi, weak cellular) that translated to ~5s of
  // Safari painting its own dark-mode background before our HTML arrived.
  // SWR serves the cached HTML immediately (instant cream paint), then
  // fetches fresh in the background so the *next* visit is up to date.
  if (
    event.request.mode === "navigate" &&
    url.origin === self.location.origin &&
    url.pathname === WELCOME_PATH
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(WELCOME_PATH);

        const networkPromise = fetch(event.request)
          .then((response) => {
            // Only cache full successful responses. Don't poison the cache
            // with redirects or error pages.
            if (response && response.status === 200 && response.type === "basic") {
              cache.put(WELCOME_PATH, response.clone());
            }
            return response;
          })
          .catch(() => null);

        // Cache HIT → return immediately, fire-and-forget the revalidate.
        if (cached) return cached;
        // Cache MISS (first ever visit, or post-evict) → wait on network.
        const networkResponse = await networkPromise;
        return networkResponse ?? new Response("Offline", { status: 503 });
      })()
    );
    return;
  }

  // Other navigations: network-first with cache fallback for offline.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(
        () => caches.match(WELCOME_PATH) || new Response("Offline", { status: 503 })
      )
    );
  }
});

// Web Push: payloads from /api/cron/sunday-reminder land here.
self.addEventListener("push", (event) => {
  let data = { title: "RIVEN", body: "You have an update.", url: "/" };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "riven-default",
      data: { url: data.url || "/" },
      vibrate: [80, 40, 80],
    })
  );
});

// Tap on notification → focus an existing tab on that URL or open a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })()
  );
});
