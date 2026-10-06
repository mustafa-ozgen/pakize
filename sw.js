/* ===========================================================
   Pakize 🐾 — Servis Çalışanı (Service Worker)
   Uygulamanın çevrimdışı çalışmasını ve telefona yüklenebilmesini sağlar.
   =========================================================== */

const CACHE = 'pakize-v5';

const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './pakize.json',
  './appicon.png',
  './profileimg.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  /* pakize.json — her zaman önce ağdan (bilgiler güncel kalsın), çevrimdışıysa önbellek */
  if (url.pathname.endsWith('/pakize.json') || url.pathname.endsWith('pakize.json')) {
    event.respondWith(
      fetch(new Request(request, { cache: 'no-store' }))
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./pakize.json', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./pakize.json'))
    );
    return;
  }

  /* Sayfa açılışları — ağdan, çevrimdışıysa önbellekten */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  /* Aynı kaynaktaki statik dosyalar — önce önbellek (hızlı + çevrimdışı) */
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then((hit) => {
        if (hit) return hit;
        return fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        });
      })
    );
    return;
  }

  /* Diğer kaynaklar (ör. Google Fonts) — önce önbellek, sonra ağ */
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
    })
  );
});
