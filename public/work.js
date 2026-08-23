// IAMWE work pages — continuous scroll-linked scale with magnetic push.
//
// Every image grows as it nears the vertical centre of the screen and
// shrinks as it moves away, all at once, in sync. As one grows it
// pushes its neighbours along so the gap between images stays exactly
// --stage-gap at all times — nothing ever overlaps, and the stack reads
// as one connected column rather than free-floating pictures.
//
// Why this is smooth: CSS `transform: scale()` deliberately does NOT
// affect layout, which is why the pure-CSS version overlapped — the
// browser cannot reserve space for a scaled element, and CSS alone
// can't know how big a *neighbour* has grown. So the push has to be
// computed. The trick is to never measure during scroll: layout is
// read once up front (and again on resize) into a plain array, then
// each frame only reads window.scrollY — a single cheap property, no
// getBoundingClientRect, no forced reflow — and writes two transform
// values. Transform is compositor-only, so the writes never trigger
// layout either. That read-once/write-only split is the whole
// difference between this and the earlier janky versions.
//
// The same fact bites HORIZONTALLY, and the width budget answers it. A
// flat MAX_SCALE knows nothing about how wide any given image is, so a
// landscape frame sailed straight over the copy column and the index.
// Instead the real gap between those two columns is measured once, and
// each image derives its own ceiling from it: an image grows until it
// is EDGE_GAP from the columns and not one pixel further, whatever its
// aspect ratio. The columns retreat as it comes — up to COLUMN_PUSH,
// and never so far that they leave the window — so pictures and text
// are always reacting to each other's edges.
//
// On top of that, the columns FADE. Once the reader starts scrolling
// they drop away entirely so nothing competes with the pictures, and
// they dim to REVEAL_FLOOR so the pictures carry the page without the
// text vanishing. They return on approach: past a small dead zone at
// the centre line, the further the cursor strays toward EITHER side,
// the more they come back, reaching full strength at the column. And
// reaching a column RESETS the whole thing — the columns stay lit from
// then on, and it takes another scroll to dim them again.
// Both fade as one — heading for the archive brings the description up
// with it — so the pair read as a single frame around the work rather
// than two panels operating independently.

