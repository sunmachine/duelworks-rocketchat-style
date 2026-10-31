# AGENTS.md — DuelWorks Rocket.Chat custom CSS

This repo is a single stylesheet, `custom.css`, pasted by an admin into
**Rocket.Chat → Administration → Workspace → Settings → Layout → Custom CSS**
for https://chat.duel.works (Rocket.Chat 8.x, dark theme, Fuselage `rcx-*`
components). It's a readability / visual-polish layer — no JS, no build step.
`tools/cc-helpers.js` holds the in-browser test helpers.

Read this whole file before changing anything. Most of it is gotchas that
each cost a round-trip to discover.

> **Nothing in this repo may be sensitive.** It's public. No credentials,
> emails, people's names or handles, private channel/group names, message
> content, chat screenshots, or internal URLs — in files *or* commit
> messages. Describe test content generically ("a message with an image +
> reactions").

---

## Workflow (every iteration)

1. **Inspect** the live DOM in Chrome (Claude in Chrome / DevTools). Measure
   before designing — Fuselage's real class names, sizes and paint order are
   rarely what you'd guess.
2. **Prototype** with `ccApply(css)` (production position — see helpers).
   Never append test CSS to the end of `<head>`; it hides cascade bugs.
3. **Verify**: computed values, `ccAudit()` (specificity), a **zoomed**
   screenshot, and `elementsFromPoint` for anything background-related.
   For refactors, a computed-style diff (`ccCompare`).
4. **Write** the rule into the right section of `custom.css`, as a component
   rule where possible, with a comment saying *why* (what Fuselage does).
5. **Commit straight to `main`** (one commit per iteration, descriptive
   message), **push**, then `pbcopy < custom.css` so the user can paste it.
   Exception: if the user says they're using their clipboard, hold `pbcopy`
   until they ask.
6. After the user pastes + saves: `ccLiveHash()` in the page vs.
   `shasum -a 256 custom.css` locally. If it doesn't match, the server is on
   an older version — say so before debugging anything.

The user may be driving the same Chrome tab. Don't fight it: don't scroll or
navigate away from where they are, never type into the composer, never send
messages or submit forms (open dialogs only to inspect; close with Escape).

---

## Current state (keep this section up to date)

What `custom.css` covers today, by section:

- **Sidebar** — unread rows: accent gradient + 3px accent bar + clipped
  corner, bold white title; read rows dimmed; selected strongest; hover
  brighter (real pointers only). Highlight painted on a `::before` layer.
  Unread badge gets a small drop shadow. Avatar-free mode: rows 28→34px.
  Logo footer: "duel.works" wordmark (embedded font) on the drawer surface.
- **Surfaces** — no 1px dividers; background steps (top bar/sidebar →
  channel header → channel → drawers) plus fade-out hairlines under the
  headers and down the drawer edge. Drawers (thread, info, members…) darker.
- **Controls (app-wide)** — every button a pill/circle; small icon buttons
  24px/16px icons; primary actions in the accent tint; message hover toolbar
  a floating capsule; reactions / View thread / follow bell share one pill
  look; fields filled + rounded with an outline focus rim; composer toolbar
  dividers removed; "is typing" strip has fixed reserved height.
- **Messages** — 14px body under a 15px/700 byline, 12px indent below the
  byline, balanced padding (hover highlight symmetric), tight paragraph
  gaps, consistent rhythm between text / attachments / reactions / thread
  row, rounded images + video, link previews styled like attachments.
- **Quotes & text attachments** — tinted panel + left accent bar (quoted
  messages also get the clipped corner); pinned/bot text attachments widened
  from Fuselage's 360px cap.

**Decided / don't revisit unless asked:** composer stays bottom-anchored; no
header gradients; no width cap on message text; no JS-dependent animation.
**Open, deferred by the user:** toggle switches still Fuselage blue; 24px
icon buttons may feel small for touch in admin/dialogs.

---

## Test environment

- Test content: ask the user which channels to use (never record private
  channel names here). Cover at least: a message with an **image attachment
  + reactions + a thread** (best spacing test), threads and quotes on plain
  text, a **link preview**, a **pinned-message / bot text attachment**, the
  **Channel Info** drawer and its **Edit** form, a **dialog** (Create
  channel), and an **admin** page.
- Opening a thread marks it read for the user's account — fine, but know it.
- Mobile web layout: load the app in a same-origin 390×844 `<iframe>`
  overlay and inject CSS into its document; media queries follow the iframe
  width. It can't emulate touch (`hover: none`).
- **Native mobile apps ignore Custom CSS entirely.** Only the web client and
  desktop app are affected.

### Helpers — `tools/cc-helpers.js`

Paste the file into the page. Reloads wipe it (including when the admin
saves new CSS) — re-paste. The header comment lists every function. Key ones:
`ccApply`, `ccAudit`, `ccRestore`, `ccGo`, `ccStore`/`ccUse`,
`ccCompare`/`ccGroup`, `ccLiveHash`.

### Regression-checking a refactor

Computed-style diffing beats eyeballing. `ccStore()` both versions (comments
and `@font-face` stripped), then per view: `await ccCompare('old', 'new')`
and `ccGroup()`. Navigate with `ccGo(path)` so window state survives. Always
run a **self-test** (`ccCompare('old','old')` = 0) and a **positive control**
(change one token, confirm it's caught). Hover isn't captured — `ccAudit()`
covers hover rules. A pure refactor must show 0 diffs; for a deliberate
change, every diff must be explainable.

### Claude in Chrome specifics

- Tool results containing URLs with query strings (stylesheet hrefs, img
  `src`s, base64, some generated class names) come back `[BLOCKED]`. Return
  pathnames, numbers, booleans; strip `?…` first.
- Screenshot coordinates ≠ CSS pixels when the window is resized — compute
  the scale from the screenshot's reported frame vs. `innerWidth`.
- Taking a screenshot can blur the page, dropping `:focus`. To check a focus
  style visually, temporarily add the same declarations under a test class.

---

## Fuselage / Rocket.Chat gotchas (all learned the hard way)

**Cascade**
- Fuselage emits runtime rules like `.rcx-css-xxxx { prop: v !important }`
  (specificity 0,1,0) in stylesheets that load **after** the custom CSS. A
  single-class `!important` rule of ours loses that tie. Use a **doubled
  class** (`.rcx-select.rcx-select`) → 0,2,0. Rule of thumb: **every
  app-wide component rule uses a doubled class** — the audit only covers the
  views you test, and app-wide rules also hit admin pages, dialogs and forms.
- `rcx-css-*` class names are generated and unstable — never target them.
- Prefer state attributes over classes: sidebar rows have
  `data-unread="true|false"` and `aria-current="page"`.

**Paint vs. computed style**
- `getComputedStyle` saying a background is applied ≠ visible. Fuselage
  often nests a full-size child painted in the surface color (e.g.
  `.rcx-room-header > div`). Check with `document.elementsFromPoint(x, y)`.
- An **inset `box-shadow` paints beneath the element's children** — a child
  with a background hides it (the composer toolbar hid the focus ring). Use
  an `outline` with negative `outline-offset` for rims; it paints on top and
  follows `border-radius`.
- Full screenshots are JPEG-compressed; subtle tints/radii need a `zoom`.
- `rcx-box--animated` elements transition — measure after ~500ms.

**Box model traps**
- Some elements have fixed heights with `!important` + `border-box`
  (typing strip: `height: 1.25rem`). Padding then squeezes content — override
  the height too.
- Fuselage pins `min-width` on square buttons; set it along with `width`.
- For anything that appears/disappears, reserve a **fixed** height rather
  than `auto` so surrounding layout doesn't jump.
- Negative margins shrink boxes without changing `height` (the reactions row
  had `margin: -2px`): measure *visible* edges (pill/card rects), not boxes.

**Message DOM**
- `.rcx-message-container` is a flex column (margins add, don't collapse):
  `.rcx-message-header`, `.rcx-message-body`, then a mix of
  `.rcx-message-block` (reactions, thread metrics, **link previews**) and
  **plain unclassed `<div>`s** (attachment header + image/file/video).
  Target "any child except header"; pick out reactions/thread rows by
  content (`:has(.rcx-message-reactions__container,
  .rcx-message-metrics__content-wrapper)`), never by class alone.
- The message list is virtualized and measures item height: use borders or
  padding for spacing that must count (margins aren't measured). The gap
  above a new author is a transparent `border-top` + `background-clip:
  padding-box` so the hover highlight stays symmetric.
- A blank line in a message is a `<br>` between block `<div>`s (a full
  line-height). Chrome ignores `display`/`margin` on `<br>` — hide it and
  margin the following sibling.
- Text attachments (pinned messages, bot posts) are `.rcx-message-attachment`
  (Fuselage caps them at 360px). Images: `picture:has(> img.gallery-item)`.
  Link-preview cards clip their own media — don't round media inside them.
- Footer rows: reactions row has `margin: -2px` (20px box around 24px
  pills); thread row's `.rcx-message-metrics__content-item` has
  `margin: 4px 0` (32px box). Both zeroed.
- Markdown blockquotes don't render inside quoted/pinned attachments —
  literal `>` there is not a CSS problem.
- The hover toolbar (`.rcx-message-toolbar`) only exists while a message is
  hovered/focused. Synthetic hover rarely triggers it; `messageEl.focus()`
  (messages have `tabindex=0`) does.

**Sidebar / layout**
- Sidebar rows are in **normal flow** inside a virtualized list that
  re-measures them: changing row padding is safe (verified: no overlaps at
  top or after scrolling to the bottom). Re-verify that if you change it.
- **`clip-path` clips hit-testing too.** Never toggle a clip on the element
  whose `:hover` triggers it (clipped band un-hovers → unclip → hover… a
  per-frame flicker). Paint shapes on a `::before` behind the content (see
  `--row-fill` / `--row-bar`); `position: relative` + `isolation: isolate`
  on the row is safe.
- Don't add `position: relative` to drawers (`.rcx-vertical-bar`) — it can
  break mobile overlay positioning. Draw edge lines as 1px
  `background-image` layers.
- Rows clip overflow: shadows on things inside a row must fit within it.
- Touch: `:hover` sticks to the last tap — gate hover behind
  `@media (hover: hover)`.

**CSP** (server header): `font-src 'self' data:`, `style-src 'self'
'unsafe-inline'`, `img-src *`. Google Fonts are blocked → fonts must be
embedded as base64 `data:` URIs (the logo `@font-face` is a 1.4 KB glyph
subset fetched with Google Fonts' `&text=` parameter).

---

## Design language (keep consistent)

- **One accent:** `--hl` (RGB triplet → `rgba(var(--hl), a)`). Ladder:
  unread 0.22 · hover 0.10→0.45 · selected 0.20→0.60 · mine/pressed ~0.2 ·
  primary/unread-thread 0.35 fill + 0.8 edge · focus rim 0.9.
- **No 1px structural borders.** Background steps between regions
  (`--bg-header`, `--bg-drawer`, …) plus `--fade-line` hairlines that fade
  at both ends. Floating UI: opaque `--bg-float` + `--shadow-float`.
- **Fields:** translucent `--bg-field` (a step lighter than *any* surface —
  never an opaque field color), `--field-radius`, no outline; focus = 1px
  outline rim in `--focus-color` (offset -1px, keep ≥3:1); invalid = same rim
  in `--rcx-color-stroke-error`, kept while focused; disabled =
  `--bg-field-disabled` (never opacity — Fuselage already dims the text).
- **Buttons:** every `.rcx-button` a pill/circle; small icon buttons
  `--pill-h` (24px) with `--icon-fs` (16px) icons; mini buttons keep native
  20px; footer labels `--footer-fs` (11px/600); avatar button exempt.
- **Clipped top-right corner** (`--clip`): highlighted sidebar rows and
  quote panels.
- **Message rhythm** (tokens): `--msg-indent`, `--byline-gap`, `--flow-gap`,
  `--footer-gap`, `--attach-gap`, `--para-gap`, `--msg-pad`, `--author-gap`.
- The user dislikes: header gradients, outline borders, boxy 4px radii,
  cramped spacing, recoloring when a shadow/spacing fix would do. Likes:
  subtle tints, pills, the clipped corner, soft drop shadows.

All tunable values live in the `:root` block at the top of `custom.css`.

---

## File layout

`custom.css` sections are marked `/* ::: Name */`, in this order:
Tokens → Emphasis → Sidebar → Surfaces → Controls (buttons, pills, fields,
composer, typing strip) → Messages (type, spacing, rhythm, media) → Quotes &
text attachments → Sidebar footer logo. Prefer **component** rules (what a
thing is) over **location** rules (where it is) so new panels inherit the
look. New values go in `:root` as tokens. Keep the "why" comments — they
document Fuselage behavior that isn't visible from the CSS alone.
