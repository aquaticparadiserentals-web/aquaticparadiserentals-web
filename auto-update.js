// Keeps every open page on the newest version, at the same link. Compares the
// server's fingerprint (ETag) of this page and its shared scripts, on a timer
// and whenever the phone comes back to the page, so no version number has to be
// bumped by hand. An idle page reloads itself; a page someone is using (or a
// staff page, where a reload can ask for the PIN and stop calls ringing: add
// data-ask to its script tag) offers a Refresh bar instead. Never during a call.
(function () {
  const FILES = [location.pathname, 'sw.js', 'chat-call.js', 'chat-alerts.js', 'chat-media.js', 'apr-config.js', 'offline-queue.js'];
  const EVERY_MS = 10 * 60000;
  const IDLE_MS = 30 * 60000;
  const askOnly = !!(document.currentScript && 'ask' in document.currentScript.dataset);
  let seen = null, lastUse = 0, lastCheck = 0;

  ['input', 'pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { lastUse = Date.now(); }, { passive: true, capture: true }));

  async function fingerprint() {
    const tags = await Promise.all(FILES.map(f => fetch(f, { method: 'HEAD', cache: 'no-store' })
      .then(r => { if (!r.ok) return ''; return r.headers.get('etag') || r.headers.get('last-modified') || ''; })));
    return tags.join('|');
  }
  function busy() { return !!(window.AprCall && AprCall.inCall && AprCall.inCall()); }
  function offerRefresh() {
    if (document.getElementById('auBar')) return;
    const bar = document.createElement('div');
    bar.id = 'auBar';
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:998;max-width:420px;margin:0 auto;background:#0B1E33;color:#fff;border-radius:12px;padding:10px 12px 10px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;font:600 14px system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3)';
    bar.innerHTML = '<span>New version ready</span><button type="button" style="border:0;border-radius:8px;background:#fff;color:#0B1E33;font:inherit;min-height:44px;padding:0 16px;cursor:pointer">Refresh</button>';
    bar.querySelector('button').onclick = () => location.reload();
    document.body.appendChild(bar);
  }
  async function check() {
    if (Date.now() - lastCheck < 60000 || !navigator.onLine) return;
    lastCheck = Date.now();
    let now;
    try { now = await fingerprint(); } catch (e) { return; }
    if (seen === null) { seen = now; return; }
    if (now === seen) return;
    if (navigator.serviceWorker) navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {});
    if (busy()) { lastCheck = 0; return; } // look again after the call
    if (!askOnly && Date.now() - lastUse > IDLE_MS) location.reload();
    else offerRefresh();
  }
  check();
  setInterval(() => { if (!document.hidden) check(); }, EVERY_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
})();
