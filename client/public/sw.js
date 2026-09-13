const CACHE_NAME = 'taskflow-v2';
const ASSETS = [
  '/index.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Purge caches from older versions of this SW (CACHE_NAME bump).
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
      // Take control of open pages immediately — otherwise a redeploy would
      // not reach existing tabs until every one was closed.
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  // Never intercept cross-origin traffic (the split-deploy API origin) —
  // only static assets from this origin go through the SW.
  if (url.origin !== self.location.origin) return;
  // Never touch API/upload traffic — authenticated responses must not be
  // cached by the service worker.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  // SPA navigation + index.html: network-first. Serving a cached shell after
  // a deploy means stale JS chunks that 404 their lazy imports — the classic
  // "white screen after release" failure.
  if (event.request.mode === 'navigate' || url.pathname === '/index.html' || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put('/index.html', copy));
          }
          return resp;
        })
        .catch(() => caches.match('/index.html').then((r) => r || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })))
    );
    return;
  }

  // Other same-origin GETs: stale-while-revalidate (served instantly, updated
  // in the background). These are hashed Vite assets, so staleness is bounded
  // by the HTML that references them — and the HTML is now network-first.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
