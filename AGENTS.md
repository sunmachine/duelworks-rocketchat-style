# AGENTS.md — DuelWorks Rocket.Chat custom CSS

This repo is a single stylesheet, `custom.css`, pasted by an admin into
**Rocket.Chat → Administration → Workspace → Settings → Layout → Custom CSS**
for https://chat.duel.works (dark theme, Fuselage `rcx-*` components).
It's a readability/visual-polish layer — no JS, no build step.

Read this whole file before changing anything. Most of it is gotchas that
each cost a round-trip to discover.

> **Nothing in this repo may be sensitive.** It's shared with the team and
> may be published. No credentials/tokens, emails, people's names or
> handles, private channel/group names, message content, screenshots of
> chats, or internal URLs — in files *or* commit messages. Describe test
> content generically ("a message with an image + reactions") instead.

---

## Workflow (every iteration)

1. **Inspect** the live DOM in Chrome (Claude in Chrome / DevTools). Measure
   before designing — Fuselage's real class names, sizes and paint order are
   rarely what you'd guess.
2. **Prototype** by injecting a test `<style>` *in production position*
   (see helpers below). Never append to the end of `<head>` — it hides
   cascade bugs.
3. **Verify** three ways: computed values, the **specificity audit**, and a
   **zoomed screenshot** (plus `elementsFromPoint` for backgrounds).
4. **Write** the rule into `custom.css` in the right section, with a comment
   saying *why* (what Fuselage does, what we override).
5. **Commit straight to `main`**, one commit per iteration, with a
   descriptive message. Then `pbcopy < custom.css` so the user can paste it.
6. After the user pastes and reloads, **verify the live copy** (hash
   compare, below).

The user may be driving the same Chrome tab (navigating, typing). Don't
fight it: don't scroll/click away from where they are, and never type into
the composer or send messages.

---

## Test environment

- Test content: ask the user which channels to use (don't record private
  channel names here). Cover at least: a message with an **image
  attachment + reactions + a thread** (the best spacing test), threads and
  quotes on plain text, and a **pinned-message / bot text attachment**.
- Opening a thread marks it read for the user's account — fine, but know it.
- Mobile web layout: load the app in a same-origin 390×844 `<iframe>`
  overlay; media queries respond to the iframe width. It can't emulate touch
  (`hover: none`).
- **Native mobile apps ignore Custom CSS entirely** (React Native). Only the
  web client and desktop app are affected.

### Helpers (paste into the page via JS)

Page reloads (including the user pasting new CSS) wipe these — redefine
after any refresh.

```js
// Inject/replace test CSS right AFTER the live custom stylesheet, i.e. where
// production CSS sits (~sheet #2 of ~19). Fuselage's runtime sheets load
// later and win same-specificity !important ties — this reproduces that.
window.ccApply = (css) => {
  let s = document.getElementById('cc-test');
  if (!s) {
    s = document.createElement('style'); s.id = 'cc-test';
    [...document.querySelectorAll('link[rel=stylesheet]')]
      .find(l => l.getAttribute('href').includes('css-theme')).after(s);
  }
  s.textContent = css; return 'applied ' + css.length;
};

// Specificity audit: for every selector in #cc-test that matches on-screen
// elements, report later-loaded !important declarations on the same property
// with >= specificity (i.e. rules that beat ours). Hover/focus states are
// compared against their hover/focus counterparts. Don't use :is(a, b) in
// rules you want audited — write selector lists out in full.
window.ccAudit = () => {
  const spec = (sel) => { let s = sel.replace(/::?(before|after)\b/g, ' X'); const notInner = []; s = s.replace(/:not\(([^)]*)\)/g, (m, i) => { notInner.push(i); return ''; }); s = s.replace(/:(is|where|has)\([^)]*\)/g, ''); const a = (s.match(/#[\w-]+/g)||[]).length; const b = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g)||[]).length; const c = (s.replace(/\[[^\]]+\]/g,'').match(/(^|[\s>+~])[a-zA-Z][\w-]*/g)||[]).length; let r = [a,b,c]; notInner.forEach(i => { const t = spec(i); r = [r[0]+t[0], r[1]+t[1], r[2]+t[2]]; }); return r; };
  const cmp = (x, y) => x[0]-y[0] || x[1]-y[1] || x[2]-y[2];
  const sheets = [...document.styleSheets]; const ti = sheets.findIndex(s => s.ownerNode?.id === 'cc-test');
  const flat = (rs, out=[]) => { for (const r of rs) { if (r.cssRules && !r.selectorText) flat(r.cssRules, out); else if (r.selectorText) out.push(r); } return out; };
  const ours = flat(sheets[ti].cssRules);
  const later = []; sheets.slice(ti+1).forEach(s => { try { flat(s.cssRules).forEach(r => { if ([...r.style].some(p => r.style.getPropertyPriority(p))) later.push(r); }); } catch(e) {} });
  const strip = s => s.replace(/:(hover|focus|focus-visible|focus-within|active)\b/g, '');
  const losses = new Set(); let checked = 0;
  for (const r of ours) for (const ourSel of r.selectorText.split(/,(?![^(]*\))/).map(x => x.trim())) {
    let els; try { els = [...document.querySelectorAll(strip(ourSel))].slice(0, 30); } catch(e) { continue; }
    if (!els.length) continue; checked++;
    const ourState = /:(hover|focus)/.test(ourSel);
    for (const p of r.style) for (const lr of later) { if (!lr.style.getPropertyPriority(p)) continue;
      for (const ls of lr.selectorText.split(/,(?![^(]*\))/).map(x => x.trim())) {
        if (/:(hover|focus)/.test(ls) && !ourState) continue;
        let hit = false; try { hit = els.some(e => e.matches(strip(ls))); } catch(e) {}
        if (hit && cmp(spec(ls), spec(ourSel)) >= 0) losses.add(`${ourSel} [${p}] <- ${ls}`); } }
  }
  return `checked ${checked} | losing: ${losses.size ? '\n' + [...losses].join('\n') : 'none'}`;
};
```

