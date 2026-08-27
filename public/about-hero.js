// IAMWE about page — the tiled portrait.
//
// A grid of real DOM tiles, each one a fixed window clipped onto the
// SAME underlying photograph — solo any single tile and it shows
// exactly its own slice of the whole picture, at the same scale as
// every other tile. At rest every tile sits at zero offset, so the
// grid lines simply read as a window laid over one true image, not a
// repeating pattern of it.
//
// On mouse move, each tile's PICTURE slides — the tile itself, the
// window clipping it, never moves or resizes. How far a given tile's
// picture slides is set by a radial brush centred on the cursor: tiles
// right under the brush slide close to the full amount, tiles further
// out slide less, fading to nothing past the brush's radius. The
// brush's own centre is not the raw cursor position but an eased trail
// of it (curMouseX/Y below) — that gap between the two is the entire
// delay described in the spec; nothing else here is time-based.
//
// An earlier version of this file used one WebGL canvas with a
// per-pixel radial push instead of per-tile divs. That reads as a
// warp rather than tiles sliding, because the push's direction is
// mathematically undefined right at its own centre (a zero-length
// vector has no direction to normalize) — which is exactly the
// starburst/melt artifact that got flagged. Real per-tile elements
// sidestep this entirely: every tile only ever receives one rigid
// translate, uniform across its whole area, so nothing inside a tile
// stretches — it slides, cleanly, behind a window that never moves.
//
// Reference: gmunk.com/Information, where a portrait carries a related
// treatment. Their site is built on Cargo, a closed-source host — no
// source to read — so this is a rebuild from looking at it and from
// James's own corrections, not a copy of any code.
//
// Static fallback: the plain <img> already in the HTML, duotoned with
// a CSS filter, is never removed — only hidden once this file confirms
// the grid has actually been built and drawn a frame. Anyone with
// reduced motion set keeps the still image and none of this runs.

