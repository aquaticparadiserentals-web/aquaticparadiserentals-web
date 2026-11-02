// Shared by index.html (chat bubble), chat.html and dispatch.html.
//  - tone(): a short two-note chime for a new message, plus a buzz on phones that support it
//  - notifyHere(): a notification while the page is open but in the background
//  - enablePush(): lock-screen notifications when the page is closed. The
//    platform server sends them (aquatic-platform src/apr-push.js) because the
//    Apps Script backend can't.
//  - Recorder: records a voice message on phones whose browser can't turn
//    speech into text (iPhone home-screen app, WhatsApp/Instagram/Facebook
//    in-app browsers, Firefox). Sent with the chatVoice action in Code.gs.
if (window.AbortSignal && !AbortSignal.timeout) AbortSignal.timeout = ms => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
(function () {
  const PUSH_BASE = 'https://aquatic-platform.onrender.com/apr/push';
  const PUSH_KEY = 'apr_push';
  let audio = null;

  // Phones only allow sound after the person has touched the page once.
  function unlockAudio() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) { /* no Web Audio: the buzz and notification still work */ }
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, unlockAudio, { passive: true }));

  function tone() {
    try {
      if (!audio || audio.state !== 'running') unlockAudio();
      if (audio && audio.state === 'running') {
        const t = audio.currentTime;
        [[880, 0], [1320, 0.16]].forEach(([freq, at]) => {
          const o = audio.createOscillator(), g = audio.createGain();
          o.type = 'sine'; o.frequency.value = freq;
          g.gain.setValueAtTime(0.0001, t + at);
          g.gain.exponentialRampToValueAtTime(0.25, t + at + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.32);
          o.connect(g).connect(audio.destination);
          o.start(t + at); o.stop(t + at + 0.35);
        });
      }
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate([180, 90, 180]); } catch (e) {}
  }

  async function swReg() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      const existing = await navigator.serviceWorker.getRegistration();
      return existing || await navigator.serviceWorker.register('./sw.js');
    } catch (e) { return null; }
  }

  // Shown only while the page is open but hidden (another tab, screen briefly off).
  async function notifyHere(title, body, url) {
    if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
    const opts = { body: String(body || '').slice(0, 160), icon: 'icons/icon-192.png', badge: 'icons/icon-48.png',
      tag: 'apr-chat', renotify: true, data: { url: url || location.href } };
    try {
      const reg = await swReg();
      if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
    } catch (e) {}
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  // 'on' | 'off' | 'blocked' | 'ios-home' (iPhone: must be opened from the Home Screen) | 'unsupported'
  function pushState() {
    if (isIOS && !standalone) return 'ios-home';
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'denied') return 'blocked';
    try { return Notification.permission === 'granted' && localStorage.getItem(PUSH_KEY) ? 'on' : 'off'; } catch (e) { return 'off'; }
  }

  function keyBytes(b64) {
    const s = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(s, c => c.charCodeAt(0));
  }

  // who: { convo } for a guest, { token } for staff/owner. Must run from a tap.
  async function enablePush(who) {
    const state = pushState();
    if (state === 'ios-home') return { ok: false, error: 'On iPhone: tap Share, then "Add to Home Screen", open the app from there and turn alerts on again.' };
    if (state === 'unsupported') return { ok: false, error: 'This browser can\'t show alerts when closed. Open the page in Chrome or Safari.' };
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, error: 'Notifications are blocked. Allow them for this site in your browser settings.' };
    try {
      const reg = await swReg();
      if (!reg) throw new Error('no service worker');
      await navigator.serviceWorker.ready;
      const k = await fetch(PUSH_BASE + '/key', { signal: AbortSignal.timeout(20000) }).then(r => r.json());
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(k.key) });
      const d = await fetch(PUSH_BASE + '/subscribe', { method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(Object.assign({ sub: sub.toJSON() }, who)), signal: AbortSignal.timeout(30000) }).then(r => r.json());
      if (!d.ok) return { ok: false, error: d.error || 'Could not turn alerts on' };
      try { localStorage.setItem(PUSH_KEY, d.role || '1'); } catch (e) {}
      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'Could not turn alerts on. Check your connection and try again.' };
    }
  }

  // ── Voice messages ──
  const RECORD_MAX_SECS = 60;
  const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

  function pickMime() {
    const options = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    for (const m of options) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) {} }
    return '';
  }

  // onTick(seconds) while recording; resolves with { blob, mime, secs } or null if cancelled.
  function Recorder(onTick) {
    let rec = null, stream = null, chunks = [], started = 0, timer = null, cancelled = false, done;
    const finished = new Promise(r => { done = r; });
    this.start = async () => {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        clearInterval(timer);
        stream.getTracks().forEach(t => t.stop());
        const secs = Math.round((Date.now() - started) / 1000);
        const type = (rec.mimeType || mime || 'audio/webm').split(';')[0];
        done(cancelled || !chunks.length || secs < 1 ? null : { blob: new Blob(chunks, { type }), mime: type, secs });
      };
      started = Date.now();
      rec.start(1000);
      timer = setInterval(() => {
        const s = Math.round((Date.now() - started) / 1000);
        if (onTick) onTick(s);
        if (s >= RECORD_MAX_SECS) this.stop();
      }, 500);
    };
    this.stop = () => { if (rec && rec.state !== 'inactive') rec.stop(); return finished; };
    this.cancel = () => { cancelled = true; return this.stop(); };
    this.done = finished;
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  // ── Voice notes with no signal ──
  // A finished recording is saved on this phone first, then sent. No signal, a dropped
  // upload or a closed page loses nothing: it goes out when the connection is back.
  // Saved clips stay on this device only and are removed once sent, when the person
  // deletes them, or after KEEP_MS. Logins are never saved with them.
  const OUT_DB = 'apr-voice-outbox', OUT_STORE = 'clips';
  const KEEP_MS = 7 * 86400000, RETRY_MS = 30000, MAX_TRIES = 5;
  let outCfg = null, outDraining = false, outDbP = null;

  function outDb() {
    if (outDbP) return outDbP;
    outDbP = new Promise((resolve, reject) => {
      const req = indexedDB.open(OUT_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(OUT_STORE, { keyPath: 'id', autoIncrement: true });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return outDbP;
  }
  async function outTx(mode, fn) {
    const db = await outDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OUT_STORE, mode);
      const res = fn(tx.objectStore(OUT_STORE));
      tx.oncomplete = () => resolve(res && res.result);
      tx.onerror = () => reject(tx.error);
    });
  }
  const outAll = async () => ((await outTx('readonly', s => s.getAll())) || []).filter(c => outCfg && c.role === outCfg.role);
  const outDelete = id => outTx('readwrite', s => s.delete(id));

  async function outPaint() {
    let clips = [];
    try { clips = await outAll(); } catch (e) {}
    let bar = document.getElementById('aprOutbox');
    if (!clips.length) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'aprOutbox';
      bar.setAttribute('role', 'status');
      bar.style.cssText = 'position:fixed;left:12px;right:12px;top:12px;z-index:900;max-width:460px;margin:0 auto;background:#0B1E33;color:#fff;border-radius:12px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;font:500 14px/1.35 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3)';
      document.body.appendChild(bar);
    }
    const n = clips.length, stuck = clips.some(c => c.tries >= MAX_TRIES);
    const what = n === 1 ? '1 voice note' : n + ' voice notes';
    const text = stuck ? what + " couldn't be sent." : navigator.onLine ? 'Sending ' + what + '…' : what + ' saved on this phone. Sends by itself when you have signal.';
    const btn = 'border:0;border-radius:8px;background:#fff;color:#0B1E33;font:inherit;font-weight:600;min-height:44px;padding:0 12px;cursor:pointer;flex:none';
    bar.innerHTML = '<span style="min-width:0">' + text + '</span><span style="display:flex;gap:6px;flex:none">'
      + (stuck ? '<button type="button" data-a="retry" style="' + btn + '">Try again</button>' : '')
      + '<button type="button" data-a="del" style="' + btn + ';background:rgba(255,255,255,.16);color:#fff">Delete</button></span>';
    bar.onclick = async e => {
      const a = e.target.getAttribute && e.target.getAttribute('data-a');
      if (a === 'del' && confirm('Delete the unsent voice note' + (n === 1 ? '' : 's') + ' from this phone?')) outClear();
      if (a === 'retry') {
        for (const c of await outAll()) { c.tries = 0; await outTx('readwrite', s => s.put(c)); }
        outDrain();
      }
    };
  }

  async function outDrain() {
    if (!outCfg || outDraining) return;
    outDraining = true;
    try {
      for (const c of await outAll()) {
        if (Date.now() - c.at > KEEP_MS) { await outDelete(c.id); continue; }
        if (c.tries >= MAX_TRIES) continue;
        if (!navigator.onLine) break;
        let d;
        try { d = await outCfg.send(c.payload); } catch (e) { break; } // no connection: next try
        if (d && d.ok) { await outDelete(c.id); if (outCfg.onSent) outCfg.onSent(d, c.payload); continue; }
        if (d && d.error === 'Offline') break; // sw.js's answer when there's no signal
        c.tries = (c.tries || 0) + 1;
        await outTx('readwrite', s => s.put(c));
      }
    } catch (e) { /* storage unavailable: nothing was saved, nothing to send */ }
    outDraining = false;
    outPaint();
  }

  async function outClear() {
    try { for (const c of await outAll()) await outDelete(c.id); } catch (e) {}
    outPaint();
  }

  // Returns false if this phone can't save (private browsing): send it the ordinary way instead.
  async function outAdd(payload) {
    if (!outCfg) return false;
    try {
      await outTx('readwrite', s => s.add({ role: outCfg.role, payload, at: Date.now(), tries: 0 }));
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) { return false; }
    outPaint();
    outDrain();
    return true;
  }

  // opts: { role: 'guest' | 'team', send(payload) -> Promise({ ok, error }), onSent(result, payload) }
  function outStart(opts) {
    const first = !outCfg;
    outCfg = opts;
    if (first) {
      window.addEventListener('online', outDrain);
      window.addEventListener('offline', outPaint);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) outDrain(); });
      setInterval(() => { if (!document.hidden) outDrain(); }, RETRY_MS);
    }
    outDrain();
  }

  // A notification tapped while this page is already open (sw.js): jump to its chat or call.
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => {
    if (!e.data || e.data.type !== 'apr-open') return;
    try { const u = new URL(e.data.url, location.href); if (u.hash && u.hash !== location.hash) location.hash = u.hash; } catch (x) {}
  });

  window.AprAlerts = { tone, notifyHere, pushState, enablePush, canRecord, Recorder, blobToBase64, RECORD_MAX_SECS, isIOS, standalone,
    outbox: { start: outStart, add: outAdd, clear: outClear } };
})();
