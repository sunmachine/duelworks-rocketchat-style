/* DevTools helpers for iterating on custom.css against the live Rocket.Chat.
   Paste this whole file into the page (DevTools console, or an agent's
   "run JS in page" tool). Page reloads wipe window state — re-paste after
   any refresh (including after the admin saves new Custom CSS).

   Quick reference
     ccApply(css)          inject/replace test CSS at production position
     ccAudit()             list our rules that lose to later Fuselage !important rules
     ccRestore()           remove test CSS, re-enable the live sheet
     ccGo(path)            in-app navigation that keeps window state (no reload)
     ccStore(name, css)    keep a CSS variant in localStorage (survives reloads)
     ccUse(name)           live sheet off, variant on, transitions off
     ccCompare(a, b)       computed-style diff of every element, variant a vs b
     ccGroup()             summarize the last ccCompare by element + property
     ccLiveHash()          SHA-256 prefix of the CSS the server is serving
     ccSanitize()          swap names, avatars, channels, text, media for
                           Lorem Ipsum placeholders (DOM only; reload restores)

   Strip comments and the @font-face block from custom.css before storing it
   as a variant (the font is already loaded by the live sheet). */

const ccLiveLink = () => [...document.querySelectorAll('link[rel=stylesheet]')]
  .find(l => l.getAttribute('href').includes('css-theme'));

// Production position = right AFTER the live custom stylesheet (~sheet #2 of
// ~19). Fuselage's runtime sheets load later and win same-specificity
// !important ties; appending at the end of <head> would hide that.
window.ccApply = (css) => {
  let s = document.getElementById('cc-test');
  if (!s) { s = document.createElement('style'); s.id = 'cc-test'; ccLiveLink().after(s); }
  s.textContent = css;
  return 'applied ' + css.length;
};

window.ccRestore = () => {
  document.getElementById('cc-test')?.remove();
  document.getElementById('cc-notrans')?.remove();
  ccLiveLink().disabled = false;
  return 'restored live css';
};

window.ccGo = async (path) => {
  history.pushState({}, '', path);
  dispatchEvent(new PopStateEvent('popstate'));
  await new Promise(r => setTimeout(r, 2500));
  return location.pathname;
};

window.ccStore = (name, css) => { localStorage.setItem('cc-' + name, css); return name + '=' + css.length; };

window.ccUse = (name) => {
  ccLiveLink().disabled = true;
  ccApply(localStorage.getItem('cc-' + name));
  let nt = document.getElementById('cc-notrans');
  if (!nt) {
    nt = document.createElement('style'); nt.id = 'cc-notrans';
    nt.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
    document.head.appendChild(nt);
  }
  return name;
};

window.ccLiveHash = async () => {
  const t = await fetch(ccLiveLink().getAttribute('href').split('?')[0], { cache: 'no-store' }).then(r => r.text());
  const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return h.slice(0, 16) + ' (' + new TextEncoder().encode(t).length + ' bytes)';  // compare: shasum -a 256 custom.css
};

