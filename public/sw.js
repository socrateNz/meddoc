const CACHE_NAME = 'meddoc-pwa-v1';
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/manifest.json',
  '/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Ignorer les requêtes non-GET et les requêtes Next.js internes d'action/HMR
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Pour l'API et les Server Actions: Network Only / pas de blocage SW
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/_next/data')) {
    return;
  }

  // Pour les pages web et assets static: Network-First avec fallback vers le Cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        // Fallback vers le dashboard en cache si disponible
        return caches.match('/dashboard');
      })
  );
});

// Web Push : aucune notification actuelle ne porte de lien de destination propre (cf.
// src/lib/push.ts), le clic ouvre donc toujours la page notifications.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    // Payload non-JSON : notification générique plutôt qu'un échec silencieux.
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'MedDoc', {
      body: data.body || '',
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url: '/dashboard/notifications' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/dashboard/notifications';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
