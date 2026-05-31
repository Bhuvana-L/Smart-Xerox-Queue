const CACHE_NAME = 'xerox-queue-v1';
const urlsToCache = [
  '/pages/index.html',
  '/pages/student-login.html',
  '/pages/owner-login.html',
  '/pages/dashboard.html',
  '/pages/orders.html',
  '/pages/owner.html',
  '/pages/profile.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  // Network first, fallback to cache
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
});