// Specificity audit: for every selector in #cc-test matching on-screen
// elements, report later-loaded !important declarations on the same property
// with >= specificity. Hover/focus rules are compared against their
// counterparts. Write selector lists out in full (it splits on top-level commas).
window.ccAudit = () => {
  const spec = (sel) => { let s = sel.replace(/::?(before|after)\b/g, ' X'); const notInner = []; s = s.replace(/:not\(([^)]*)\)/g, (m, i) => { notInner.push(i); return ''; }); s = s.replace(/:(is|where|has)\([^)]*\)/g, ''); const a = (s.match(/#[\w-]+/g) || []).length; const b = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length; const c = (s.replace(/\[[^\]]+\]/g, '').match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length; let r = [a, b, c]; notInner.forEach(i => { const t = spec(i); r = [r[0] + t[0], r[1] + t[1], r[2] + t[2]]; }); return r; };
  const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  const sheets = [...document.styleSheets]; const ti = sheets.findIndex(s => s.ownerNode?.id === 'cc-test');
  const flat = (rs, out = []) => { for (const r of rs) { if (r.cssRules && !r.selectorText) flat(r.cssRules, out); else if (r.selectorText) out.push(r); } return out; };
  const ours = flat(sheets[ti].cssRules);
  const later = []; sheets.slice(ti + 1).forEach(s => { if (s.ownerNode?.id === 'cc-notrans') return; try { flat(s.cssRules).forEach(r => { if ([...r.style].some(p => r.style.getPropertyPriority(p))) later.push(r); }); } catch (e) {} });
  const strip = s => s.replace(/:(hover|focus|focus-visible|focus-within|active)\b/g, '');
  const losses = new Set(); let checked = 0;
  for (const r of ours) for (const ourSel of r.selectorText.split(/,(?![^(]*\))/).map(x => x.trim())) {
    let els; try { els = [...document.querySelectorAll(strip(ourSel))].slice(0, 30); } catch (e) { continue; }
    if (!els.length) continue; checked++;
    const ourState = /:(hover|focus)/.test(ourSel);
    for (const p of r.style) for (const lr of later) {
      if (!lr.style.getPropertyPriority(p)) continue;
      for (const ls of lr.selectorText.split(/,(?![^(]*\))/).map(x => x.trim())) {
        if (/:(hover|focus)/.test(ls) && !ourState) continue;
        let hit = false; try { hit = els.some(e => e.matches(strip(ls))); } catch (e) {}
        if (hit && cmp(spec(ls), spec(ourSel)) >= 0) losses.add(ourSel + ' [' + p + '] <- ' + ls);
      }
    }
  }
  return 'checked ' + checked + ' | losing: ' + (losses.size ? '\n' + [...losses].join('\n') : 'none');
};

// ---- computed-style regression diff -----------------------------------------
window.ccProps = ['color', 'background-color', 'background-image', 'background-size', 'background-position', 'background-clip',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-color', 'border-bottom-color', 'border-left-color', 'border-right-color', 'border-top-style',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'font-size', 'font-weight', 'font-family', 'line-height', 'letter-spacing', 'text-decoration-line',
  'box-shadow', 'outline-style', 'outline-color', 'clip-path', 'opacity', 'display', 'visibility', 'gap',
  'overflow-x', 'overflow-y', 'align-items', 'box-sizing', 'content'];

window.ccDesc = (e) => {
  const keep = el => [...el.classList].filter(x => !x.startsWith('rcx-css') && !x.startsWith('rcx-box'));
  const c = keep(e).slice(0, 2).join('.'), p = e.parentElement ? keep(e.parentElement).slice(0, 1).join('.') : '';
  return (p ? p + ' > ' : '') + e.tagName.toLowerCase() + (c ? '.' + c : '');
};

window.ccSnap = () => {
  const m = new Map();
  [...document.body.querySelectorAll('*')].filter(e => !e.closest('#cc-phone')).forEach((e, idx) => {
    const s = getComputedStyle(e);
    m.set(e, ccProps.map(p => s.getPropertyValue(p)));
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(e, pseudo);
      if (ps.content && ps.content !== 'none' && ps.content !== 'normal') m.set(pseudo + '|' + ccDesc(e) + '|' + idx, ccProps.map(p => ps.getPropertyValue(p)));
    }
  });
  return m;
};

