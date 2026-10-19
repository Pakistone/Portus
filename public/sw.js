const CACHE_NAME = 'portus-v1.4.0';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/cachet-ujpas.png',
  '/logo-ujpas.png',
  '/ticket_bg_ujpas_hd.jpg',
  '/icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return Promise.allSettled(
          ASSETS_TO_CACHE.map((url) => cache.add(url))
        );
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
  const url = new URL(event.request.url);

  // Ne jamais intercepter les requêtes non-GET, les API backend (/api/*) ni les appels externes (Supabase, etc.)
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  // Stratégie Network-First avec fallback cache pour les navigations
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) return cachedResponse;
          return caches.match('/index.html');
        })
    );
    return;
  }

  // Stratégie Stale-While-Revalidate pour les assets statiques locaux
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => {
          // Échec réseau silencieux pour les assets
        });

      return cachedResponse || fetchPromise || new Response('Offline resource unavailable', { status: 503, statusText: 'Service Unavailable' });
    }).catch(() => {
      return new Response('Network error', { status: 503, statusText: 'Service Unavailable' });
    })
  );
});
