/* Mythic Forge service worker: offline app shell for installed (PWA) use.
 * - Precaches the files listed in precache-manifest.json (written at build time).
 * - Pages: network first (so a new release is picked up), cached copy when offline.
 * - Other same-origin files: cache first; files fetched later are cached for offline use.
 * - A new version waits until every Mythic Forge window is closed before taking over,
 *   so a running session never loses files it still needs.
 * - Does nothing in the background: no sync, no push, no polling. */
const BUILD = '__MF_BUILD__'; // replaced with the build id at build time
const CACHE = `mythic-forge-shell-${BUILD}`;
const PREFIX = 'mythic-forge-shell-';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const res = await fetch('./precache-manifest.json', { cache: 'no-store' });
      if (!res.ok) return;
      const manifest = await res.json();
      const cache = await caches.open(CACHE);
      await cache.addAll(manifest.files);
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          if (fresh.ok) {
            const cache = await caches.open(CACHE);
            await cache.put('./', fresh.clone());
          }
          return fresh;
        } catch (error) {
          const shell = await caches.match('./', { cacheName: CACHE });
          if (shell) return shell;
          throw error;
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { cacheName: CACHE });
      if (cached) return cached;
      const response = await fetch(request);
      // Keep newly fetched app files for offline use (not optional asset packs).
      if (response.ok && !url.pathname.includes('/asset-packs/')) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