// Run a self-test first: ccCompare('x','x') must report 0 changed values.
// Focuses a visible message so the hover toolbar exists in both snapshots.
window.ccCompare = async (a, b) => {
  const focusMsg = [...document.querySelectorAll('.rcx-message')].find(x => x.getBoundingClientRect().top > 100 && x.getBoundingClientRect().bottom < innerHeight - 150);
  ccUse(a); focusMsg?.focus(); await new Promise(r => setTimeout(r, 400)); const A = ccSnap();
  ccUse(b); focusMsg?.focus(); await new Promise(r => setTimeout(r, 400)); const B = ccSnap();
  const diffs = new Map(); let n = 0, missing = 0;
  for (const [k, va] of A) {
    const vb = B.get(k); if (!vb) { missing++; continue; }
    va.forEach((v, i) => {
      if (v === vb[i]) return;
      n++;
      const key = (typeof k === 'string' ? k.split('|').slice(0, 2).join(' ') : ccDesc(k)) + ' [' + ccProps[i] + '] ' + v.slice(0, 60) + ' -> ' + vb[i].slice(0, 60);
      diffs.set(key, (diffs.get(key) || 0) + 1);
    });
  }
  window.ccLastDiff = diffs;
  return 'elements=' + A.size + ' changed-values=' + n + ' unmatched=' + missing + (diffs.size ? '' : ' — NO DIFFERENCES');
};

window.ccGroup = () => {
  const g = new Map();
  for (const [k, c] of ccLastDiff) {
    const m = k.match(/^(.*?) \[([\w-]+)\] (.*) -> (.*)$/); if (!m) continue;
    const [, el, prop, a, b] = m;
    const fam = /radius/.test(prop) ? 'radius' : /border-.*color/.test(prop) ? 'border-color' : /^(width|height|min-width|min-height)$/.test(prop) ? 'size' : /margin|padding/.test(prop) ? 'spacing' : prop;
    const key = el + ' {' + fam + '} ' + a.slice(0, 30) + ' → ' + b.slice(0, 30);
    g.set(key, (g.get(key) || 0) + c);
  }
  return [...g].map(([k, c]) => c + '× ' + k).join('\n');
};

