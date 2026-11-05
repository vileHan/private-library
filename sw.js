// Service Worker: hält die App-Dateien für die Offline-Nutzung bereit.
// Strategie „Netz zuerst“: Online gibt es immer die neueste Version, offline die gespeicherte.
const CACHE = 'bibliothek-v5';
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/card.js',
  'js/library.js',
  'js/series.js',
  'js/stats.js',
  'js/util.js',
  'js/catalog.js',
  'js/config.js',
  'js/dnb.js',
  'js/isbn.js',
  'js/store.js',
  'js/works.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Nur eigene Dateien behandeln; DNB- und Cover-Anfragen laufen direkt ins Netz.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true })
        .then((hit) => hit || caches.match('index.html'))),
  );
});
