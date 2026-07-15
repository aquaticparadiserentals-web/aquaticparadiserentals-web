// APR offline queue — shared by index.html, feedback.html, dispatch.html
// (admin.html can adopt it too; see PROGRESS.md 2026-07-16).
//
// Why this exists: sw.js already intercepts every script.google.com request
// and, on a real network failure, resolves with a synthetic
// { ok:false, error:'Offline' } Response instead of letting the fetch
// promise reject (see sw.js). That means a plain fetch() from the page never
// throws when truly offline — it resolves normally, just with a fake body.
// queueOrSend() below is the thing that recognizes that synthetic shape and
// treats it as "queue this," while a REAL HTTP error from the backend
// (validation failure, 4xx/5xx) is left alone and reported as a real error.
//
// Storage is IndexedDB, not localStorage — queued payloads can carry base64
// photos/signatures that are too large/slow for localStorage.
(function (global) {
  const DB_NAME = 'aqp-offline-queue';
  const DB_VERSION = 1;
  const STORE = 'queue';
  const DRAIN_INTERVAL_MS = 30000;

  let dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('dedupeKey', 'dedupeKey', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function withStore(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const result = fn(store);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Adds a queue entry. If dedupeKey is given, any earlier entries with the
  // same key are removed first — used by GPS pings so only the most recent
  // position per booking ref survives a stack of offline retries.
  async function enqueue(url, bodyObj, dedupeKey) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      if (dedupeKey) {
        const idx = store.index('dedupeKey');
        const cursorReq = idx.openCursor(IDBKeyRange.only(dedupeKey));
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
      }
      store.add({
        url,
        body: JSON.stringify(bodyObj),
        dedupeKey: dedupeKey || null,
        createdAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    registerBackgroundSync();
    notifyChange();
  }

  async function getAll() {
    return withStore('readonly', store => reqToPromise(store.getAll())).then(r => r);
  }

  async function removeById(id) {
    return withStore('readwrite', store => store.delete(id));
  }

  async function getPendingCount() {
    const items = await getAll();
    return items.length;
  }

  // ── change notification (drives the small pending-count badge) ──
  const changeListeners = [];
  function onPendingChange(cb) {
    changeListeners.push(cb);
    // fire once immediately with current count so the caller doesn't have
    // to wait for the next mutation to render an initial state
    getPendingCount().then(cb).catch(() => {});
  }
  function notifyChange() {
    getPendingCount().then(n => changeListeners.forEach(cb => { try { cb(n); } catch (e) {} }))
      .catch(() => {});
  }

  function isSwOfflineMarker(parsed) {
    return !!parsed && parsed.ok === false && parsed.error === 'Offline';
  }

  // Tries a real fetch first. Only queues on an actual connectivity failure —
  // a thrown network error, or the sw.js synthetic offline marker. A real
  // HTTP/validation error from the backend is returned as-is, never queued.
  async function queueOrSend(url, bodyObj, opts) {
    opts = opts || {};
    const useNoCors = !!opts.forceNoCors;
    try {
      const res = await fetch(url, {
        method: 'POST',
        mode: useNoCors ? 'no-cors' : undefined,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(bodyObj),
        signal: AbortSignal.timeout(opts.timeoutMs || 15000),
      });

      if (useNoCors) {
        // Opaque response — can't read ok/error, but a resolved promise means
        // the request actually reached the network. That's the best signal
        // available for this mode (unchanged from the prior behavior).
        return { ok: true };
      }

      let parsed = null;
      try { parsed = await res.json(); } catch (e) { /* leave null */ }

      if (!res.ok) {
        // Real HTTP error status — a connectivity problem never gets here
        // (sw.js always answers with a 200-ish synthetic Response on
        // failure), so this is a genuine server-side error.
        return parsed || { ok: false, error: 'HTTP ' + res.status };
      }
      if (isSwOfflineMarker(parsed)) {
        await enqueue(url, bodyObj, opts.dedupeKey);
        return { ok: true, queued: true };
      }
      return parsed || { ok: false, error: 'Bad response' };
    } catch (networkErr) {
      // Real thrown network error (offline before the service worker even
      // gets a chance, or no service worker registered yet).
      await enqueue(url, bodyObj, opts.dedupeKey);
      return { ok: true, queued: true };
    }
  }

  // ── drain ──
  let draining = false; // in-flight guard — never run two drains concurrently
  async function drainQueue() {
    if (draining) return;
    draining = true;
    try {
      const items = await getAll();
      for (const item of items) {
        try {
          const res = await fetch(item.url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: item.body,
            signal: AbortSignal.timeout(15000),
          });
          let parsed = null;
          try { parsed = await res.json(); } catch (e) { /* leave null */ }
          if (res.ok && parsed && parsed.ok === true) {
            await removeById(item.id);
            notifyChange();
          }
          // Any other outcome (still offline per the sw.js marker, or a real
          // server error) — leave it queued for the next drain attempt.
        } catch (networkErr) {
          // Still genuinely offline — stop this cycle instead of hammering
          // the network on every remaining item; the next 30s tick or the
          // next 'online' event tries again.
          break;
        }
      }
    } finally {
      draining = false;
    }
  }

  function registerBackgroundSync() {
    if (!('serviceWorker' in navigator) || !('SyncManager' in global)) return;
    navigator.serviceWorker.ready
      .then(reg => reg.sync.register('aqp-sync'))
      .catch(() => {}); // best-effort only — online event + interval are the reliable path
  }

  // ── small pending-count badge, shared look across pages ──
  function mountBadge() {
    if (document.getElementById('aqpQueueBadge')) return;
    const el = document.createElement('div');
    el.id = 'aqpQueueBadge';
    el.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:9999;' +
      'background:#0B1E2D;color:#FBC62C;font:600 0.72rem -apple-system,sans-serif;' +
      'padding:6px 12px;border-radius:20px;box-shadow:0 2px 10px rgba(0,0,0,0.3);' +
      'display:none;pointer-events:none;';
    document.body.appendChild(el);
    onPendingChange(n => {
      if (n > 0) {
        el.textContent = '⏳ ' + n + ' pending sync';
        el.style.display = 'block';
      } else {
        el.style.display = 'none';
      }
    });
  }

  function init() {
    if (document.body) mountBadge();
    else document.addEventListener('DOMContentLoaded', mountBadge);
    window.addEventListener('online', drainQueue);
    setInterval(drainQueue, DRAIN_INTERVAL_MS);
    // Catch up on anything left over from a previous session in case we're
    // already online by the time this loads.
    drainQueue();
  }

  global.AQPQueue = {
    queueOrSend,
    enqueue,
    drainQueue,
    getPendingCount,
    onPendingChange,
  };

  init();
})(window);