(() => {
  const mount = document.querySelector('.about-hero');
  if (!mount) return;

  const reduceMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return; // the CSS-filtered <img> already in the DOM is the whole effect

  const poster = mount.querySelector('.about-hero-poster');
  if (!poster) return;

  // ── Tuning ────────────────────────────────────────────────────────────
  // Grid density — a fixed window, drawn once per layout, never distorted.
  const TILE_PX = 110;    // target tile size in CSS px — sets the density
  const MIN_COLS = 5;
  const MAX_COLS = 14;
  const MAX_ROWS = 14;

  // How the photo behind the tiles is scaled beyond a plain cover-fit,
  // so a tile can slide its picture without ever exposing a bare edge.
  // At the largest drag this still leaves comfortable room to spare.
  const BLEED = 1.22;

  // The brush — how far a fully-engaged tile's picture slides (px, at
  // the brush's own centre — every tile that close in slides about
  // this much, wherever on the panel the cursor happens to be), how
  // wide the brush reaches before that pull fades to nothing, and how
  // far behind the real cursor the brush's own centre trails. A lower
  // EASE makes the drag visibly lag further behind the cursor; 1.0
  // would remove the delay entirely and snap straight to it.
  const MAX_DRAG_PX = 44;
  const BRUSH_RADIUS_FRAC = 0.42;  // × the shorter side of the panel
  const BRUSH_EASE = 0.055;
  const MOUSE_FADE_MS = 700;

  // Warm → cool duotone, mapped by luminance (dark photo → cool, bright
  // photo → warm) — an SVG filter, not a CSS filter chain, because a
  // real duotone needs to remap colour by luminance, which grayscale
  // + sepia + hue-rotate can only approximate. These two constants are
  // the only place the palette lives; the SVG below just reads them.
  const INK_WARM = [0.80, 0.16, 0.10];   // red
  const INK_COOL = [0.05, 0.28, 0.26];   // teal
  const SEAM_ALPHA = 0.2;                // grid-line strength, drawn over the duotone

  function injectDuotoneFilter() {
    if (document.getElementById('iw-duotone-defs')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', 'iw-duotone-defs');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.style.overflow = 'hidden';
    svg.innerHTML =
      '<filter id="iw-duotone" color-interpolation-filters="sRGB">' +
      '<feColorMatrix type="matrix" values="' +
      '0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0"/>' +
      '<feComponentTransfer>' +
      `<feFuncR type="table" tableValues="${INK_COOL[0]} ${INK_WARM[0]}"/>` +
      `<feFuncG type="table" tableValues="${INK_COOL[1]} ${INK_WARM[1]}"/>` +
      `<feFuncB type="table" tableValues="${INK_COOL[2]} ${INK_WARM[2]}"/>` +
      '</feComponentTransfer>' +
      '</filter>';
    document.body.appendChild(svg);
  }
  injectDuotoneFilter();

  // ── Grid ──────────────────────────────────────────────────────────────
  const grid = document.createElement('div');
  grid.className = 'hero-grid';
  grid.setAttribute('aria-hidden', 'true');
  mount.appendChild(grid);

  // The seam lines — a separate layer on top, see about.css for why.
  const gridLines = document.createElement('div');
  gridLines.className = 'hero-grid-lines';
  gridLines.setAttribute('aria-hidden', 'true');
  mount.appendChild(gridLines);

  let cols = 0, rows = 0, cellW = 0, cellH = 0;
  let tiles = []; // { img, ci, cj } — ci/cj are this tile's centre, 0..1

  function build() {
    const rect = mount.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    if (W < 1 || H < 1) return;

    grid.innerHTML = '';
    tiles = [];

    cols = Math.round(Math.min(MAX_COLS, Math.max(MIN_COLS, W / TILE_PX)));
    rows = Math.round(Math.min(MAX_ROWS, Math.max(MIN_COLS, cols * (H / W))));
    cellW = W / cols;
    cellH = H / rows;

    // Cover-fit the photo into the panel — the same math object-fit:
    // cover would use — then bleed it slightly larger so a tile's
    // picture always has margin to slide within before it would show
    // a bare edge. This one placement (sw, sh, offX, offY) is shared
    // by every tile; only each tile's own window position differs.
    const iw = poster.naturalWidth || 1600;
    const ih = poster.naturalHeight || 1200;
    const scale = Math.max(W / iw, H / ih) * BLEED;
    const sw = iw * scale, sh = ih * scale;
    const offX = (W - sw) / 2, offY = (H - sh) / 2;

    const src = poster.currentSrc || poster.src;
    const frag = document.createDocumentFragment();

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const tile = document.createElement('div');
        tile.className = 'hero-tile';
        tile.style.left = `${i * cellW}px`;
        tile.style.top = `${j * cellH}px`;
        tile.style.width = `${cellW}px`;
        tile.style.height = `${cellH}px`;

        const img = document.createElement('img');
        img.src = src;
        img.alt = '';
        img.draggable = false;
        img.style.width = `${sw}px`;
        img.style.height = `${sh}px`;
        // The sprite-sheet trick: this tile's own box is offset by
        // (i*cellW, j*cellH) from the panel's origin, so its picture
        // needs the exact opposite offset to land back at the shared
        // (offX, offY) placement every other tile also uses — that's
        // what makes all the crops line up into one true image.
        img.style.left = `${offX - i * cellW}px`;
        img.style.top = `${offY - j * cellH}px`;

        tile.appendChild(img);
        frag.appendChild(tile);
        tiles.push({ img, ci: (i + 0.5) / cols, cj: (j + 0.5) / rows });
      }
    }
    grid.appendChild(frag);

    // Two repeating gradients — verticals and horizontals — sized to
    // the exact tile pitch, drawn as one flat CSS background rather
    // than a border per tile (see about.css for why a per-tile border
    // doesn't work). This is the layer that never moves.
    const seam = `rgba(0,0,0,${SEAM_ALPHA})`;
    gridLines.style.backgroundImage =
      `repeating-linear-gradient(to right, ${seam} 0, ${seam} 1px, transparent 1px, transparent ${cellW}px),` +
      `repeating-linear-gradient(to bottom, ${seam} 0, ${seam} 1px, transparent 1px, transparent ${cellH}px)`;
  }

  // ── Mouse ─────────────────────────────────────────────────────────────
  let mouseX = 0.5, mouseY = 0.5;
  let mouseMix = 0, mouseTarget = 0, lastMove = 0;

  mount.addEventListener('mousemove', (e) => {
    const rect = mount.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) / rect.width;
    mouseY = (e.clientY - rect.top) / rect.height;
    mouseTarget = 1;
    lastMove = performance.now();
  });
  mount.addEventListener('mouseleave', () => { mouseTarget = 0; });

  function smoothstep(e0, e1, x) {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  // ── Loop ──────────────────────────────────────────────────────────────
  // curMouseX/Y is the brush's actual centre — an eased trail of the raw
  // cursor position, not the position itself. That gap is the whole of
  // the delay: every tile reads the SAME eased centre, so only how
  // strongly a tile is affected varies tile to tile (by distance), not
  // how quickly it catches up.
  let curMouseX = 0.5, curMouseY = 0.5;
  let running = false;

  function loop(now) {
    requestAnimationFrame(loop);

    if (now - lastMove > MOUSE_FADE_MS) mouseTarget = 0;
    mouseMix += (mouseTarget - mouseMix) * 0.08;
    curMouseX += (mouseX - curMouseX) * BRUSH_EASE;
    curMouseY += (mouseY - curMouseY) * BRUSH_EASE;

    if (!cols || !rows) return;
    const W = cols * cellW, H = rows * cellH;
    const radius = Math.min(W, H) * BRUSH_RADIUS_FRAC;
    const cursorPx = { x: curMouseX * W, y: curMouseY * H };

    // Each affected tile's picture is pulled toward the (eased) cursor
    // — direction varies tile to tile, magnitude doesn't (beyond the
    // brush weight below): a tile right under the brush moves close to
    // MAX_DRAG_PX regardless of exactly how far it is from the cursor,
    // same as every other tile that close in; it's the brush weight,
    // not the raw distance, that tapers the pull to zero at the edge.
    // (Unlike a continuous per-pixel field, dividing by "distance to
    // cursor" here is safe — a tile's centre essentially never lands
    // exactly on the cursor pixel, so there's no singularity to guard.)
    for (let idx = 0; idx < tiles.length; idx++) {
      const t = tiles[idx];
      const cx = t.ci * W, cy = t.cj * H;
      const dx = cursorPx.x - cx, dy = cursorPx.y - cy;
      const d = Math.hypot(dx, dy);
      const k = (d >= radius ? 0 : 1 - smoothstep(0, radius, d)) * mouseMix;
      if (k <= 0.001 || d < 0.5) {
        t.img.style.transform = '';
      } else {
        const pull = (k * MAX_DRAG_PX) / d; // turns (dx,dy) into a unit vector scaled by k*MAX_DRAG_PX
        t.img.style.transform = `translate3d(${(dx * pull).toFixed(2)}px, ${(dy * pull).toFixed(2)}px, 0)`;
      }
    }

    if (!grid.classList.contains('is-live')) {
      grid.classList.add('is-live');
      gridLines.classList.add('is-live');
      mount.classList.add('has-hero-live');
      // Match the poster fallback to the live grid's exact duotone, in
      // case it's still visible mid-crossfade.
      poster.style.filter = 'url(#iw-duotone)';
    }
  }

  function start() {
    if (running) return;
    running = true;
    requestAnimationFrame(loop);
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(build, 150);
  });

  if (poster.complete && poster.naturalWidth > 0) {
    build();
    start();
  } else {
    poster.addEventListener('load', () => { build(); start(); }, { once: true });
    poster.addEventListener('error', () => {}, { once: true }); // poster stays, nothing else to do
  }
})();
