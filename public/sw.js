/* Dropify Rider — service worker
 *
 * Strategy:
 *  - App shell: cache-first (HTML, CSS, JS, icons) for offline-first launch
 *  - /api/rider/* (authenticated API): network-first, fall back to last good cache
 *  - /api/track/* (public tracking): network-first, brief cache
 *  - POD photo routes: stale-while-revalidate
 *
 * Outbox / offline queue: see src/lib/rider-offline-queue.ts (IndexedDB on
 * the page side). The service worker listens for `online` events and posts
 * `dropify:online` so the page can flush its queue.
 */

const VERSION = "v2";
const SHELL_CACHE = `dropify-shell-${VERSION}`;
const API_CACHE = `dropify-api-${VERSION}`;
const PHOTO_CACHE = `dropify-photo-${VERSION}`;
const SHELL_ASSETS = [
  "/rider/orders",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        await cache.addAll(SHELL_ASSETS);
      } catch (err) {
        console.warn("[sw] shell cache addAll failed", err);
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => !n.endsWith(`-${VERSION}`))
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

function isRiderApi(url) {
  return url.pathname.startsWith("/api/rider/");
}

function isPublicTrackApi(url) {
  return url.pathname.startsWith("/api/track/");
}

function isPodPhoto(url) {
  return /\/pod-photo\/?$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isPodPhoto(url)) {
    event.respondWith(staleWhileRevalidate(PHOTO_CACHE, req));
    return;
  }
  if (isRiderApi(url) || isPublicTrackApi(url)) {
    event.respondWith(networkFirst(API_CACHE, req));
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(navigationFallback(req));
    return;
  }
});

async function networkFirst(cacheName, req) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.status === 200) {
      cache.put(req, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ ok: false, error: "Offline. No cached response." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function staleWhileRevalidate(cacheName, req) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const networkPromise = fetch(req)
    .then((fresh) => {
      if (fresh && fresh.status === 200) cache.put(req, fresh.clone()).catch(() => {});
      return fresh;
    })
    .catch(() => null);
  return cached || (await networkPromise) || new Response("Not found", { status: 404 });
}

async function navigationFallback(req) {
  try {
    const fresh = await fetch(req);
    return fresh;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match("/rider/orders");
    if (cached) return cached;
    return new Response(
      "<!doctype html><html><body><h1>Offline</h1><p>Reconnect to load the rider app.</p></body></html>",
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("sync", (event) => {
  if (event.tag === "dropify-flush") {
    event.waitUntil(notifyClientsToFlush());
  }
});

async function notifyClientsToFlush() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of clients) c.postMessage({ type: "dropify:online" });
}