// IAMWE work archive — the hidden field, and the brush that finds it.
//
// Behind every picture the page is ruled into rows of type. Every word
// the site says — project titles, credits, the write-ups, the small
// print in the corners — set very small and tracked out so far that it
// stops reading as language and starts reading as texture, with a
// hairline running through the centre of each row.
//
// None of it is visible at rest. Moving the cursor wipes it into view,
// and the wipe fades behind you, so the page carries a slowly-closing
// trail of where you have been. The wordmark is revealed by the same
// stroke. And wherever the cursor actually is, the letters lose their
// nerve: anything inside a small radius is replaced by a random glyph,
// re-rolled several times a second, so the words scramble under your
// hand and settle again once you have moved on.
//
// Two surfaces carry the reveal:
//
//   MASK      an offscreen canvas holding nothing but alpha: where the
//             brush has been and how recently. Every frame it is knocked
//             back by FADE, which is the whole of the tail — no stroke
//             history, no particle list, just a surface forgetting at a
//             constant rate.
//   VISIBLE   the field drawn, intersected with the mask
//             (destination-in), then filled with ink.
//
// The cost is kept down by never setting a glyph the brush cannot show.
// Characters sit on a fixed advance from a fixed origin, so the glyph at
// any point on the page follows from its coordinates — finding the ones
// inside the trail's rectangle is integer division rather than laying
// out a paragraph and clipping it. On a typical sweep that is a couple
// of hundred glyphs a frame instead of a few thousand. The loop parks
// itself once the tail has decayed, so a still page runs nothing at all.
//
// An earlier version of this field was a flower-of-life lattice —
// circles on a triangular grid, radii driven by four non-harmonic sines.
// Worth knowing it existed: the compositing chain here is unchanged from
// it, and only the thing being drawn is different.

