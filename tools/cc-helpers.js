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

'cc helpers loaded';
