(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MM_TO_PX = 96 / 25.4;
  const STORAGE_KEY = 'review-qr-sticker-settings-v1';
  const FONT = "'Google Sans','Product Sans',Roboto,'Segoe UI',Helvetica,Arial,sans-serif";
  const GOOGLE_COLORS = ['#4285F4', '#EA4335', '#FBBC05', '#4285F4', '#34A853', '#EA4335'];
  const STAR_COLOR = '#FBBC04';

  const PAGES = {
    letter: { w: 215.9, h: 279.4, label: 'US Letter' },
    a4: { w: 210, h: 297, label: 'A4' },
  };

  const SHAPES = {
    portrait: { sizes: { Small: 50, Medium: 60, Large: 80 }, hint: '' },
    landscape: { sizes: { Small: 76, 'Business card': 89, Large: 120 }, hint: '' },
    round: { sizes: { Small: 45, Medium: 60, Large: 80 }, hint: 'Round stickers leave out the business name to keep everything readable.' },
  };

  const ACCENTS = ['#1a73e8', '#202124', '#34a853', '#ea4335', '#fbbc04', '#7b1fa2'];

  const DEFAULTS = {
    link: '',
    businessName: '',
    headline: 'Review us on',
    cta: 'Scan to leave a review',
    shape: 'portrait',
    width: 60,
    accent: '#1a73e8',
    border: true,
    stars: true,
    centerLogo: true,
    page: 'letter',
    copies: 12,
    margin: 8,
    gap: 4,
    fill: true,
    cutGuides: true,
    place: null,
  };

  const FIELDS = {
    link: 'text', businessName: 'text', headline: 'text', cta: 'text',
    width: 'number', accent: 'color', border: 'checkbox', stars: 'checkbox', centerLogo: 'checkbox',
    page: 'select', copies: 'number', margin: 'number', gap: 'number', fill: 'checkbox', cutGuides: 'checkbox',
  };

  const LIMITS = { width: [25, 190], copies: [1, 500], margin: [0, 30], gap: [0, 30] };

  const state = loadState();

  // ---------------------------------------------------------------- helpers

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return { ...DEFAULTS, ...saved };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  }

  const r = (n) => Math.round(n * 100) / 100;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function clamp(key, value) {
    const [min, max] = LIMITS[key];
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULTS[key];
    return Math.min(max, Math.max(min, n));
  }

  /** Rough font size that makes `str` fit into `maxW` SVG units. */
  function fit(str, maxW, base, k = 0.56, min = 5) {
    const len = Math.max(1, String(str).length);
    return Math.max(min, Math.min(base, maxW / (len * k)));
  }

  function isLight(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return false;
    const v = parseInt(m[1], 16);
    const [R, G, B] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    return (0.299 * R + 0.587 * G + 0.114 * B) / 255 > 0.62;
  }

  function slug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'google-review';
  }

  // ------------------------------------------------------------ review link

  const GOOGLE_HOSTS = /(^|\.)(google\.[a-z.]+|g\.page|goo\.gl|g\.co)$/i;

  function resolveReviewUrl(input) {
    const v = String(input || '').trim();
    if (!v) return { url: '', kind: 'empty' };

    let candidate = null;
    if (/^https?:\/\//i.test(v)) candidate = v;
    else if (/^[\w.-]+\.[a-z]{2,}\//i.test(v)) candidate = 'https://' + v;

    if (candidate) {
      try {
        const u = new URL(candidate);
        return { url: u.href, kind: GOOGLE_HOSTS.test(u.hostname) ? 'google' : 'other' };
      } catch {
        return { url: '', kind: 'invalid' };
      }
    }

    if (/^[A-Za-z0-9_-]{20,}$/.test(v)) {
      return { url: 'https://search.google.com/local/writereview?placeid=' + encodeURIComponent(v), kind: 'placeid' };
    }
    return { url: '', kind: 'invalid' };
  }

  function buildQr(text) {
    const qr = qrcode(0, 'H');
    qr.addData(text);
    qr.make();
    return qr;
  }

  // ------------------------------------------------------- SVG primitives

  function gLogo(x, y, size) {
    return `<g transform="translate(${r(x)} ${r(y)}) scale(${r(size / 48 * 1000) / 1000})">` +
      '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
      '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
      '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
      '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
      '</g>';
  }

  function googleWord() {
    return 'Google'.split('').map((ch, i) => `<tspan fill="${GOOGLE_COLORS[i]}">${ch}</tspan>`).join('');
  }

  function textEl(x, y, content, { size, weight = 400, fill = '#3c4043', anchor = 'middle' }) {
    return `<text x="${r(x)}" y="${r(y)}" font-family="${FONT}" font-size="${r(size)}" font-weight="${weight}" ` +
      `fill="${fill}" text-anchor="${anchor}">${content}</text>`;
  }

  function titleMarkup(headline) {
    const h = headline.trim();
    return `${h ? esc(h) + ' ' : ''}<tspan font-weight="700">${googleWord()}</tspan>`;
  }

  function star(cx, cy, R) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? R : R * 0.45;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      pts.push(`${r(cx + rad * Math.cos(a))},${r(cy + rad * Math.sin(a))}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="${STAR_COLOR}"/>`;
  }

  function starsRow(cx, y, size, gap) {
    const total = size * 5 + gap * 4;
    let out = '';
    for (let i = 0; i < 5; i++) {
      out += star(cx - total / 2 + i * (size + gap) + size / 2, y + size * 0.55, size / 2);
    }
    return out;
  }

  function pill(cx, y, w, h, label, color, base) {
    const f = fit(label, w - h, base, 0.56);
    const fg = isLight(color) ? '#202124' : '#ffffff';
    return `<rect x="${r(cx - w / 2)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${r(h / 2)}" fill="${color}"/>` +
      textEl(cx, y + h / 2 + f * 0.36, esc(label), { size: f, weight: 600, fill: fg });
  }

  function qrBlock(qr, x, y, size, o) {
    let out = `<rect x="${r(x)}" y="${r(y)}" width="${r(size)}" height="${r(size)}" rx="${r(size * 0.07)}" ` +
      `fill="#fff" stroke="#dadce0" stroke-width="${r(size * 0.01)}"/>`;

    if (!qr) {
      const inset = size * 0.12;
      out += `<rect x="${r(x + inset)}" y="${r(y + inset)}" width="${r(size - inset * 2)}" height="${r(size - inset * 2)}" ` +
        `rx="${r(size * 0.04)}" fill="#f1f3f4" stroke="#bdc1c6" stroke-dasharray="4 3" stroke-width="${r(size * 0.008)}"/>`;
      out += textEl(x + size / 2, y + size / 2 - size * 0.02, 'Your QR code', { size: size * 0.08, weight: 600, fill: '#80868b' });
      out += textEl(x + size / 2, y + size / 2 + size * 0.09, 'appears here', { size: size * 0.08, weight: 600, fill: '#80868b' });
      return out;
    }

    const n = qr.getModuleCount();
    const quiet = 3;
    const s = size / (n + quiet * 2);
    let d = '';
    for (let row = 0; row < n; row++) {
      let c = 0;
      while (c < n) {
        if (qr.isDark(row, c)) {
          const start = c;
          while (c < n && qr.isDark(row, c)) c++;
          d += `M${start + quiet} ${row + quiet}h${c - start}v1h${start - c}z`;
        } else {
          c++;
        }
      }
    }
    out += `<g transform="translate(${r(x)} ${r(y)}) scale(${s.toFixed(5)})">` +
      `<path d="${d}" fill="#000" shape-rendering="crispEdges"/></g>`;

    if (o.centerLogo) {
      const L = n * s * 0.23;
      const lx = x + size / 2 - L / 2;
      const ly = y + size / 2 - L / 2;
      out += `<rect x="${r(lx)}" y="${r(ly)}" width="${r(L)}" height="${r(L)}" rx="${r(L * 0.22)}" fill="#fff"/>`;
      out += gLogo(lx + L * 0.14, ly + L * 0.14, L * 0.72);
    }
    return out;
  }

  function frameRect(W, H, o) {
    const stroke = o.border ? ` stroke="${o.accent}" stroke-width="4"` : '';
    return `<rect x="2" y="2" width="${W - 4}" height="${r(H - 4)}" rx="16" fill="#fff"${stroke}/>`;
  }

  // ------------------------------------------------------- sticker layouts

  function layoutPortrait(o, qr) {
    const W = 200, cx = 100, p = [];
    let y = 16;
    p.push(gLogo(cx - 15, y, 30));
    y += 30;

    const tf = fit(`${o.headline.trim()} Google`, 176, 16);
    y += 8 + tf * 0.8;
    p.push(textEl(cx, y, titleMarkup(o.headline), { size: tf, weight: 500 }));
    y += tf * 0.25;

    if (o.stars) {
      y += 6;
      p.push(starsRow(cx, y, 15, 3));
      y += 15;
    }

    y += 10;
    p.push(qrBlock(qr, 26, y, 148, o));
    y += 148;

    const name = o.businessName.trim();
    if (name) {
      const f = fit(name, 176, 15, 0.6);
      y += 10 + f * 0.8;
      p.push(textEl(cx, y, esc(name), { size: f, weight: 700, fill: '#202124' }));
      y += f * 0.25;
    }

    const cta = o.cta.trim();
    if (cta) {
      y += 10;
      p.push(pill(cx, y, 150, 22, cta, o.accent, 11.5));
      y += 22;
    }

    const H = y + 16;
    return { W, H, body: frameRect(W, H, o) + p.join('') };
  }

  function layoutLandscape(o, qr) {
    const W = 350, H = 200, cx = 268, maxW = 140, col = [];
    let y = 0;

    col.push(gLogo(cx - 16, y, 32));
    y += 32;

    const hl = o.headline.trim();
    if (hl) {
      const f = fit(hl, maxW, 15, 0.55);
      y += 8 + f * 0.8;
      col.push(textEl(cx, y, esc(hl), { size: f, weight: 500 }));
      y += f * 0.2;
    }

    y += 6 + 26;
    col.push(textEl(cx, y, googleWord(), { size: 32, weight: 700 }));
    y += 6;

    if (o.stars) {
      y += 6;
      col.push(starsRow(cx, y, 16, 3));
      y += 16;
    }

    const name = o.businessName.trim();
    if (name) {
      const f = fit(name, maxW, 14, 0.6);
      y += 10 + f * 0.8;
      col.push(textEl(cx, y, esc(name), { size: f, weight: 700, fill: '#202124' }));
      y += f * 0.25;
    }

    const cta = o.cta.trim();
    if (cta) {
      y += 10;
      col.push(pill(cx, y, maxW, 22, cta, o.accent, 10.5));
      y += 22;
    }

    const offset = (H - y) / 2;
    const body = frameRect(W, H, o) + qrBlock(qr, 16, 16, 168, o) +
      `<g transform="translate(0 ${r(offset)})">${col.join('')}</g>`;
    return { W, H, body };
  }

  function layoutRound(o, qr) {
    const W = 200, H = 200, cx = 100, p = [];
    const stroke = o.border ? ` stroke="${o.accent}" stroke-width="4"` : '';
    p.push(`<circle cx="100" cy="100" r="${o.border ? 98 : 100}" fill="#fff"${stroke}/>`);
    p.push(gLogo(cx - 12, 13, 24));

    const tf = fit(`${o.headline.trim()} Google`, 150, 12.5);
    p.push(textEl(cx, 53, titleMarkup(o.headline), { size: tf, weight: 500 }));
    p.push(qrBlock(qr, 52, 60, 96, o));

    if (o.stars) p.push(starsRow(cx, 161, 11, 2));

    const cta = o.cta.trim();
    if (cta) {
      const f = fit(cta, 92, 9);
      p.push(textEl(cx, o.stars ? 185 : 176, esc(cta), { size: f, weight: 600, fill: '#3c4043' }));
    }
    return { W, H, body: p.join('') };
  }

  const LAYOUTS = { portrait: layoutPortrait, landscape: layoutLandscape, round: layoutRound };

  function buildSticker(o, qr) {
    const layout = (LAYOUTS[o.shape] || layoutPortrait)(o, qr);
    const wmm = o.width;
    const hmm = wmm * layout.H / layout.W;
    const clip = o.shape === 'round'
      ? `<circle cx="${layout.W / 2}" cy="${r(layout.H / 2)}" r="${layout.W / 2}"/>`
      : `<rect width="${layout.W}" height="${r(layout.H)}" rx="17"/>`;
    return {
      ...layout,
      wmm,
      hmm,
      svg: (w, h, watermark = false) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.W} ${r(layout.H)}" ` +
        `width="${w}" height="${h}">${layout.body}${watermark ? watermarkMarkup(layout.W, layout.H, clip) : ''}</svg>`,
    };
  }

  function watermarkMarkup(W, H, clip) {
    const size = W * 0.1;
    let out = `<clipPath id="wm-clip">${clip}</clipPath><g clip-path="url(#wm-clip)">` +
      `<g transform="rotate(-30 ${r(W / 2)} ${r(H / 2)})" font-family="${FONT}" font-weight="800" ` +
      `font-size="${r(size)}" fill="#d93025" fill-opacity="0.2" text-anchor="middle" pointer-events="none">`;
    for (let y = -H * 0.3; y <= H * 1.3; y += size * 2.4) {
      out += `<text x="${r(W / 2)}" y="${r(y)}">PREVIEW · PREVIEW · PREVIEW</text>`;
    }
    return out + '</g></g>';
  }

  // --------------------------------------------------------------- sheets

  function sheetLayout(sticker) {
    const page = PAGES[state.page] || PAGES.letter;
    const usableW = page.w - state.margin * 2;
    const usableH = page.h - state.margin * 2;
    const cols = Math.max(0, Math.floor((usableW + state.gap) / (sticker.wmm + state.gap)));
    const rows = Math.max(0, Math.floor((usableH + state.gap) / (sticker.hmm + state.gap)));
    const perPage = cols * rows;
    const total = perPage === 0 ? 0 : (state.fill ? perPage : state.copies);
    const pages = perPage === 0 ? 0 : Math.ceil(total / perPage);
    return { page, cols, rows, perPage, total, pages };
  }

  function sheetsMarkup(sticker, sl, watermark = false) {
    const svg = sticker.svg(`${r(sticker.wmm)}mm`, `${r(sticker.hmm)}mm`, watermark);
    const classes = ['sheet', state.cutGuides ? 'cut' : '', state.shape === 'round' ? 'round' : ''].join(' ');
    const style = `width:${sl.page.w}mm;height:${r(sl.page.h - 0.4)}mm;padding:${state.margin}mm;` +
      `grid-template-columns:repeat(${sl.cols},${r(sticker.wmm)}mm);grid-auto-rows:${r(sticker.hmm)}mm;gap:${state.gap}mm;`;
    const pages = [];
    let remaining = sl.total;
    for (let i = 0; i < sl.pages; i++) {
      const count = Math.min(sl.perPage, remaining);
      remaining -= count;
      pages.push(`<div class="${classes}" style="${style}">` +
        Array.from({ length: count }, () => `<div class="cell">${svg}</div>`).join('') + '</div>');
    }
    return pages;
  }

  // -------------------------------------------------------------- render

  let current = { sticker: null, url: '', sl: null };

  function render() {
    const link = resolveReviewUrl(state.link);
    let qr = null;
    if (link.url) {
      try { qr = buildQr(link.url); } catch { link.kind = 'toolong'; link.url = ''; }
    }

    renderLinkStatus(link);

    const sticker = buildSticker(state, qr);
    current = { sticker, url: link.url, sl: sheetLayout(sticker) };

    $('sticker-preview').innerHTML = sticker.svg(sticker.W, r(sticker.H), showWatermark());
    $('qr-url').textContent = link.url || '—';

    const inches = (mm) => (mm / 25.4).toFixed(2);
    $('width-hint').textContent =
      `Sticker size: ${r(sticker.wmm)} × ${r(sticker.hmm)} mm (≈ ${inches(sticker.wmm)} × ${inches(sticker.hmm)} in)`;

    const ready = Boolean(link.url);
    ['dl-png', 'dl-svg', 'print', 'test-link'].forEach((id) => { $(id).disabled = !ready; });
    ['dl-png', 'dl-svg', 'print'].forEach((id) => {
      const btn = $(id);
      btn.textContent = (showWatermark() ? '🔒 ' : '') + btn.dataset.label;
    });
    $('copies').disabled = state.fill;

    renderSheets();
    renderShapeUi();
  }

  function renderLinkStatus(link) {
    const el = $('link-status');
    const messages = {
      empty: ['', 'Paste your Google review link or Place ID to generate the QR code.'],
      google: ['ok', '✓ Google link detected. Test it before printing.'],
      placeid: ['ok', '✓ Place ID detected — review link built automatically.'],
      other: ['warn', '⚠ This isn\'t a Google link. It will still work, but double-check it.'],
      invalid: ['err', '✗ That doesn\'t look like a link or a Place ID.'],
      toolong: ['err', '✗ That link is too long to fit in a QR code.'],
    };
    const place = state.place;
    if (place && link.url && link.url.includes(encodeURIComponent(place.placeId))) {
      el.className = 'status ok';
      el.textContent = `✓ Linked to ${place.name}${place.address ? ' — ' + place.address : ''}`;
      return;
    }
    const [cls, msg] = messages[link.kind];
    el.className = 'status ' + cls;
    el.textContent = msg;
  }

  // -------------------------------------------------------- business search

  function reviewUrlFor(placeId) {
    return 'https://search.google.com/local/writereview?placeid=' + encodeURIComponent(placeId);
  }

  function setupPlaceSearch(configPromise) {
    const input = $('place-search');
    const list = $('place-results');
    const status = $('place-status');
    let results = [];
    let optionsHtml = '';
    let active = -1;
    let timer = 0;
    let controller = null;

    const setStatus = (cls, msg) => { status.className = 'status ' + cls; status.textContent = msg; };

    function close() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    }

    function show(html) {
      list.innerHTML = html + '<li class="attribution" aria-hidden="true">powered by Google</li>';
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    function highlight(index) {
      active = index;
      list.querySelectorAll('.option').forEach((li, i) => li.setAttribute('aria-selected', String(i === index)));
      const li = list.querySelector(`#place-opt-${index}`);
      if (li) {
        input.setAttribute('aria-activedescendant', li.id);
        li.scrollIntoView({ block: 'nearest' });
      }
    }

    function choose(index) {
      const p = results[index];
      if (!p) return;
      state.place = { placeId: p.placeId, name: p.name, address: p.address };
      state.link = reviewUrlFor(p.placeId);
      if (!state.businessName.trim()) state.businessName = p.name;
      $('link').value = state.link;
      $('businessName').value = state.businessName;
      input.value = p.name;
      close();
      setStatus('', '');
      saveState();
      scheduleRender();
    }

    async function search(q) {
      controller?.abort();
      controller = new AbortController();
      show('<li class="note">Searching…</li>');
      try {
        const resp = await fetch('/api/places?q=' + encodeURIComponent(q), { signal: controller.signal });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || 'Search failed');
        results = data.results || [];
        if (!results.length) {
          show('<li class="note">No businesses found. Try adding your city or street.</li>');
          return;
        }
        optionsHtml = results.map((p, i) =>
          `<li class="option" role="option" id="place-opt-${i}" data-index="${i}" aria-selected="false">` +
          `<span class="place-name">${esc(p.name)}</span>` +
          (p.address ? `<span class="place-address">${esc(p.address)}</span>` : '') + '</li>'
        ).join('');
        show(optionsHtml);
        active = -1;
      } catch (err) {
        if (err.name === 'AbortError') return;
        close();
        setStatus('err', '✗ ' + err.message);
      }
    }

    input.addEventListener('input', () => {
      clearTimeout(timer);
      setStatus('', '');
      const q = input.value.trim();
      if (q.length < 3) {
        controller?.abort();
        results = [];
        close();
        return;
      }
      timer = setTimeout(() => search(q), 300);
    });

    input.addEventListener('keydown', (e) => {
      if (list.hidden || !results.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlight((active + 1) % results.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlight((active - 1 + results.length) % results.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        choose(active >= 0 ? active : 0);
      } else if (e.key === 'Escape') {
        close();
      }
    });

    list.addEventListener('mousedown', (e) => {
      const li = e.target.closest('.option');
      if (!li) return;
      e.preventDefault();
      choose(Number(li.dataset.index));
    });

    input.addEventListener('blur', close);
    input.addEventListener('focus', () => { if (results.length && optionsHtml) show(optionsHtml); });

    if (state.place) input.value = state.place.name;

    configPromise
      .then((cfg) => {
        if (!cfg.placesEnabled) {
          input.disabled = true;
          setStatus('warn', 'Business search needs a Google Maps API key on the server (GOOGLE_MAPS_API_KEY). You can still paste your link below.');
        }
      })
      .catch(() => {
        input.disabled = true;
        setStatus('warn', 'Business search only works when the app runs on its server (npm start). You can still paste your link below.');
      });
  }

  function renderSheets() {
    const { sticker, sl } = current;
    const container = $('sheets');
    const summary = $('sheet-summary');

    if (sl.perPage === 0) {
      summary.textContent = 'The sticker is too big for this paper. Make it smaller or reduce the margin.';
      container.innerHTML = '<div class="empty">Nothing fits on the page.</div>';
      return;
    }

    summary.textContent = `${sl.perPage} sticker${sl.perPage === 1 ? '' : 's'} fit on each ${sl.page.label} page ` +
      `(${sl.cols} × ${sl.rows}) · printing ${sl.total} on ${sl.pages} page${sl.pages === 1 ? '' : 's'}.`;

    const available = Math.max(160, container.clientWidth - 32);
    const pageWpx = sl.page.w * MM_TO_PX;
    const pageHpx = sl.page.h * MM_TO_PX;
    const scale = Math.min(1, Math.min(available, 460) / pageWpx);

    container.innerHTML = sheetsMarkup(sticker, sl, showWatermark()).map((html, i) =>
      `<div class="sheet-frame" style="width:${r(pageWpx * scale)}px;height:${r(pageHpx * scale)}px">` +
      html.replace('style="', `style="transform:scale(${scale.toFixed(4)});`) +
      `<span class="page-label">Page ${i + 1}</span></div>`).join('');
  }

  function renderShapeUi() {
    document.querySelectorAll('input[name="shape"]').forEach((el) => { el.checked = el.value === state.shape; });
    const shape = SHAPES[state.shape];
    $('shape-hint').textContent = shape.hint;
    $('size-chips').innerHTML = Object.entries(shape.sizes).map(([label, mm]) =>
      `<button type="button" class="chip${Number(state.width) === mm ? ' active' : ''}" data-mm="${mm}">${label} · ${mm} mm</button>`
    ).join('');
    document.querySelectorAll('.swatch').forEach((el) => {
      el.classList.toggle('active', el.dataset.color.toLowerCase() === state.accent.toLowerCase());
    });
  }

  // ------------------------------------------------------------- actions

  function download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function baseFilename() {
    return `${slug(state.businessName || 'google-review')}-review-qr-${state.shape}`;
  }

  function downloadSvg() {
    const { sticker } = current;
    const svg = sticker.svg(`${r(sticker.wmm)}mm`, `${r(sticker.hmm)}mm`);
    download(new Blob([svg], { type: 'image/svg+xml' }), baseFilename() + '.svg');
  }

  async function downloadPng() {
    const { sticker } = current;
    const dpi = 300;
    const w = Math.round(sticker.wmm / 25.4 * dpi);
    const h = Math.round(sticker.hmm / 25.4 * dpi);
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sticker.svg(w, h));
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    canvas.toBlob((blob) => download(blob, baseFilename() + '.png'), 'image/png');
  }

  function preparePrint() {
    const { sticker, sl } = current;
    if (isLocked()) {
      $('print-root').innerHTML = '<div class="print-locked">Printing is locked. Unlock it in the Review QR Sticker Maker with a one-time payment.</div>';
      return false;
    }
    if (!current.url || sl.perPage === 0) return false;
    $('page-style').textContent = `@page { size: ${sl.page.w}mm ${sl.page.h}mm; margin: 0; }`;
    $('print-root').innerHTML = sheetsMarkup(sticker, sl).join('');
    return true;
  }

  // ------------------------------------------------------------- payments

  const UNLOCK_KEY = 'review-qr-unlock-v1';
  const pay = { ready: false, enabled: false, unlocked: false, token: '' };

  const isLocked = () => !pay.ready || (pay.enabled && !pay.unlocked);
  const showWatermark = () => pay.ready && pay.enabled && !pay.unlocked;

  function setUnlockStatus(cls, msg) {
    const el = $('unlock-status');
    el.className = 'status ' + cls;
    el.textContent = msg;
  }

  function renderUnlock() {
    $('unlock-locked').hidden = pay.unlocked;
    $('unlock-done').hidden = !pay.unlocked;
  }

  /** Runs `action` if printing/downloads are unlocked, otherwise points the user at the unlock panel. */
  function whenUnlocked(action) {
    return () => {
      if (!pay.ready) return;
      if (!isLocked()) {
        action();
        return;
      }
      $('unlock-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
      setUnlockStatus('warn', 'Printing and downloads need a one-time unlock.');
    };
  }

  async function startCheckout() {
    const btn = $('unlock-btn');
    btn.disabled = true;
    setUnlockStatus('', 'Opening secure checkout…');
    try {
      const resp = await fetch('/api/checkout', { method: 'POST' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.url) throw new Error(data.error || 'Could not start checkout.');
      location.href = data.url;
    } catch (err) {
      btn.disabled = false;
      setUnlockStatus('err', '✗ ' + err.message);
    }
  }

  async function copyUnlockLink() {
    const link = `${location.origin}/?unlock=${encodeURIComponent(pay.token)}`;
    try {
      await navigator.clipboard.writeText(link);
      setUnlockStatus('ok', '✓ Unlock link copied. Keep it somewhere safe, like an email to yourself.');
    } catch {
      window.prompt('Copy your unlock link:', link);
    }
  }

  async function checkToken(token) {
    const resp = await fetch('/api/unlock/check?token=' + encodeURIComponent(token));
    if (!resp.ok) throw new Error('Could not check unlock code.');
    return Boolean((await resp.json()).valid);
  }

  async function setupPayments(configPromise) {
    const cfg = await configPromise.catch(() => null);
    if (!cfg?.payments?.enabled) {
      Object.assign(pay, { ready: true, enabled: false, unlocked: true });
      scheduleRender();
      return;
    }

    pay.enabled = true;
    const price = new Intl.NumberFormat(undefined, { style: 'currency', currency: cfg.payments.currency.toUpperCase() })
      .format(cfg.payments.amount / 100);
    document.querySelectorAll('.price').forEach((el) => { el.textContent = price; });
    $('unlock-card').hidden = false;

    const params = new URLSearchParams(location.search);
    const checkout = params.get('checkout');
    const sessionId = params.get('session_id');
    const linkToken = params.get('unlock');
    if (checkout || linkToken) history.replaceState(null, '', location.pathname);

    let token = '';
    let verified = false;
    if (checkout === 'success' && sessionId) {
      setUnlockStatus('', 'Confirming your payment…');
      try {
        const resp = await fetch('/api/checkout/verify?session_id=' + encodeURIComponent(sessionId));
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.token) throw new Error(data.error || 'Could not confirm your payment.');
        token = data.token;
        verified = true;
        setUnlockStatus('ok', '✓ Payment received. Thank you! Printing and downloads are unlocked.');
      } catch (err) {
        setUnlockStatus('err', `✗ ${err.message} If you were charged, reload this page or contact support with your receipt.`);
      }
    } else if (checkout === 'cancel') {
      setUnlockStatus('warn', 'Checkout was cancelled. You have not been charged.');
    }

    if (!verified) {
      const saved = localStorage.getItem(UNLOCK_KEY) || '';
      for (const candidate of [...new Set([linkToken, saved].filter(Boolean))]) {
        try {
          if (await checkToken(candidate)) {
            token = candidate;
            verified = true;
            if (candidate === linkToken) setUnlockStatus('ok', '✓ Unlocked from your saved link.');
            break;
          }
          if (candidate === linkToken) setUnlockStatus('err', '✗ That unlock link is not valid.');
          else localStorage.removeItem(UNLOCK_KEY);
        } catch {
          setUnlockStatus('err', '✗ Could not check your unlock right now. Reload the page to try again.');
          break;
        }
      }
    }

    if (verified) {
      pay.unlocked = true;
      pay.token = token;
      try { localStorage.setItem(UNLOCK_KEY, token); } catch { /* storage unavailable */ }
    }
    pay.ready = true;
    renderUnlock();
    scheduleRender();
  }

  // -------------------------------------------------------------- wiring

  function syncInputs() {
    for (const [key, type] of Object.entries(FIELDS)) {
      const el = $(key);
      if (type === 'checkbox') el.checked = Boolean(state[key]);
      else el.value = state[key];
    }
  }

  let frame = 0;
  function scheduleRender() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  }

  function init() {
    $('brand-logo').innerHTML = `<svg viewBox="0 0 48 48">${gLogo(0, 0, 48)}</svg>`;

    const swatches = $('swatches');
    ACCENTS.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = c;
      b.dataset.color = c;
      b.title = c;
      swatches.insertBefore(b, $('accent'));
    });

    syncInputs();

    for (const [key, type] of Object.entries(FIELDS)) {
      const el = $(key);
      el.addEventListener(type === 'checkbox' || type === 'select' ? 'change' : 'input', () => {
        if (type === 'checkbox') state[key] = el.checked;
        else if (type === 'number') {
          if (el.value === '') return;
          state[key] = clamp(key, el.value);
        } else state[key] = el.value;
        saveState();
        scheduleRender();
      });
      if (type === 'number') {
        el.addEventListener('blur', () => { el.value = state[key]; });
      }
    }

    document.querySelectorAll('input[name="shape"]').forEach((el) => {
      el.addEventListener('change', () => {
        state.shape = el.value;
        state.width = Object.values(SHAPES[el.value].sizes)[1];
        $('width').value = state.width;
        saveState();
        scheduleRender();
      });
    });

    $('size-chips').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      state.width = Number(chip.dataset.mm);
      $('width').value = state.width;
      saveState();
      scheduleRender();
    });

    swatches.addEventListener('click', (e) => {
      const sw = e.target.closest('.swatch');
      if (!sw) return;
      state.accent = sw.dataset.color;
      $('accent').value = state.accent;
      saveState();
      scheduleRender();
    });

    $('test-link').addEventListener('click', () => {
      if (current.url) window.open(current.url, '_blank', 'noopener');
    });
    ['dl-png', 'dl-svg', 'print'].forEach((id) => { $(id).dataset.label = $(id).textContent; });
    $('dl-svg').addEventListener('click', whenUnlocked(downloadSvg));
    $('dl-png').addEventListener('click', whenUnlocked(() => downloadPng().catch((err) => alert('PNG export failed: ' + err.message))));
    $('print').addEventListener('click', whenUnlocked(() => { if (preparePrint()) window.print(); }));
    $('unlock-btn').addEventListener('click', startCheckout);
    $('copy-unlock').addEventListener('click', copyUnlockLink);
    window.addEventListener('beforeprint', preparePrint);
    window.addEventListener('resize', () => { if (current.sticker) renderSheets(); });

    const configPromise = fetch('/api/config').then((resp) => (resp.ok ? resp.json() : Promise.reject(new Error('No server'))));
    setupPlaceSearch(configPromise);
    setupPayments(configPromise);
    render();
  }

  init();
})();