(() => {
  const stack = document.querySelector('.stage-images');
  const images = Array.from(document.querySelectorAll('.stage-img'));
  const copyEl = document.querySelector('.stage-copy');
  const indexEl = document.querySelector('.index-aside');
  if (!stack || !images.length) return;

  const MIN_SCALE = 0.55;       // resting size, far from centre
  const SCALE_CEILING = 2.2;    // never blow a small image up past this
  const FALLOFF = 0.85;         // lens radius, as a fraction of viewport height
  const COLUMN_PUSH = 190;      // px the columns are shoved aside at full focus
  const EDGE_GAP = 5;           // clearance kept between the image and each column
  const HEIGHT_HEADROOM = 0.92; // fraction of the viewport height an image may fill

  const REVEAL_FADE_MS = 420;   // how long the columns take to drop back
  const REVEAL_FLOOR = 0.2;     // opacity they dim to while reading pictures
  // A small dead zone either side of the centre line, so a cursor
  // resting on the middle of a picture does not stir the text. Past it
  // the ramp runs all the way out to the MIDDLE of the column — nearly
  // the whole half-window — so it is a long, gradual travel that only
  // reaches full strength once the cursor is properly on the text.
  const REVEAL_DEAD_PX = 50;

  // Cached layout — natural (unscaled, untranslated) geometry. Only
  // rewritten by measure(), never during scroll.
  let nat = [];
  let vh = window.innerHeight;
  let widthBudget = Infinity; // px an image may occupy at full focus
  let push = 0;               // px the columns may retreat, clamped to fit

  // Reveal state. `floor` is the scroll-driven baseline the columns
  // share — 1 before the reader has scrolled, easing to REVEAL_FLOOR
  // once they have. Cursor proximity layers on top, so faded columns
  // can always be summoned back without scrolling.
  let sideBySide = false;
  let copyTarget = 0;         // x of the description column's mid-line
  let indexTarget = 0;        // x of the archive column's mid-line
  let floor = 1;
  let floorFrom = 1;
  let fadeStart = 0;
  let fading = false;
  let fadeToken = 0;          // bumped to cancel an in-flight fade
  let pointerX = null;        // null when the cursor has left the window
  let heldOpen = false;       // true while keyboard focus is inside either column

  const reduceMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

  const smoothstep = (t) => {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  };

  // Each image gets its own ceiling: whichever of the width budget, the
  // viewport height, or the absolute cap binds first. A wide landscape
  // hits the width budget early and stops there; a portrait keeps
  // growing until it runs out of screen height instead.
  function maxScale(i) {
    const byWidth = widthBudget / nat[i].w;
    const byHeight = (vh * HEIGHT_HEADROOM) / nat[i].h;
    return Math.max(MIN_SCALE, Math.min(byWidth, byHeight, SCALE_CEILING));
  }

  function measure() {
    vh = window.innerHeight;
    // Clear transforms so the rects we read are the true layout boxes.
    images.forEach((el) => {
      el.style.setProperty('--s', 1);
      el.style.setProperty('--ty', 0);
    });
    if (copyEl) copyEl.style.setProperty('--push', 0);
    if (indexEl) indexEl.style.setProperty('--push', 0);

    const scrollY = window.scrollY;
    nat = images.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top + scrollY, h: r.height, w: r.width };
    });

    const winW = document.documentElement.clientWidth;
    const stackR = stack.getBoundingClientRect();
    const copyR = copyEl ? copyEl.getBoundingClientRect() : null;
    const indexR = indexEl ? indexEl.getBoundingClientRect() : null;

    // Under 900px the columns stack above and below the images (see
    // work.css), so there is nothing beside the stack to collide with,
    // nothing to push, and nothing to fade out of the way.
    sideBySide =
      !!copyR && !!indexR &&
      copyR.right <= stackR.left + 1 &&
      indexR.left >= stackR.right - 1;

    if (!sideBySide) {
      push = 0;
      widthBudget = stackR.width;
      if (copyEl) copyEl.style.setProperty('--reveal', 1);
      if (indexEl) indexEl.style.setProperty('--reveal', 1);
      update();
      return;
    }

    // How far the columns can retreat before they leave the window. A
    // flat COLUMN_PUSH regardless would drag both clean off the edges
    // of a wide screen.
    const roomLeft = Math.max(0, copyR.left - EDGE_GAP);
    const roomRight = Math.max(0, winW - indexR.right - EDGE_GAP);
    push = Math.min(COLUMN_PUSH, roomLeft, roomRight);

    // The clear span between the two columns once they have retreated,
    // less the gap promised on each side. Images are centred on the
    // midpoint of that span, so this is a symmetric budget.
    widthBudget = Math.max(
      120,
      (indexR.left - copyR.right) + push * 2 - EDGE_GAP * 2,
    );

    // The reveal targets are the MID-LINES of the two columns, not
    // their inner edges: full strength should arrive when the cursor is
    // over the middle of the text it is reaching for, not the moment it
    // clips the edge. Measured at rest — the push shifts them a little
    // in use, but a stable target keeps the ramp from breathing.
    copyTarget = (copyR.left + copyR.right) / 2;
    indexTarget = (indexR.left + indexR.right) / 2;

    applyReveal();
    update();
  }

  // ─── Reveal ─────────────────────────────────────────────────────────

  // One number for BOTH columns: how far the cursor has strayed from
  // the middle of the window toward either inner edge, whichever it is
  // closer to reaching. Heading for the archive lifts the description
  // by exactly as much, so the two fade as one.
  // `span` is centre-to-inner-edge for one side, `travelled` how far
  // the cursor has come that way. The first REVEAL_DEAD_PX is ignored;
  // the remainder of the journey runs 0 → 1.
  function ramp(span, travelled) {
    if (!(span > 0)) return 0;
    const dead = Math.min(REVEAL_DEAD_PX, span * 0.8);
    const live = span - dead;
    if (!(live > 0)) return travelled >= dead ? 1 : 0;
    return clamp01((travelled - dead) / live);
  }

  function proximity(x) {
    if (!sideBySide || x === null) return 0;
    const centreX = document.documentElement.clientWidth / 2;
    return Math.max(
      ramp(centreX - copyTarget, centreX - x),
      ramp(indexTarget - centreX, x - centreX),
    );
  }

  // Linear on purpose: proximity() is already a straight 0 → 1 across
  // the travel, and easing it made the columns feel slow to answer near
  // the middle. The value goes straight to opacity.
  function applyReveal() {
    if (!sideBySide) return;
    const o = Math.max(floor, proximity(pointerX), heldOpen ? 1 : 0).toFixed(3);
    if (copyEl) copyEl.style.setProperty('--reveal', o);
    if (indexEl) indexEl.style.setProperty('--reveal', o);
  }

  // The scroll-driven fade runs on its own short rAF loop rather than a
  // CSS transition: the cursor writes the same opacity property every
  // frame, and a transition would fight it and lag behind. The token
  // lets restoreColumns() cancel a fade that is still in flight — an
  // orphaned loop would otherwise keep writing `floor` back down.
  function fadeColumns() {
    if (reduceMotion || !sideBySide) return;
    if (fading || floor <= REVEAL_FLOOR + 0.001) return;

    fading = true;
    floorFrom = floor;
    fadeStart = performance.now();
    const token = ++fadeToken;

    const tick = (now) => {
      if (token !== fadeToken) return; // superseded or cancelled
      const t = clamp01((now - fadeStart) / REVEAL_FADE_MS);
      floor = floorFrom + (REVEAL_FLOOR - floorFrom) * smoothstep(t);
      applyReveal();
      if (t < 1) requestAnimationFrame(tick);
      else fading = false;
    };
    requestAnimationFrame(tick);
  }

  // Reaching a column resets the whole interaction: the baseline goes
  // back to full, so the columns stay lit after the cursor wanders off
  // again, and only the next scroll dims them. No animation needed —
  // the cursor is already holding them at full strength, so this is an
  // invisible handover from proximity to floor.
  function restoreColumns() {
    fadeToken++;
    fading = false;
    floor = 1;
    applyReveal();
  }

  // ─── Scale + push ───────────────────────────────────────────────────

  function update() {
    const scrollY = window.scrollY;
    const centreY = scrollY + vh / 2;

    // Pass 1 — scale for every image, from its natural centre's
    // distance to the centre of the screen, toward its own ceiling.
    const scales = nat.map(({ top, h }, i) => {
      const d = Math.abs(top + h / 2 - centreY);
      const norm = Math.min(d / (vh * FALLOFF), 1);
      return MIN_SCALE + smoothstep(1 - norm) * (maxScale(i) - MIN_SCALE);
    });

    // Pass 2 — the magnetic push. Scaling happens about each image's
    // centre, so an image at scale s overhangs its natural box by
    // (s-1)*h/2 top and bottom. Adding the facing overhangs of any two
    // neighbours gives exactly the offset needed to keep the visual gap
    // between them equal to the CSS gap.
    //
    // The chain is anchored on whichever image is nearest the centre of
    // the screen: that one holds its natural position (so it tracks the
    // scroll honestly rather than sliding around under you) and shoves
    // the others away from it — up above, down below, like facing
    // magnet poles. Anchoring at one end instead would let the push
    // accumulate in one direction and drift the last image below where
    // the page can scroll.
    const ty = new Array(images.length);
    let pivot = 0;
    let best = Infinity;
    for (let i = 0; i < nat.length; i++) {
      const d = Math.abs(nat[i].top + nat[i].h / 2 - centreY);
      if (d < best) { best = d; pivot = i; }
    }

    const overhang = (i) => ((scales[i] - 1) * nat[i].h) / 2;

    ty[pivot] = 0;
    for (let i = pivot + 1; i < images.length; i++) {
      ty[i] = ty[i - 1] + overhang(i - 1) + overhang(i);
    }
    for (let i = pivot - 1; i >= 0; i--) {
      ty[i] = ty[i + 1] - overhang(i + 1) - overhang(i);
    }

    // Keep the top of the stack from climbing up under the header —
    // only ever nudges things down, and only while the first image is
    // large (i.e. at the top of the page).
    const firstVisualTop = nat[0].top + ty[0] - overhang(0);
    if (firstVisualTop < nat[0].top) {
      const delta = nat[0].top - firstVisualTop;
      for (let i = 0; i < ty.length; i++) ty[i] += delta;
    }

    let maxFocus = 0;
    for (let i = 0; i < images.length; i++) {
      const el = images[i];
      el.style.setProperty('--s', scales[i].toFixed(4));
      el.style.setProperty('--ty', ty[i].toFixed(2));
      el.style.zIndex = 10 + Math.round(scales[i] * 100);

      // Focus is measured against this image's OWN ceiling, so a fully
      // grown image reads as fully focused even where its ceiling sits
      // lower than its neighbour's.
      const range = maxScale(i) - MIN_SCALE;
      const focus = range > 0.001 ? (scales[i] - MIN_SCALE) / range : 0;
      if (focus > maxFocus) maxFocus = focus;
    }

    // Columns retreat in step with whichever image is most in focus,
    // but never further than there is actually room for.
    const p = (maxFocus * push).toFixed(2);
    if (copyEl) copyEl.style.setProperty('--push', p);
    if (indexEl) indexEl.style.setProperty('--push', p);
  }

  // ─── Events ─────────────────────────────────────────────────────────

  // Coalesce to one write per frame even if scroll fires more often.
  let ticking = false;
  function onScroll() {
    fadeColumns();
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      update();
      ticking = false;
    });
  }

  // Same coalescing for the cursor — mousemove fires far more often
  // than the screen refreshes.
  let revealTicking = false;
  function onPointerMove(e) {
    pointerX = e.clientX;
    if (revealTicking) return;
    revealTicking = true;
    requestAnimationFrame(() => {
      applyReveal();
      revealTicking = false;
    });
  }

  // Reveal each image once as it first scrolls into view.
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealIO.unobserve(entry.target);
      }
    });
  }, { threshold: 0.05 });
  images.forEach((el) => revealIO.observe(el));

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', measure);
  window.addEventListener('mousemove', onPointerMove, { passive: true });

  // Cursor gone from the window — drop back to whatever the scroll
  // floor says, rather than leaving the columns stranded at full
  // strength.
  document.addEventListener('mouseleave', () => {
    pointerX = null;
    applyReveal();
  });

  // Keyboard users never move a cursor, so hold the columns open for as
  // long as focus is inside either one — otherwise tabbing into the
  // archive would land on links nobody can see.
  [copyEl, indexEl].forEach((el) => {
    if (!el) return;

    // Actually reaching a column — with the cursor, or with the keyboard
    // — is what resets the fade.
    el.addEventListener('mouseenter', restoreColumns);

    el.addEventListener('focusin', () => {
      heldOpen = true;
      restoreColumns();
    });
    el.addEventListener('focusout', (e) => {
      if (el.contains(e.relatedTarget)) return;
      heldOpen = false;
      applyReveal();
    });
  });

  // Images arrive with width/height attributes so layout is correct
  // before they decode, but re-measure on full load as a safety net
  // (web fonts and scrollbar changes can shift things slightly).
  measure();
  window.addEventListener('load', measure);
})();
