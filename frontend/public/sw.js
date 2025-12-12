// Service Worker for FluxPay Frontend
const CACHE_NAME = 'fluxpay-cache-v1';
const urls_to_cache = [
  './',
  './index.html',
  './manifest.json'
];

// Install Event - Cache Static Assets
self.addEventListener('install', (event) => {
  console.log('Service worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service worker caching files...');
      return cache.addAll(urls_to_cache);
    }).catch((error) => {
      console.error('Service worker installation failed:', error);
    })
  );
});

// Fetch Event - Serve from Cache or Network
self.addEventListener('fetch', (event) => {
  console.log('Service worker intercepting fetch:', event.request.url);
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached version or fetch from network
      return response || fetch(event.request).catch((error) => {
        console.error('Service worker fetch failed:', error);
        // Return a basic offline fallback if needed
        if (event.request.destination === 'document') {
          return caches.match('./');
        }
      });
    })
  );
});

// Activate Event - Clean old caches
self.addEventListener('activate', (event) => {
  console.log('Service worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service worker removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
