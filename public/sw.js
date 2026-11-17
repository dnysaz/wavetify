// Bump this whenever the shell URLs or the caching rules change.
const VERSION = 'wavetify-v5';
// Cover art lives on many third-party hosts and never changes, so it is worth
// keeping a bounded copy: covers then paint instantly on repeat visits and
// survive a flaky connection. Entries are trimmed oldest-first.
const IMAGE_CACHE = 'wavetify-images-v1';
const IMAGE_LIMIT = 150;
const SHELL = [
  '/',
  '/embed/',
  '/terms/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      // One missing shell file must not abort the whole install.
      await Promise.allSettled(SHELL.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== VERSION && key !== IMAGE_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

const put = (request, response) => {
  if (!response || !response.ok) return;
  const copy = response.clone();
  caches.open(VERSION).then((cache) => cache.put(request, copy));
};

// Opaque (no-CORS) image responses have status 0, so `ok` alone would skip them.
// The clone must happen synchronously: once the response is handed back to the
// page its body is being streamed and clone() would throw.
const storeImage = (request, response) => {
  if (!response || (!response.ok && response.type !== 'opaque')) return;
  const copy = response.clone();
  caches
    .open(IMAGE_CACHE)
    .then(async (cache) => {
      await cache.put(request, copy);
      const keys = await cache.keys();
      if (keys.length > IMAGE_LIMIT) {
        await Promise.all(keys.slice(0, keys.length - IMAGE_LIMIT).map((key) => cache.delete(key)));
      }
    })
    .catch(() => {});
};

const imageFirst = async (request) => {
  const cache = await caches.open(IMAGE_CACHE);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      void storeImage(request, response);
      return response;
    })
    .catch(() => hit || Response.error());
  return hit || network;
};

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cover art: serve the cached copy while refreshing it in the background.
  if (request.destination === 'image') {
    event.respondWith(imageFirst(request));
    return;
  }

  // Audio streams and music APIs stay on the network: never cache them.
  if (url.origin !== self.location.origin) return;

  // App shell: network first, cached copy when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          put(request, response);
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match('/')))
    );
    return;
  }

  // Hashed build assets never change: cache first.
  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            put(request, response);
            return response;
          })
      )
    );
    return;
  }

  // Everything else on our origin: serve fast, refresh in the background.
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((response) => {
          put(request, response);
          return response;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
