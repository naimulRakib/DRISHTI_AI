// DRISHTI AI — Service Worker (Hand-written, Local-first Cache)
const CACHE_NAME = 'drishti-cache-v2';

const CACHE_FIRST_PREFIXES = [
  '/_next/static',
  '/models',
  '/tessdata',
  '/mediapipe',
  '/tesseract',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  const isAppShell = url.pathname === '/' || url.pathname === '';
  const isCacheFirst = isAppShell || CACHE_FIRST_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));

  if (isCacheFirst) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            // Dynamically cache Next.js static chunks
            if (url.pathname.startsWith('/_next/static')) {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
            }
          }
          return networkResponse;
        });
      }).catch(() => {
        // Fallback to app shell for navigation requests if offline
        if (event.request.mode === 'navigate') {
          return caches.match('/').then((shell) => {
            return shell || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
          });
        }
        return new Response('Asset not cached offline', { status: 504, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      })
    );
  }
});
