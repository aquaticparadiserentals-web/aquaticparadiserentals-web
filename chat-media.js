// Photos, files and voice notes in the chat, shared by index.html, chat.html,
// dispatch.html and admin.html. Uploads go to chatAttach / staffChatAttach /
// chatAttachAdmin in Code.gs, which keep them in Drive; messages carry a marker
//   🎤 Voice message (12s): <url>   🖼️ Photo: <url>   📎 menu.pdf: <url>
// that html() turns into a player, a picture or a download link.
(function () {
  const IMAGE_MAX_SIDE = 1600;
  const IMAGE_MAX_BYTES = 6 * 1024 * 1024;
  const FILE_MAX_BYTES = 10 * 1024 * 1024;
  const FILE_ACCEPT = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,audio/*,video/mp4,video/quicktime';

  // Opens the phone's picker. accept: 'image/*' for photos (camera or gallery).
  function pick(accept) {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept || FILE_ACCEPT;
      input.style.display = 'none';
      input.onchange = () => { resolve(input.files && input.files[0] || null); input.remove(); };
      document.body.appendChild(input);
      input.click();
    });
  }

  function toBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  // Photos are shrunk to 1600px JPEG so they send quickly on beach and ship Wi-Fi.
  async function shrinkImage(file) {
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      URL.revokeObjectURL(url);
      const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.82));
      return blob || file;
    } catch (e) { return file; } // the browser can't read it (e.g. HEIC on a laptop): send as is
  }

  // file -> payload fields for the attach actions, or { error }.
  async function prepare(file, asPhoto) {
    if (!file) return null;
    const isImage = /^image\//.test(file.type);
    if (asPhoto && !isImage) return { error: 'Please choose a photo.' };
    let blob = file, mime = file.type || 'application/octet-stream';
    if (isImage && !/gif/.test(mime)) { blob = await shrinkImage(file); mime = blob.type || mime; }
    const limit = isImage ? IMAGE_MAX_BYTES : FILE_MAX_BYTES;
    if (blob.size > limit) return { error: isImage ? 'That photo is too large (6 MB max).' : 'That file is too large (10 MB max).' };
    return { kind: isImage ? 'image' : 'file', mime, fileName: file.name || '', data: await toBase64(blob), size: blob.size };
  }

  function driveId(url) { return (String(url).match(/\/d\/([\w-]{20,})/) || [])[1]; }
  function escape(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // Marker text -> HTML, or null when the message is ordinary text.
  function html(text) {
    const t = String(text || '');
    let m = t.match(/^🎤 Voice message \((\d+)s\): (https:\/\/drive\.google\.com\/\S+)$/);
    if (m) {
      const id = driveId(m[2]);
      return '<span class="cm-voice"><span>🎤 Voice message · ' + m[1] + 's</span>' +
        (id ? '<audio controls preload="none" src="https://drive.google.com/uc?export=download&amp;id=' + id + '"></audio>' : '') +
        '<a href="' + escape(m[2]) + '" target="_blank" rel="noopener">Open</a></span>';
    }
    m = t.match(/^🖼️ Photo: (https:\/\/drive\.google\.com\/\S+)$/);
    if (m) {
      const id = driveId(m[1]);
      return '<a class="cm-photo" href="' + escape(m[1]) + '" target="_blank" rel="noopener">' +
        (id ? '<img src="https://drive.google.com/thumbnail?id=' + id + '&amp;sz=w600" alt="Photo" loading="lazy" onerror="this.replaceWith(document.createTextNode(\'🖼️ View photo\'))">' : '🖼️ View photo') + '</a>';
    }
    m = t.match(/^📎 (.+?): (https:\/\/drive\.google\.com\/\S+)$/);
    if (m) return '<a class="cm-file" href="' + escape(m[2]) + '" target="_blank" rel="noopener">📎 ' + escape(m[1]) + '</a>';
    return null;
  }

  // Short text for lists and previews.
  function label(text) {
    const t = String(text || '');
    if (/^🎤 Voice message/.test(t)) return t.split(': http')[0];
    if (/^🖼️ Photo: /.test(t)) return '🖼️ Photo';
    const m = t.match(/^📎 (.+?): https/);
    return m ? '📎 ' + m[1] : t;
  }

  // Styles for the pieces html() makes; each page's bubble colours still apply.
  const css = document.createElement('style');
  css.textContent = '.cm-voice{display:flex;flex-direction:column;gap:6px}.cm-voice audio{width:220px;max-width:100%;height:36px}' +
    '.cm-voice a,.cm-file{color:inherit;font-weight:600;text-decoration:underline}' +
    '.cm-photo{display:block}.cm-photo img{display:block;max-width:220px;width:100%;max-height:260px;object-fit:cover;border-radius:8px}' +
    '.cm-tools{display:flex;gap:4px}.cm-tool{width:40px;height:40px;flex-shrink:0;border:1px solid var(--line,#E4E7EC);border-radius:8px;background:var(--card,#fff);color:var(--teal,#0E7C90);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}' +
    '.cm-tool:disabled{opacity:.5}';
  document.head.appendChild(css);

  window.AprMedia = { pick, prepare, html, label, FILE_ACCEPT };
})();
