const CACHE_NAME = 'taskflow-v1';
const ASSETS = [
  '/',
  '/index.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchResponse) => {
        return caches.open(CACHE_NAME).then((cache) => {
          const url = new URL(event.request.url);
          // API/upload traffic is never cached — the path check works for
          // any origin because the API always mounts /api and /uploads.
          const isApi = url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/');
          const isSameOrigin = event.request.url.startsWith(self.location.origin);
          if (isSameOrigin && event.request.method === 'GET' && !isApi) {
            cache.put(event.request, fetchResponse.clone());
          }
          return fetchResponse;
        });
      });
    }).catch(() => {
      return caches.match('/index.html');
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
});
