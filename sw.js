// APR Service Worker v12.0
// Bump CACHE whenever static assets (manifest, icons, logo) change — they're
// cached-first with no expiry, so the version string is the only thing that
// forces a refresh. HTML is network-first and self-heals on next reload.
const CACHE = 'apr-v12';
const ASSETS = [
  './manifest.json',
  './logo.jpg',
  './icons/icon-48.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './offline-queue.js',
  './img/gear/SUP.jpg',
  './img/gear/KAY.jpg',
  './img/gear/KAY2.jpg',
  './img/gear/SNK.jpg',
  './img/gear/FLT.jpg',
  './img/gear/FLC.jpg',
  './img/gear/BPG.jpg',
];
// apr-config.js rides with the HTML (network-first) so edits to deposit %,
// PayPal or partners reach guests immediately instead of sticking in cache.
const HTML_FILES = ['./', './index.html', './admin.html', './apr-config.js', './chat-alerts.js'];

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

  // Cache-first for static assets (images, manifest). Only good responses are
  // stored: caching a 404 (e.g. a photo requested a moment before it was
  // uploaded) would keep showing the fallback forever on that phone.
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});

// ── Background Sync: best-effort extra trigger (mainly Android Chrome) ──
// The reliable cross-browser path is offline-queue.js's own 'online' event
// listener + 30s interval, which runs entirely from the page and doesn't
// depend on this. This is just a bonus nudge for browsers that support the
// Background Sync API, so the queue can drain even if the tab isn't open.
// Duplicates the DB/store names and drain logic from offline-queue.js
// on purpose — a service worker can't import a page-context script.
self.addEventListener('sync', e => {
  if (e.tag === 'aqp-sync') e.waitUntil(drainOfflineQueueFromSW());
});

function drainOfflineQueueFromSW() {
  return new Promise((resolve) => {
    const req = indexedDB.open('aqp-offline-queue', 1);
    req.onerror = () => resolve();
    req.onsuccess = async () => {
      const db = req.result;
      try {
        const items = await new Promise((res, rej) => {
          const tx = db.transaction('queue', 'readonly');
          const getAllReq = tx.objectStore('queue').getAll();
          getAllReq.onsuccess = () => res(getAllReq.result || []);
          getAllReq.onerror = () => rej(getAllReq.error);
        });
        for (const item of items) {
          try {
            const res = await fetch(item.url, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: item.body,
            });
            let parsed = null;
            try { parsed = await res.json(); } catch (jsonErr) { /* leave null */ }
            if (res.ok && parsed && parsed.ok === true) {
              await new Promise((res2, rej2) => {
                const tx = db.transaction('queue', 'readwrite');
                tx.objectStore('queue').delete(item.id);
                tx.oncomplete = res2;
                tx.onerror = () => rej2(tx.error);
              });
            }
          } catch (fetchErr) {
            break; // still offline — stop, next sync/online event retries
          }
        }
      } catch (drainErr) { /* best-effort — ignore */ }
      resolve();
    };
  });
}

// ── Chat notifications ──
// Sent by the platform server (aquatic-platform src/apr-push.js) when the
// team replies to a guest, or a guest writes to the team. Shows even when
// the site is closed; the phone plays its normal notification sound.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Aquatic Paradise', {
    body: d.body || 'You have a new message',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-48.png',
    tag: d.tag || 'apr-chat',
    renotify: true,
    vibrate: d.call ? [600, 300, 600, 300, 600] : [200, 100, 200],
    requireInteraction: !!d.call, // a call stays on screen until it's tapped or dismissed
    data: { url: d.url || './' },
  }));
});

// Tapping it opens the chat, reusing a tab of the site that's already open.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.location.href).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const same = list.find(c => c.url.split('#')[0] === url.split('#')[0]);
    // Already open: switch it to the chat or call without reloading (a reload would sign staff out).
    if (same) { same.postMessage({ type: 'apr-open', url }); return same.focus(); }
    return self.clients.openWindow(url);
  }));
});
