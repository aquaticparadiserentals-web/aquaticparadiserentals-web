// APR Service Worker v5.0
// Bump CACHE whenever static assets (manifest, icons, logo) change — they're
// cached-first with no expiry, so the version string is the only thing that
// forces a refresh. HTML is network-first and self-heals on next reload.
const CACHE = 'apr-v5';
const ASSETS = [
  './manifest.json',
  './logo.jpg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
const HTML_FILES = ['./', './index.html', './admin.html'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('script.google.com')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ ok: false, error: 'Offline' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  const isHTML = e.request.mode === 'navigate' ||
    HTML_FILES.some(f => e.request.url.endsWith(f.replace('./', '')));

  if (isHTML) {
    // Network-first for HTML so updates show up immediately.
    // Falls back to cache only when offline.
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for static assets (images, manifest)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }))
  );
});