(() => {
  const plate = document.querySelector('.plate');
  if (!plate) return;

  const reduceMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  // ── The field ───────────────────────────────────────────────────────
  // Rows of type. Every word on the site — the project titles, the
  // credits, the write-ups, the small print in the corners — set very
  // small and tracked out so far that it stops reading as language and
  // starts reading as texture. A hairline runs through the centre of
  // each row, so the page behind the pictures is a ruled sheet with the
  // studio's own words strung along it.
  //
  // Characters are placed by arithmetic rather than measured: every
  // glyph sits on a fixed advance from a fixed origin, so the character
  // at any point on the page can be worked out from its coordinates
  // alone. That is what makes it cheap — only the glyphs inside the
  // brush's trail are ever drawn, and finding them is integer division
  // rather than laying out a paragraph and clipping it.
  const FONT_PX = 11;
  const ADVANCE = 19;          // px between characters — the tracking
  const ROW_GAP = 52;          // px between rows
  const RULE_ALPHA = 0.14;     // the hairline through each row
  const TEXT_ALPHA = 0.82;
  const DRIFT_PX = 26;         // how far the rows creep sideways
  const DRIFT_MS = 42_000;     // …and how long a full creep takes

  // Under the cursor the letters lose their nerve. Anything inside this
  // radius is replaced by a random glyph, re-rolled a few times a
  // second, so the words scramble exactly where you are looking and
  // settle again behind you.
  const SCRAMBLE_R = 92;
  const SCRAMBLE_MS = 70;      // how often the random glyphs re-roll
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\|<>*+—·#%&';


  // ── The brush ───────────────────────────────────────────────────────
  // Not a disc. The stamp is a comet: a tight bright head at the cursor
  // with a short taper dragging behind it, along the direction of
  // travel. It is one radial gradient, but an offset one — the inner
  // focus sits at the head while the outer circle is centred behind it,
  // so the falloff is abrupt at the front and drawn out at the back. A
  // symmetric disc, however soft, always reads as a spotlight.
  // Worth knowing this is the most expensive number on the page. It sets
  // the stamp's area (which goes as the square of it) AND the size of the
  // trail's bounding box, which is what decides how many circles get
  // built each frame. Halving it does far more for frame time than any
  // amount of tuning the lattice.
  const RADIUS = 82;          // the head
  const TAIL = 0.85;          // × RADIUS, how far the taper drags back
  const STRENGTH = 0.46;
  const STAMP_STEP = 9;
  const FADE = 0.030;         // alpha removed per frame — this IS the tail
  const IDLE_FRAMES = 260;
  const TRAIL_LIFE = 170;     // frames a stamp still contributes visible alpha
  const CULL_MARGIN = 60;     // px of slack around the trail; stamps are
                              // logged at the comet's BODY centre, so the
                              // tail is already inside this

  // ── Ink ─────────────────────────────────────────────────────────────
  // The field and the mark are both plain black, filled once and cut to
  // the line art. Two earlier versions are worth remembering: a wash
  // averaged from the pictures on the page (which meant packing every
  // image into a sheet, downscaling it hard and holding a full-page copy
  // of the result), and a gradient walked round a yellow-orange-red ring.
  // Both are gone. A flat fill is the cheapest of the three and the
  // quietest — the pictures carry the colour on this page, and the field
  // is only ever glimpsed under the brush.
  //
  // Colouring each circle individually would have meant one stroke per
  // circle: a few thousand draw calls a frame instead of five. Masking a
  // single fill costs one composite however many circles there are.
  const INK = '#000000';

  // ── Cost ────────────────────────────────────────────────────────────
  // Two halves scale badly and they scale differently. The CPU half is
  // the lattice loop — sines and arc tessellation — and it grows with
  // circle COUNT, so with window area. The GPU half is the full-canvas
  // composites, and it grows with PIXELS, so with area times the device
  // pixel ratio squared. A 4K retina window is eight times the work of a
  // laptop for an identical-looking result.
  //
  // Rather than pick one setting and hope, the effect watches its own
  // frame time and steps down if it cannot keep up. Each tier costs
  // roughly half the one above:
  //
  //   0  full pixel density, full lattice
  //   1  1x pixels — the single biggest saving on a retina display,
  //      four times fewer pixels for hairlines nobody reads that closely
  //   2  1x pixels, lattice opened out by half
  //
  // It only ever steps down, never back up: a display that stutters once
  // will stutter again, and oscillating between tiers is worse to look at
  // than the lower one.
  const TIERS = [
    { dpr: Math.min(window.devicePixelRatio || 1, 2), spacing: 1 },
    { dpr: 1, spacing: 1 },
    { dpr: 1, spacing: 1.5 },
  ];
  const SLOW_MS = 21;        // a median frame above this is not holding 60
  const SAMPLE = 45;         // frames per verdict

  let tier = 0;
  let dpr = TIERS[0].dpr;
  let samples = [];

  const canvas = document.createElement('canvas');
  canvas.className = 'grid-reveal';
  canvas.setAttribute('aria-hidden', 'true');
  plate.prepend(canvas);
  const ctx = canvas.getContext('2d');

  const mask = document.createElement('canvas');
  const mctx = mask.getContext('2d');

  // The line art, drawn black each frame and then used as a stencil.
  const lines = document.createElement('canvas');
  const lctx = lines.getContext('2d');

  // The mark. Drawn on a layer the size of the mark, never the page, and
  // intersected with the matching patch of the brush mask — so it is
  // revealed by the same stroke as the field behind it, for a few
  // thousand pixels a frame instead of a few million.
  const markLayer = document.createElement('canvas');
  const kctx = markLayer.getContext('2d');
  // How wide to draw the mark, in CSS pixels.
  //
  // This used to read --mark-w straight off the root with
  // getComputedStyle().getPropertyValue(), which does not work and was
  // silently wrong for a long time. A custom property is substitution
  // only: its computed value is the token stream exactly as authored, so
  // a clamp() comes back as the literal string "clamp(66px, 7.8vw,
  // 120px)". parseFloat gives NaN, the `|| 240` fallback fires, and the
  // mark renders at 240px no matter what the stylesheet says — which is
  // why halving --mark-w appeared to do nothing at all.
  //
  // Measuring an element whose width IS that property is the reliable
  // way: the browser resolves the clamp, and the box it produces can be
  // read in pixels. It happens on resize, not per frame.
  let markW = 240;
  function measureMark() {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:absolute;left:-9999px;top:0;height:0;width:var(--mark-w)';
    document.body.appendChild(probe);
    const px = probe.getBoundingClientRect().width;
    probe.remove();
    if (px > 0) markW = px;
  }

  const markImg = new Image();
  let markReady = false;
  markImg.src = "/IAMWE_LOGO_TRIM.svg";
  markImg.addEventListener('load', () => { markReady = true; });
  if (markImg.complete) markReady = true;

  // The mark is not drawn in the colour it was authored in. Its shape is
  // kept and refilled from the same gradient as the field, sampled at the
  // patch of page the mark occupies — so the wordmark is always exactly
  // the colour the grid is where it sits, and cycles with it.

  // The live tracking and row spacing. A slower machine gets the field
  // opened out rather than switched off — fewer glyphs to set for the
  // same reading of the page.
  let adv = ADVANCE;
  let gap = ROW_GAP;

  function gauge() {
    const k = TIERS[tier].spacing;
    adv = ADVANCE * k;
    gap = ROW_GAP * k;
  }

  let w = 0, h = 0;
  let pageLeft = 0, pageTop = 0;
  let lastX = null, lastY = null;
  let idle = IDLE_FRAMES;
  let running = false;
  let t0 = 0;
  let frameNo = 0;

  // Where the brush has been recently. The field is only ever seen
  // through the mask, so there is no reason to build cells nowhere near
  // the trail.
  let stamps = [];

  function resize() {
    const r = plate.getBoundingClientRect();
    w = Math.round(r.width);
    h = Math.round(r.height);
    pageLeft = r.left + window.scrollX;
    pageTop = r.top + window.scrollY;

    for (const c of [canvas, mask, lines]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    canvas.style.width = mask.style.width = lines.style.width = w + 'px';
    canvas.style.height = mask.style.height = lines.style.height = h + 'px';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    measureMark();
    gauge();
    rows = [];
    lastX = lastY = null;
    draw(0);
  }

  // ── The ink ─────────────────────────────────────────────────────────
  // One flat fill, the size of the page. The stencil does all the work
  // after this.
  function paintInk() {
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, w, h);
  }

  // ── Draw ────────────────────────────────────────────────────────────
  // The field is only ever seen through the mask, so there is no reason
  // to set a glyph anywhere the brush has not been recently. This is the
  // rectangle the trail could possibly show — expired stamps are dropped
  // on the way past, which is also the only place the stamp list is
  // pruned.
  function activeRect() {
    if (stamps.length) {
      let i = 0;
      while (i < stamps.length && frameNo - stamps[i].f > TRAIL_LIFE) i++;
      if (i) stamps = stamps.slice(i);
    }
    if (!stamps.length) return null;

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of stamps) {
      if (s.x < x0) x0 = s.x;
      if (s.y < y0) y0 = s.y;
      if (s.x > x1) x1 = s.x;
      if (s.y > y1) y1 = s.y;
    }
    const m = RADIUS + CULL_MARGIN;
    return { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m };
  }

  // ── The rows ────────────────────────────────────────────────────────
  // One long string per row, cycled with modulo, so a row has no end and
  // no seam to hide. The corpus is whatever the page is carrying: a JSON
  // block written by the build if there is one, and failing that the
  // text of the page itself.
  let rows = [];

  function corpus() {
    const tag = document.getElementById('iw-corpus');
    if (tag) {
      try {
        const list = JSON.parse(tag.textContent);
        if (Array.isArray(list) && list.length) return list;
      } catch (e) { /* fall through to the page */ }
    }
    const out = [];
    document.querySelectorAll('.tile .tag span:last-child, .index-list .t, .index-list .d, .corner')
      .forEach((el) => {
        const s = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (s.length > 2) out.push(s);
      });
    return out.length ? out : ['IAMWE'];
  }

  function buildRows() {
    const src = corpus().map((s) => s.toUpperCase());
    if (!src.length) { rows = ['IAMWE']; return; }
    const count = Math.ceil(h / gap) + 2;
    rows = [];
    for (let r = 0; r < count; r++) {
      // Each row starts at a different point in the corpus and runs on
      // through it, so no two rows line up and the whole field never
      // repeats within a screen.
      let s = '';
      let k = r;
      while (s.length < 240) {
        s += src[k % src.length] + '   ·   ';
        k++;
      }
      rows.push(s);
    }
  }

  let scrambleTick = 0;

  function drawField(time) {
    const view = activeRect();
    if (!view) return;
    if (!rows.length) buildRows();

    // The rows creep sideways, slowly and not all together.
    const t = time / DRIFT_MS;
    scrambleTick = (time / SCRAMBLE_MS) | 0;

    lctx.font = `${FONT_PX}px 'Helvetica Neue', Helvetica, Arial, sans-serif`;
    lctx.textBaseline = 'middle';
    lctx.textAlign = 'center';

    const r0 = Math.max(0, Math.floor((view.y0 - gap) / gap));
    const r1 = Math.min(rows.length - 1, Math.ceil((view.y1 + gap) / gap));

    // The hairlines first, as one path, so the whole ruled sheet costs a
    // single stroke however many rows are showing.
    const rule = new Path2D();
    for (let r = r0; r <= r1; r++) {
      const y = Math.round(r * gap + gap / 2) + 0.5;
      rule.moveTo(view.x0, y);
      rule.lineTo(view.x1, y);
    }
    lctx.lineWidth = 1;
    lctx.strokeStyle = `rgba(0,0,0,${RULE_ALPHA})`;
    lctx.stroke(rule);

    lctx.fillStyle = `rgba(0,0,0,${TEXT_ALPHA})`;

    for (let r = r0; r <= r1; r++) {
      const line = rows[r];
      const y = r * gap + gap / 2;
      // Odd rows creep the other way, at a slightly different rate.
      const dir = (r & 1) ? -1 : 1;
      const originX = dir * (t * DRIFT_PX * (1 + (r % 3) * 0.22)) % adv;

      const i0 = Math.floor((view.x0 - originX) / adv);
      const i1 = Math.ceil((view.x1 - originX) / adv);

      for (let i = i0; i <= i1; i++) {
        const x = originX + i * adv;
        let ch = line[((i % line.length) + line.length) % line.length];
        if (ch === ' ') continue;

        // Scramble whatever the cursor is sitting on.
        if (lastX !== null) {
          const dx = x - lastX;
          const dy = y - lastY;
          if (dx * dx + dy * dy < SCRAMBLE_R * SCRAMBLE_R) {
            const n = (i * 2654435761 + r * 40503 + scrambleTick * 2246822519) >>> 0;
            ch = GLYPHS[n % GLYPHS.length];
          }
        }
        lctx.fillText(ch, x, y);
      }
    }
  }


  // ── Brush ───────────────────────────────────────────────────────────
  // (hx, hy) is the head; (ux, uy) a unit vector pointing the way the
  // cursor is going. With no direction to speak of it falls back to a
  // plain disc, which is what a stationary cursor should leave.
  function stamp(hx, hy, ux, uy) {
    const back = RADIUS * TAIL * 0.5;
    const cx = hx - ux * back;          // body centre, behind the head
    const cy = hy - uy * back;
    const outer = RADIUS + back;

    const g = mctx.createRadialGradient(hx, hy, 0, cx, cy, outer);
    g.addColorStop(0, `rgba(0,0,0,${STRENGTH})`);
    g.addColorStop(0.3, `rgba(0,0,0,${STRENGTH * 0.66})`);
    g.addColorStop(0.62, `rgba(0,0,0,${STRENGTH * 0.24})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');

    mctx.fillStyle = g;
    mctx.beginPath();
    mctx.arc(cx, cy, outer, 0, Math.PI * 2);
    mctx.fill();
    stamps.push({ x: cx, y: cy, f: frameNo });
  }

  // Stamp along the whole segment since the last frame — without this a
  // fast flick leaves a dotted line rather than a stroke.
  function paintTo(x, y) {
    mctx.globalCompositeOperation = 'source-over';
    if (lastX === null) {
      stamp(x, y, 0, 0);
    } else {
      const dx = x - lastX, dy = y - lastY;
      const dist = Math.hypot(dx, dy);
      // The whole segment shares one heading, so the comet points the
      // same way along its length and the stroke reads as one gesture.
      const ux = dist > 0.001 ? dx / dist : 0;
      const uy = dist > 0.001 ? dy / dist : 0;
      const steps = Math.max(1, Math.min(64, Math.ceil(dist / STAMP_STEP)));
      for (let i = 1; i <= steps; i++) {
        stamp(lastX + (dx * i) / steps, lastY + (dy * i) / steps, ux, uy);
      }
    }
    lastX = x; lastY = y;
  }

  // ── Frame ───────────────────────────────────────────────────────────
  function draw(time) {
    // 1. The mask forgets a little.
    mctx.globalCompositeOperation = 'destination-out';
    mctx.fillStyle = `rgba(0,0,0,${FADE})`;
    mctx.fillRect(0, 0, w, h);
    mctx.globalCompositeOperation = 'source-over';

    // 2. The field, onto the stencil.
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, w, h);
    drawField(time);

    // 3. Trim the stencil to what the brush has found.
    lctx.globalCompositeOperation = 'destination-in';
    lctx.drawImage(mask, 0, 0, w, h);

    // 4. The ink, full bleed, then cut to the stencil. Two composites,
    //    however many thousand circles are in it.
    // 'copy' replaces the canvas outright, so no separate clear is
    // needed — one fewer full-canvas pass every frame.
    ctx.globalCompositeOperation = 'copy';
    paintInk();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(lines, 0, 0, w, h);

    // 5. The mark, in solid ink, revealed by the same brush.
    if (markReady) {
      const mw = markW;
      const mh = (mw * markImg.height) / markImg.width;
      const mx = (w - mw) / 2;
      const my = (h - mh) / 2;

      const pw = Math.max(1, Math.round(mw * dpr));
      const ph = Math.max(1, Math.round(mh * dpr));
      if (markLayer.width !== pw || markLayer.height !== ph) {
        markLayer.width = pw;
        markLayer.height = ph;
      }
      kctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      kctx.globalCompositeOperation = 'source-over';
      kctx.clearRect(0, 0, mw, mh);
      kctx.drawImage(markImg, 0, 0, mw, mh);
      // Keep the shape, throw away the authored colour, and refill from
      // the page's own gradient at this exact position.
      kctx.globalCompositeOperation = 'source-in';
      kctx.fillStyle = INK;
      kctx.fillRect(0, 0, mw, mh);
      // Only the patch of mask sitting behind the mark.
      kctx.globalCompositeOperation = 'destination-in';
      kctx.drawImage(mask, mx * dpr, my * dpr, mw * dpr, mh * dpr, 0, 0, mw, mh);

      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(markLayer, mx, my, mw, mh);
    }

    // The mark is no longer punched out here. It is drawn as solid ink
    // in the DOM, above this canvas, so it hides the field simply by
    // being opaque — the same result, without a full-canvas composite
    // and an SVG rasterise on every single frame.

    ctx.globalCompositeOperation = 'source-over';
  }

  let lastFrame = 0;

  function grade(now) {
    if (lastFrame) samples.push(now - lastFrame);
    lastFrame = now;
    if (samples.length < SAMPLE) return;
    samples.sort((a, b) => a - b);
    const median = samples[samples.length >> 1];
    samples = [];
    if (median > SLOW_MS && tier < TIERS.length - 1) {
      tier++;
      dpr = TIERS[tier].dpr;
      resize();   // re-sizes every buffer and re-gauges the lattice
    }
  }

  function frame(now) {
    if (!t0) t0 = now;
    frameNo++;
    grade(now);
    draw((now - t0) / 1000);
    idle++;
    if (idle < IDLE_FRAMES) requestAnimationFrame(frame);
    else { running = false; lastFrame = 0; samples = []; }
  }

  function wake() {
    idle = 0;
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }

  // ── Events ──────────────────────────────────────────────────────────
  let queued = null;
  window.addEventListener('mousemove', (e) => {
    const x = e.clientX + window.scrollX - pageLeft;
    const y = e.clientY + window.scrollY - pageTop;
    if (x < -RADIUS || y < -RADIUS || x > w + RADIUS || y > h + RADIUS) {
      lastX = lastY = null;
      return;
    }
    if (queued) return;
    queued = requestAnimationFrame(() => {
      queued = null;
      paintTo(x, y);
      wake();
    });
  }, { passive: true });

  document.addEventListener('mouseleave', () => { lastX = lastY = null; });

  window.addEventListener('resize', resize);
  window.addEventListener('scroll', () => {
    const r = plate.getBoundingClientRect();
    pageLeft = r.left + window.scrollX;
    pageTop = r.top + window.scrollY;
    lastX = lastY = null;
  }, { passive: true });

  resize();
  window.addEventListener('load', resize);
})();
