// Shared by index.html (chat bubble), chat.html and dispatch.html.
//  - tone(): a short two-note chime for a new message, plus a buzz on phones that support it
//  - notifyHere(): a notification while the page is open but in the background
//  - enablePush(): lock-screen notifications when the page is closed. The
//    platform server sends them (aquatic-platform src/apr-push.js) because the
//    Apps Script backend can't.
//  - Recorder: records a voice message on phones whose browser can't turn
//    speech into text (iPhone home-screen app, WhatsApp/Instagram/Facebook
//    in-app browsers, Firefox). Sent with the chatVoice action in Code.gs.
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

  window.AprAlerts = { tone, notifyHere, pushState, enablePush, canRecord, Recorder, blobToBase64, RECORD_MAX_SECS, isIOS, standalone };
})();
