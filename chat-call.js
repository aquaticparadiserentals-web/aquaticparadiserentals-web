// In-app voice calls between a guest and the team, shared by the guest pages
// (index.html, chat.html) and the staff pages (dispatch.html, admin.html).
// The audio goes phone to phone (WebRTC). The platform server on Render
// (aquatic-platform src/apr-call.js) rings staff and passes the connection
// details; Code.gs chatCallRing rings Telegram/WhatsApp and chatCallLog
// writes "Call · 2:14" or "Missed call" into the chat. Nothing is recorded.
(function () {
  const BASE = window.APR_CALL_BASE || 'https://aquatic-platform.onrender.com/apr/call'; // override only for local testing
  let active = null;   // the call on screen
  let ringing = new Map(); // staff: id -> { name, convo }
  let ringTimer = null;

  const post = (path, body) => fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000) }).then(r => r.json());

  // ── Screen ──
  const css = document.createElement('style');
  css.textContent = `
  .cc-wrap{position:fixed;inset:0;z-index:1000;background:rgba(6,14,26,.72);display:flex;align-items:center;justify-content:center;padding:16px}
  .cc-card{width:min(340px,100%);background:#0B1E33;color:#fff;border-radius:18px;padding:28px 22px 22px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4);font-family:inherit}
  .cc-avatar{width:72px;height:72px;border-radius:50%;margin:0 auto 14px;background:#0E7C90;display:flex;align-items:center;justify-content:center;font-size:1.6rem;font-weight:700}
  .cc-name{font-size:1.2rem;font-weight:700;margin:0 0 4px}
  .cc-status{font-size:.9rem;opacity:.8;margin:0 0 22px;min-height:1.3em}
  .cc-row{display:flex;justify-content:center;gap:18px;flex-wrap:wrap}
  .cc-btn{border:0;border-radius:999px;min-width:64px;height:64px;padding:0 18px;font:inherit;font-size:.85rem;font-weight:700;cursor:pointer;color:#fff;display:flex;align-items:center;justify-content:center;gap:8px}
  .cc-btn svg{width:24px;height:24px}
  .cc-end{background:#D63A3A}.cc-ok{background:#16A34A}.cc-mute{background:rgba(255,255,255,.14)}.cc-mute.on{background:#fff;color:#0B1E33}
  .cc-link{margin-top:14px;background:none;border:0;color:#fff;opacity:.8;text-decoration:underline;font:inherit;font-size:.85rem;cursor:pointer}
  .cc-ring{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:999;background:#0B1E33;color:#fff;border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);width:min(420px,calc(100vw - 24px))}
  .cc-ring b{display:block;font-size:.95rem}.cc-ring small{opacity:.8}
  .cc-ring .cc-btn{height:44px;min-width:44px;padding:0 14px}
  @media (prefers-reduced-motion:no-preference){.cc-pulse{animation:ccPulse 1.4s ease-in-out infinite}}
  @keyframes ccPulse{50%{box-shadow:0 0 0 12px rgba(14,124,144,.25)}}`;
  document.head.appendChild(css);

  const ICON_END = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85a1 1 0 0 1-1.41-.03L.29 13.08a1 1 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67a1 1 0 0 1 0 1.41l-2.48 2.48a1 1 0 0 1-1.41.03 11.1 11.1 0 0 0-2.66-1.85 1 1 0 0 1-.56-.9v-3.1A15 15 0 0 0 12 9z"/></svg>';
  const ICON_CALL = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';
  const ICON_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function showScreen(name, status) {
    closeScreen();
    const w = document.createElement('div');
    w.className = 'cc-wrap'; w.id = 'ccScreen';
    w.setAttribute('role', 'dialog'); w.setAttribute('aria-label', 'Voice call');
    w.innerHTML = `<div class="cc-card">
      <div class="cc-avatar cc-pulse" id="ccAvatar">${esc((name || '?').trim().charAt(0).toUpperCase())}</div>
      <p class="cc-name">${esc(name)}</p>
      <p class="cc-status" id="ccStatus" aria-live="polite">${esc(status)}</p>
      <div class="cc-row" id="ccButtons">
        <button class="cc-btn cc-mute" id="ccMute" type="button" aria-pressed="false" aria-label="Mute" hidden>${ICON_MIC}</button>
        <button class="cc-btn cc-end" id="ccEnd" type="button" aria-label="Hang up">${ICON_END}</button>
      </div></div>`;
    document.body.appendChild(w);
    w.querySelector('#ccEnd').onclick = () => hangUp();
    w.querySelector('#ccMute').onclick = toggleMute;
  }
  function setStatus(t) { const el = document.getElementById('ccStatus'); if (el) el.textContent = t; }
  function closeScreen() { const w = document.getElementById('ccScreen'); if (w) w.remove(); }

  function toggleMute() {
    if (!active || !active.mic) return;
    active.muted = !active.muted;
    active.mic.getAudioTracks().forEach(t => { t.enabled = !active.muted; });
    const b = document.getElementById('ccMute');
    b.classList.toggle('on', active.muted);
    b.setAttribute('aria-pressed', active.muted ? 'true' : 'false');
    b.setAttribute('aria-label', active.muted ? 'Unmute' : 'Mute');
  }

  function startTimer() {
    active.answeredAt = Date.now();
    document.getElementById('ccAvatar')?.classList.remove('cc-pulse');
    document.getElementById('ccMute').hidden = false;
    active.clock = setInterval(() => {
      const s = Math.round((Date.now() - active.answeredAt) / 1000);
      setStatus(Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'));
    }, 1000);
  }

  // ── Connection (both sides) ──
  function connect(iceServers, offerer) {
    const pc = new RTCPeerConnection({ iceServers });
    active.pc = pc;
    active.mic.getTracks().forEach(t => pc.addTrack(t, active.mic));
    pc.onicecandidate = e => { if (e.candidate) post('/signal', { id: active.id, key: active.key, data: { cand: e.candidate.toJSON() } }).catch(() => {}); };
    pc.ontrack = e => {
      let a = document.getElementById('ccAudio');
      if (!a) { a = document.createElement('audio'); a.id = 'ccAudio'; a.autoplay = true; a.setAttribute('playsinline', ''); document.body.appendChild(a); }
      a.srcObject = e.streams[0];
      a.play().catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (!active || active.pc !== pc) return;
      if (pc.connectionState === 'connected' && !active.answeredAt) startTimer();
      if (pc.connectionState === 'failed') { setStatus('Connection failed. The network may be blocking calls.'); setTimeout(() => hangUp(), 2500); }
    };
    if (offerer) {
      pc.createOffer().then(o => pc.setLocalDescription(o))
        .then(() => post('/signal', { id: active.id, key: active.key, data: { sdp: pc.localDescription.toJSON() } }));
    }
    setStatus('Connecting…');
  }

  async function onSignal(data) {
    const pc = active && active.pc;
    if (!pc || !data) return;
    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        await pc.setLocalDescription(await pc.createAnswer());
        post('/signal', { id: active.id, key: active.key, data: { sdp: pc.localDescription.toJSON() } });
      }
      (active.pendingCands || []).splice(0).forEach(c => pc.addIceCandidate(c).catch(() => {}));
    } else if (data.cand) {
      if (pc.remoteDescription) pc.addIceCandidate(data.cand).catch(() => {});
      else (active.pendingCands = active.pendingCands || []).push(data.cand);
    }
  }

  function listen(handlers) {
    const es = new EventSource(BASE + '/stream?id=' + active.id + '&key=' + active.key);
    active.es = es;
    Object.entries(handlers).forEach(([ev, fn]) => es.addEventListener(ev, e => { try { fn(JSON.parse(e.data || '{}')); } catch (x) {} }));
    es.addEventListener('signal', e => { try { onSignal(JSON.parse(e.data)); } catch (x) {} });
  }

  function cleanup() {
    if (!active) return null;
    const a = active;
    active = null;
    clearInterval(a.clock);
    try { a.es && a.es.close(); } catch (e) {}
    try { a.pc && a.pc.close(); } catch (e) {}
    try { a.mic && a.mic.getTracks().forEach(t => t.stop()); } catch (e) {}
    const au = document.getElementById('ccAudio'); if (au) au.remove();
    return a;
  }

  function hangUp(silent) {
    if (!active) { closeScreen(); return; }
    const a = active;
    post('/end', { id: a.id, key: a.key }).catch(() => {});
    finish(a.answeredAt ? 'answered' : (a.role === 'guest' ? 'cancelled' : 'ended'), silent);
  }

  function finish(result, silent) {
    const a = cleanup();
    if (!a) return;
    const secs = a.answeredAt ? Math.round((Date.now() - a.answeredAt) / 1000) : 0;
    if (a.role === 'guest' && a.onEnd) a.onEnd(a.answeredAt ? 'answered' : result, secs, a.by || '');
    if (silent) { closeScreen(); return; }
    setStatus(a.answeredAt ? 'Call ended' : result === 'missed' ? 'No one could answer right now.' : 'Call ended');
    if (a.role === 'guest' && !a.answeredAt && result === 'missed' && a.onVoiceMessage) {
      const row = document.getElementById('ccButtons');
      row.innerHTML = '<button class="cc-btn cc-ok" type="button" id="ccVm">Leave a voice message</button><button class="cc-btn cc-mute" type="button" id="ccClose">Close</button>';
      row.querySelector('#ccVm').onclick = () => { closeScreen(); a.onVoiceMessage(); };
      row.querySelector('#ccClose').onclick = closeScreen;
      return;
    }
    setTimeout(closeScreen, 1500);
  }

  async function getMic() {
    if (!navigator.mediaDevices || !window.RTCPeerConnection) throw new Error('Calls don\'t work in this browser. Open the page in Chrome or Safari.');
    try { return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { throw new Error('Allow the microphone to call us.'); }
  }

  // ── Guest ──
  // opts: { convo, name, ring(callId) -> Promise (Telegram/WhatsApp ring), onEnd(result, secs, by), onVoiceMessage() }
  async function guestCall(opts) {
    if (active) return;
    let mic;
    try { mic = await getMic(); } catch (e) { return { ok: false, error: e.message }; }
    active = { role: 'guest', mic, onEnd: opts.onEnd, onVoiceMessage: opts.onVoiceMessage };
    showScreen('Aquatic Paradise', 'Calling the team…');
    let d;
    try { d = await post('/start', { convo: opts.convo, name: opts.name }); }
    catch (e) { d = { ok: false, error: 'No connection. Check your internet and try again.' }; }
    if (!active) return { ok: true }; // hung up while connecting
    if (!d.ok) { cleanup(); closeScreen(); return { ok: false, error: d.error || 'Could not start the call.' }; }
    Object.assign(active, { id: d.id, key: d.key, ice: d.iceServers });
    if (opts.ring) opts.ring(d.id).catch(() => {});
    listen({
      answered: m => { active.by = m.by || ''; setStatus((m.by ? m.by + ' answered' : 'Answered') + '. Connecting…'); connect(active.ice, true); },
      missed: () => finish('missed'),
      ended: () => finish('ended'),
      cancelled: () => finish('ended'),
    });
    return { ok: true };
  }

  // ── Staff ──
  // opts: { token, staffName() -> string, onAnswered({ convo, name }) }
  let staffOpts = null, staffSession = null, staffES = null;
  async function staffInit(opts) {
    staffOpts = opts;
    try {
      const d = await post('/staff-session', { token: opts.token });
      if (!d.ok) return;
      staffSession = d.session;
      openStaffStream();
      const m = location.hash.match(/^#call=([a-f0-9]{24})$/);
      if (m) { history.replaceState(null, '', location.pathname); answer(m[1]); }
    } catch (e) { setTimeout(() => staffInit(opts), 15000); }
  }
  function openStaffStream() {
    if (staffES) staffES.close();
    staffES = new EventSource(BASE + '/staff-stream?s=' + staffSession);
    staffES.addEventListener('ring', e => { const c = JSON.parse(e.data); ringing.set(c.id, c); paintRing(); });
    staffES.addEventListener('gone', e => { ringing.delete(JSON.parse(e.data).id); paintRing(); });
    staffES.onerror = () => { /* EventSource reconnects by itself */ };
  }
  function paintRing() {
    let bar = document.getElementById('ccRingBar');
    const first = [...ringing.values()][0];
    if (!first || active) {
      if (bar) bar.remove();
      clearInterval(ringTimer); ringTimer = null;
      return;
    }
    if (!bar) { bar = document.createElement('div'); bar.id = 'ccRingBar'; bar.className = 'cc-ring'; bar.setAttribute('role', 'alert'); document.body.appendChild(bar); }
    bar.innerHTML = `<div style="flex:1;min-width:0"><b>${esc(first.name)} is calling</b><small>Guest chat #${esc(first.convo.slice(0, 6))}</small></div>
      <button class="cc-btn cc-end" type="button" aria-label="Dismiss">${ICON_END}</button>
      <button class="cc-btn cc-ok" type="button">${ICON_CALL} Answer</button>`;
    bar.querySelector('.cc-end').onclick = () => { ringing.delete(first.id); paintRing(); };
    bar.querySelector('.cc-ok').onclick = () => answer(first.id);
    if (!ringTimer && window.AprAlerts) { AprAlerts.tone(); ringTimer = setInterval(() => AprAlerts.tone(), 2200); }
    if (window.AprAlerts) AprAlerts.notifyHere(first.name + ' is calling', 'Tap to answer', location.pathname + '#call=' + first.id);
  }
  async function answer(id) {
    if (active) return;
    const name = (staffOpts.staffName && staffOpts.staffName()) || '';
    let mic;
    try { mic = await getMic(); } catch (e) { alert(e.message); return; }
    const d = await post('/answer', { id, session: staffSession, name }).catch(() => ({ ok: false, error: 'No connection.' }));
    ringing.delete(id); paintRing();
    if (!d.ok) { mic.getTracks().forEach(t => t.stop()); alert(d.error || 'Could not answer.'); return; }
    active = { role: 'staff', id, key: d.key, mic };
    showScreen(d.name, 'Connecting…');
    listen({ ended: () => finish('ended'), cancelled: () => finish('ended'), missed: () => finish('ended') });
    connect(d.iceServers, false);
    if (staffOpts.onAnswered) staffOpts.onAnswered({ convo: d.convo, name: d.name });
  }

  window.addEventListener('pagehide', () => { if (active) hangUp(true); });
  window.AprCall = { guestCall, staffInit, answer, supported: !!(window.RTCPeerConnection && navigator.mediaDevices) };
})();