// ---- README screenshots -------------------------------------------------------
// Replaces everything identifying in the current view with placeholders, in the
// DOM only (nothing is sent; a reload restores it). React may re-render parts
// on new activity, so screenshot right after running it, then audit the result:
// it returns any remaining visible text that isn't Lorem Ipsum or a known label.
window.ccSanitize = () => {
  const W = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum'.split(' ');
  const LW = new Set(W);
  let wi = 0;
  const lorem = (src) => {
    const lead = src.match(/^\s*/)[0], trail = src.match(/\s*$/)[0], core = src.trim();
    if (!core) return src;
    let out = '';
    while (out.length < core.length - 3) out += (out ? ' ' : '') + W[wi++ % W.length];
    if (!out) out = W[wi++ % W.length];
    out = out[0].toUpperCase() + out.slice(1);
    const p = core.match(/[.!?:,)]$/); if (p) out += p[0];
    return lead + out + trail;
  };
  const FAKE = [['Avery Lorem', 'avery', 205], ['Blake Ipsum', 'blake', 340], ['Casey Dolor', 'casey', 145], ['Devon Amet', 'devon', 30],
    ['Emery Sit', 'emery', 265], ['Finley Elit', 'finley', 175], ['Harper Sed', 'harper', 10], ['Jordan Magna', 'jordan', 55]];
  const people = new Map(); let pi = 0;          // any real key (username, display name, avatar id) -> fake
  const person = (...keys) => {
    keys = keys.filter(Boolean).map(k => k.trim().replace(/^@/, ''));
    let p = keys.map(k => people.get(k)).find(Boolean);
    if (!p) { const f = FAKE[pi++ % FAKE.length]; p = { name: f[0], user: f[1], hue: f[2] }; }
    keys.forEach(k => people.set(k, p));
    return p;
  };
  const avatar = (p) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="hsl(${p.hue},38%,42%)"/><text x="32" y="43" font-family="Helvetica,Arial,sans-serif" font-size="28" font-weight="700" fill="#fff" text-anchor="middle">${p.name.split(' ').map(s => s[0]).join('')}</text></svg>`);
  const path = (img) => new URL(img.src, location.href).pathname;

  // People: message headers pair display name + username; the avatar beside
  // them (/avatar/<username>) gets the same fake.
  document.querySelectorAll('.rcx-message-header__name-container').forEach(h => {
    const n = h.querySelector('.rcx-message-header__name'), u = h.querySelector('.rcx-message-header__username');
    const p = person(u?.textContent, n?.textContent);
    if (n) n.textContent = p.name; if (u) u.textContent = '@' + p.user;
  });
  document.querySelectorAll('img').forEach(img => {
    const seg = path(img).split('/');
    if (seg[1] !== 'avatar') return;
    const key = decodeURIComponent(seg[2] === 'uid' ? 'uid:' + seg[3] : seg[2] || '');
    img.removeAttribute('srcset'); img.src = avatar(person(key));
  });
  document.querySelectorAll('.rcx-message__highlight, .mention-link').forEach(e => {
    const raw = e.textContent.trim(), t = raw.replace(/^@/, ''), wasName = /\s/.test(t);
    const p = person(t);
    e.textContent = (raw.startsWith('@') ? '@' : '') + (wasName ? p.name : p.user);
    e.dataset.ccDone = 1;
  });

  // Media: hide the real pixels, paint a placeholder landscape behind them.
  const ph = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 270" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b4a6b"/><stop offset="1" stop-color="#1b2233"/></linearGradient></defs><rect width="480" height="270" fill="url(#g)"/><circle cx="350" cy="80" r="28" fill="#e8c26b" opacity=".8"/><path d="M0 270 L140 130 L230 210 L310 150 L480 270Z" fill="#3f6d8f" opacity=".75"/><path d="M0 270 L90 200 L200 270Z" fill="#5b8db0" opacity=".6"/></svg>') + '") center/cover';
  document.querySelectorAll('video, img').forEach(m => {
    if (m.tagName === 'IMG' && !path(m).startsWith('/file-upload')) return;
    m.style.objectPosition = '-99999px 0'; m.style.background = ph;
  });

  // Text: message bodies, attachments, thread previews, drawer titles.
  const walk = (root, fn) => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const ns = []; let n; while ((n = w.nextNode())) ns.push(n); ns.forEach(fn); };
  const FILE = /[\w .-]+?(\.(mp4|png|jpe?g|gif|webm|mov|pdf|zip))\b/gi;
  document.querySelectorAll('.rcx-message-body, .rcx-message-thread__message, .rcx-attachment__details, .rcx-message-attachment, .rcx-vertical-bar h5').forEach(root =>
    walk(root, n => {
      if (n.parentElement.closest('[data-cc-done], .rcx-message__emoji, i.rcx-icon, .rcx-message-header')) return;
      n.textContent = FILE.test(n.textContent) ? n.textContent.replace(FILE, 'lorem-ipsum$1') : lorem(n.textContent);
      FILE.lastIndex = 0;
    }));

  // Sidebar room names ('general' is generic, keep it).
  const CH = ['ipsum-dolor', 'sit-amet', 'consectetur', 'adipiscing-elit', 'sed-eiusmod', 'tempor', 'incididunt', 'labore-magna', 'aliqua', 'enim-minim',
    'veniam', 'nostrud', 'exercitation', 'ullamco-laboris', 'nisi-aliquip', 'commodo', 'consequat', 'duis-aute', 'irure', 'voluptate', 'velit-esse', 'cillum', 'fugiat-nulla', 'pariatur'];
  let ci = 0;
  document.querySelectorAll('.rcx-sidebar-item__title').forEach(t => { if (t.textContent.trim() !== 'general') t.textContent = CH[ci++ % CH.length]; });

  // Audit: visible text that isn't Lorem Ipsum — check it all by eye.
  const left = new Set(); const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) {
    const e = n.parentElement; if (e.closest('i.rcx-icon, script, style')) continue;
    const r = e.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const t = n.textContent.trim(), words = t.toLowerCase().match(/[a-z]+/g) || [];
    if (t && !(words.length && words.every(x => LW.has(x)))) left.add(t.slice(0, 50));
  }
  return 'people=' + pi + ' rooms=' + ci + '\nremaining text: ' + [...left].join(' | ');
};

'cc helpers loaded';
