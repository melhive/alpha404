const CACHE_NAME = 'alpha404-v1.9.0';
const SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first for the app shell: always try to get the latest deployed
// files when online (so version updates land immediately), and fall back
// to the cached copy only when there's no connection.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).then(networkResponse => {
      if (networkResponse && networkResponse.ok) {
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse.clone()));
      }
      return networkResponse;
    }).catch(() => caches.match(event.request))
  );
});
