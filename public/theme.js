/* ─── IAMWE — light / dark ──────────────────────────────────────────────
   One file, included in the <head> of every page that has the toggle.

   - Runs before the page paints, so a saved choice never flashes white.
   - Light is the default (the site is paper); dark only when chosen.
     The choice is remembered across pages and visits (localStorage).
   - Dark works by overriding the shared --iw-* colour variables that
     work.css, archive.css, about.css and the treatments index all use,
     plus the few colours those files set directly.
   - The homepage's Three.js scene listens for the 'iamwe:theme' event
     and swaps its clear colour and fog to match.
   - The button: a small round half-moon, bottom-right, in the same
     difference blend as the corner nav, so it reads on any background. */
(function () {
  'use strict';
  var KEY = 'iamwe-theme';
  var root = document.documentElement;

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved === 'dark') root.setAttribute('data-theme', 'dark');

  var css = [
    /* palette */
    'html[data-theme="dark"]{color-scheme:dark;',
    '--iw-bg:#0d0d0d;--iw-mat:#1a1a19;--iw-frame:#e9e6df;',
    '--iw-ink:#efece6;--iw-ink-soft:rgba(239,236,230,.62);',
    '--iw-ink-faint:rgba(239,236,230,.38);--iw-rule:rgba(239,236,230,.14);}',
    'html[data-theme="dark"],html[data-theme="dark"] body{background:var(--iw-bg)}',
    /* homepage */
    'html[data-theme="dark"] #scroll-hint{color:rgba(255,255,255,.35)}',
    /* black logos drawn as images → flip to light */
    'html[data-theme="dark"] .tb-logo{filter:invert(1)}',
    /* archive: index-list hover tint was dark-on-paper */
    'html[data-theme="dark"] .index-list a:hover{background:rgba(255,255,255,.05)}',
    /* gentle cross-fade when switching (not on first paint) */
    'html.theme-anim, html.theme-anim body, html.theme-anim *{transition:background-color .45s ease,color .45s ease,border-color .45s ease !important}',
    /* the button */
    '.theme-toggle{position:fixed;right:1.8rem;bottom:1.6rem;z-index:200;',
    'width:30px;height:30px;padding:0;border:0;border-radius:50%;background:none;cursor:pointer;',
    'color:#fff;mix-blend-mode:difference;-webkit-tap-highlight-color:transparent}',
    '.theme-toggle svg{display:block;width:100%;height:100%;transition:transform .6s cubic-bezier(.2,.8,.2,1)}',
    'html[data-theme="dark"] .theme-toggle svg{transform:rotate(180deg)}',
    '.theme-toggle:hover svg{transform:scale(1.12)}',
    'html[data-theme="dark"] .theme-toggle:hover svg{transform:rotate(180deg) scale(1.12)}',
    '.theme-toggle:focus-visible{outline:2px solid #fff;outline-offset:4px}',
    '@media (max-width:620px){.theme-toggle{right:1.1rem;bottom:1.1rem;width:26px;height:26px}}',
    '@media (prefers-reduced-motion:reduce){.theme-toggle svg{transition:none}html.theme-anim *{transition:none !important}}'
  ].join('');
  var style = document.createElement('style');
  style.id = 'iamwe-theme-css';
  style.textContent = css;
  (document.head || root).appendChild(style);

  function isDark() { return root.getAttribute('data-theme') === 'dark'; }

  function set(dark) {
    root.classList.add('theme-anim');
    if (dark) root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
    try { localStorage.setItem(KEY, dark ? 'dark' : 'light'); } catch (e) {}
    if (btn) {
      btn.setAttribute('aria-pressed', String(dark));
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    }
    window.dispatchEvent(new CustomEvent('iamwe:theme', { detail: { dark: dark } }));
    clearTimeout(set.t);
    set.t = setTimeout(function () { root.classList.remove('theme-anim'); }, 500);
  }

  var btn = null;
  function mount() {
    if (document.querySelector('.theme-toggle')) return;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-toggle';
    btn.setAttribute('aria-pressed', String(isDark()));
    btn.setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode');
    btn.title = 'Light / dark';
    // a circle, half filled — reads as "flip"
    btn.innerHTML = '<svg viewBox="0 0 30 30" aria-hidden="true">' +
      '<circle cx="15" cy="15" r="13.25" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<path d="M15 1.75a13.25 13.25 0 0 1 0 26.5z" fill="currentColor"/></svg>';
    btn.addEventListener('click', function () { set(!isDark()); });
    document.body.appendChild(btn);
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  window.iamweTheme = { isDark: isDark, set: set };
})();
