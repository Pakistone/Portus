const CACHE_NAME = 'portus-v1.3.0';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/logoss.jpg',
  '/cachet-ujsrv.png',
  '/ticket_bg_ujpas_hd.png',
  '/ticket_bg_ujpas_hd.jpg',
  '/ticket_bg_ujpas_hd.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .catch(() => {})
  );
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key).catch(() => {});
            }
          })
        );
      })
      .catch(() => {})
  );
  void self.clients.claim().catch(() => {});
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              const responseToCache = networkResponse.clone();
              void caches.open(CACHE_NAME)
                .then((cache) => {
                  return cache.put(event.request, responseToCache);
                })
                .catch(() => {});
            }
            return networkResponse;
          })
          .catch(() => {
            return cachedResponse;
          });

        return cachedResponse || fetchPromise;
      })
      .catch(() => {
        // Fallback en cas d'erreur inattendue
        return new Response('Network error', { status: 480, statusText: 'Network Error' });
      })
  );
});