To test the *whole* file (e.g. after restructuring): disable the live link
(`link.disabled = true`) and inject the full file as `cc-test`, then
re-enable afterwards.

### Verifying the live copy

After the user pastes + reloads: fetch the `css-theme_*.css` link (strip the
query string, `cache: 'no-store'`), SHA-256 it in the page, compare with
`shasum -a 256 custom.css` locally. Then run the audit with the live sheet
as "ours" (or just re-inject and audit).

### Claude in Chrome output filter

Tool results containing URLs with query strings (stylesheet hrefs, img
`src`s, some generated class names, base64) come back `[BLOCKED]`. Return
pathnames only, numbers, or booleans; strip `?…` before printing anything
URL-like.

---

## Fuselage / Rocket.Chat gotchas (all learned the hard way)

**Cascade**
- Fuselage emits runtime rules like `.rcx-css-xxxx { prop: v !important }`
  (specificity 0,1,0) in stylesheets that load **after** the custom CSS. A
  single-class `!important` rule of ours loses that tie. Fix with a
  **doubled class** (`.rcx-vertical-bar.rcx-vertical-bar`) → 0,2,0. Rule of
  thumb: **every app-wide component rule uses a doubled class** (buttons,
  fields, selects, drawers, attachments, toolbar, typing strip, footer rows,
  messages) — the specificity audit only covers the views you test, and an
  app-wide rule also hits admin pages, dialogs and forms you didn't.
- `rcx-css-*` class names are generated and unstable — never target them.
- Prefer state attributes over classes: sidebar rows have
  `data-unread="true|false"` and `aria-current="page"`.

**Paint vs. computed style**
- `getComputedStyle` saying a background is applied ≠ visible. Fuselage
  often nests a full-size child painted in the surface color (e.g.
  `.rcx-room-header > div`). Check with
  `document.elementsFromPoint(x, y)` → first element with a non-transparent
  bg is what you see.
- Full screenshots are JPEG-compressed; subtle tints/radii need a `zoom` on
  a small region.
- Elements with `rcx-box--animated` have transitions — measure after they
  settle (~500ms) or you'll read mid-transition values.

**Box model traps**
- Some elements have fixed heights with `!important` + `border-box`
  (typing strip: `height: 1.25rem`). Padding then squeezes content instead
  of adding space — override the height too.
- Fuselage pins `min-width` on square buttons; set it along with `width`.
- For anything that appears/disappears, prefer a **fixed** reserved height
  over `auto` so surrounding layout doesn't jump.

**Message DOM**
- `.rcx-message-container` is a flex column (margins add, don't collapse):
  `.rcx-message-header`, `.rcx-message-body`, then a mix of
  `.rcx-message-block` (reactions, thread metrics) and **plain unclassed
  `<div>`s** (image/file attachment header + attachment). Link previews are
  *also* `.rcx-message-block`. Target "any child except header", and pick out
  reactions/thread rows by content
  (`:has(.rcx-message-reactions__container, .rcx-message-metrics__content-wrapper)`),
  never by class alone.
- A blank line in a message is a `<br>` between block-level `<div>`s and
  takes a full line-height. Chrome ignores `display`/`margin` on `<br>` —
  hide it and margin the following sibling.
- Text attachments (pinned messages, bot posts) are `.rcx-message-attachment`
  (Fuselage caps them at 360px — sized for images). Images live in
  `picture:has(> img.gallery-item)`, a different container.
- Footer row boxes don't match their pills by default: the reactions row has
  `margin: -2px` (box 20px around 24px pills) and the thread row's
  `.rcx-message-metrics__content-item` has `margin: 4px 0` (box 32px). Both
  are zeroed in custom.css. Measure gaps between *visible* edges (pill/card
  rects), not between block boxes.
- Rocket.Chat doesn't render markdown blockquotes inside quoted/pinned
  attachments — literal `>` there is not a CSS problem.
- The message hover toolbar (`.rcx-message-toolbar`) only exists in the DOM
  while hovered/focused. Synthetic hover often doesn't trigger it;
  `messageEl.focus()` (they have `tabindex=0`) does.

**Layout constraints**
- The sidebar is a **virtualized list**: rows are absolutely sized by
  measured height. Don't add margins/padding to rows.
- **`clip-path` clips hit-testing too**, not just paint. Never toggle a clip
  on the element whose `:hover` triggers it — the clipped band stops being
  hovered → unhover → unclip → hover… (a per-frame flicker at row edges).
  Paint the shape on a `::before` layer behind the content instead (see the
  sidebar's `--row-fill` / `--row-bar`).
- Don't add `position: relative` to drawers (`.rcx-vertical-bar`) — it can
  break mobile overlay positioning. Draw edge lines as 1px
  `background-image` layers instead of borders/pseudo-elements.
- Touch devices: `:hover` sticks to the last tapped element — gate hover
  styling behind `@media (hover: hover)`.

**CSP** (server header): `font-src 'self' data:`, `style-src 'self'
'unsafe-inline'`, `img-src *`. Google Fonts are blocked → fonts must be
embedded as base64 `data:` URIs (see the logo `@font-face`, a 1.4 KB
glyph subset fetched with Google Fonts' `&text=` parameter).

---

## Design language (keep consistent)

- **One accent:** `--hl` (RGB triplet, use as `rgba(var(--hl), a)`).
  Intensity ladder: unread 0.22 · hover 0.10→0.45 · selected 0.20→0.60 ·
  "mine"/pressed ~0.18–0.22.
- **No 1px structural borders.** Separate regions by background steps
  (top bar/sidebar `rgb(47,52,61)` → header `--bg-header` → channel
  `rgb(31,35,41)` → drawers `--bg-drawer`), plus `--fade-line` hairlines
  that fade out at both ends where a boundary needs help. Fields are filled
  with translucent white (`--bg-field`), so they're a step lighter than *any*
  surface (channel, drawer, dialog, admin) — never an opaque field color.
  Floating UI uses an opaque `--bg-float` + soft shadow, not a border.
- **Pills & round controls (app-wide):** every `.rcx-button` is a pill
  (text) or circle (square); every small icon button is `--pill-h` (24px)
  with `--icon-fs` (16px) icons; mini buttons keep Fuselage's native 20px
  (intended — same in channel and drawers). Footer labels `--footer-fs`
  (11px/600). Primary actions use the accent tint (0.35 fill, 0.8 edge),
  not Fuselage's `#095ad2`. The avatar button (`:has(figure)`) is exempt.
- **Fields (app-wide):** filled, no outline, `--field-radius`; focus = a 1px
  `outline` rim in `--focus-color`, offset -1px (keep it ≥3:1 — it's the only
  focus cue on every form). Use outlines, not inset box-shadows, for rims:
  children paint over an inset shadow (the composer's toolbar hid it);
  invalid = `--rcx-color-stroke-error` edge, kept while focused; disabled =
  `--bg-field-disabled` fill (never opacity — Fuselage already dims the text).
- **Clipped top-right corner** (`--clip`) is the motif for highlighted
  sidebar rows and quote panels.
- **Corners:** fields/dropdowns/images use `--field-radius`.
- **Message rhythm** (all tokens): `--msg-indent` past the byline,
  `--byline-gap`, `--flow-gap` (text→anything, anything→footer row),
  `--footer-gap` (reactions→thread row, and under a last pill row),
  `--attach-gap`, `--para-gap`, `--msg-pad` + `--author-gap`.
- The user dislikes: header gradients, outline borders, boxy 4px radii,
  cramped spacing. Likes: subtle tints, pills, the clipped corner.
- Don't attempt: moving the composer (user decided to keep it bottom-
  anchored); JS-dependent animation (Custom CSS can't run JS).

All tunable values live in the `:root` block at the top of `custom.css`.

---

## File layout

`custom.css` sections are marked `/* ::: Name */`, in this order:
Tokens → Emphasis → Sidebar → Surfaces → Controls (buttons, pills, fields,
composer, typing strip) → Messages (type, spacing, rhythm, media) → Quotes &
text attachments → Sidebar footer logo. Prefer **component** rules (what
something is) over **location** rules (where it is) so new panels inherit
the look; keep location rules for genuinely local things. Put new values in
`:root` as tokens. Keep the "why" comments — they document Fuselage behavior
that isn't visible from the CSS alone.

### Regression-checking a refactor

Computed-style diffing beats eyeballing. Store CSS variants in the page's
`localStorage` (they survive reloads), then for each view: disable the live
sheet, inject variant A at production position with transitions off,
snapshot ~50 computed properties (+ `::before`/`::after`) of every element,
inject B, snapshot, diff. Navigate with `history.pushState` + a `popstate`
event so page state survives. Always run a self-test (A vs A = 0 diffs) and
a positive control (change one token, confirm it's caught). Hover states
aren't captured — run the specificity audit for those.
