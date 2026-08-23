// IAMWE work archive — eight plates on a turning cylinder.
//
// The plates are flat cards that always face the camera. They are not
// laid out on the page so much as arranged around a vertical cylinder
// standing in front of it: three near the front face, three on the back
// face, and two out at the sides, halfway between. The cylinder turns
// slowly, so over a couple of minutes every project takes its turn at
// the front — larger, sharper, painted over its neighbours, pulled
// hardest by the cursor — before travelling round to the back again.
//
// Nothing is rotated. A card tilted away from the camera would show a
// photograph in perspective, which is the one thing a photograph should
// never be. Depth is carried entirely by scale, stacking order and a
// slight fall in contrast toward the back — the way a stack of prints on
// a table reads as deep without any of them being turned.
//
// Four things move a plate, and they are deliberately separate:
//
//   CYLINDER  where it sits in depth. One number — the cosine of its
//             angle — driving scale, z-index, and how strongly the rest
//             of this applies. Scrolling spins the cylinder faster.
//   DRIFT     a slow wander. Cards bounce off the edges of the window
//             rather than leaving it, so the composition is always
//             whole; nothing sits half off the screen waiting to return.
//   SPACING   cards push each other apart when they crowd. This is what
//             keeps the arrangement readable without anyone authoring
//             it — the layout is a running negotiation, not a plan.
//   CURSOR    the page leans with the pointer, and whatever is nearest
//             leans in to meet it. Front cards feel this most.
//
// The index rows below the fold are not on the cylinder. They keep the
// gentle parallax they always had — a list that changed size while you
// were reading it would be unbearable.

(() => {
  const items = Array.from(document.querySelectorAll('[data-depth]'));
  if (!items.length) return;

  // ── The cylinder ────────────────────────────────────────────────────
  const TURN_MS = 96_000;      // one full revolution at rest
  const SCROLL_GAIN = 0.0022;  // extra turn per pixel scrolled
  const SCROLL_DECAY = 0.93;   // how fast a scroll's push bleeds away
  const SCALE_BACK = 0.58;     // a card on the far face
  const SCALE_FRONT = 1.16;    // a card on the near face
  const FADE_BACK = 0.80;      // far cards sit back a little in contrast

  // Three at the front, three at the back, two out at the sides. The
  // small spread inside each group is what stops the front three from
  // travelling as one slab.
  const STATIONS = [
    -0.42, 0, 0.42,                            // front face
    Math.PI - 0.42, Math.PI, Math.PI + 0.42,   // back face
    Math.PI / 2, -Math.PI / 2,                 // the two sides
  ];

  // ── Drift and spacing ───────────────────────────────────────────────
  const SPEED_MIN = 5;         // px per second
  const SPEED_MAX = 13;
  const EDGE_PAD = 10;         // px kept between a card and the window
  const PUSH = 0.02;           // how hard crowded cards shove each other
  const PUSH_GAP = 26;         // px of air they try to keep

  // ── The cursor ──────────────────────────────────────────────────────
  const REACH_FAR = 12;        // px a back card leans with the pointer
  const REACH_NEAR = 44;       // px a front one does
  const PULL = 0.16;           // fraction of the way to the cursor
  const PULL_HOVER = 0.08;
  const PULL_MAX = 0.24;
  const EASE = 0.085;          // how quickly the lean catches up
  const FALLOFF = 620;         // px — how close counts as near

  const reduceMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let geo = [];
  let live = false;
  let pointerX = 0, pointerY = 0, hasPointer = false, hovered = -1;
  let spin = 0, spinBoost = 0, lastT = 0, lastScroll = 0;
  let vw = 0, vh = 0;

  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  // A fixed sequence, so every visit gets the same opening drift.
  const rnd = (() => {
    let s = 20260823;
    return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  })();

  function measure() {
    live = window.matchMedia('(min-width: 901px)').matches && !reduceMotion;
    vw = window.innerWidth;
    vh = window.innerHeight;

    if (!live) {
      items.forEach((el) => {
        ['--dx', '--dy', '--sc', '--fade'].forEach((p) => el.style.removeProperty(p));
      });
      document.documentElement.style.setProperty('--overhang', '0px');
      geo = [];
      return;
    }

    const sy = window.scrollY;
    let station = 0;

    geo = items.map((el) => {
      // Read the resting box with every live value stripped, so a resize
      // during motion cannot bake the current offset into the geometry.
      el.style.setProperty('--dx', 0);
      el.style.setProperty('--dy', 0);
      el.style.setProperty('--sc', 1);
      const r = el.getBoundingClientRect();
      const tile = el.classList.contains('tile');
      const depth = parseFloat(el.dataset.depth);

      const g = {
        el, tile,
        w: r.width, h: r.height,
        homeX: r.left, homeY: r.top + sy,
        // Where the card actually is, in viewport coordinates. Seeded
        // from where the stylesheet put it, then owned by the physics.
        x: r.left, y: r.top,
        vx: 0, vy: 0,
        ang: 0,
        near: 0.5,
        scale: 1,
        depth: Number.isFinite(depth) ? clamp01(depth) : 0.5,
        lx: 0, ly: 0,          // the cursor lean, eased
        z: -1,
      };

      if (tile) {
        g.ang = STATIONS[station % STATIONS.length];
        station++;
        const a = rnd() * Math.PI * 2;
        const s = SPEED_MIN + rnd() * (SPEED_MAX - SPEED_MIN);
        g.vx = Math.cos(a) * s;
        g.vy = Math.sin(a) * s;
      }
      return g;
    });

    // Nothing hangs below the plate any more — the cards bounce off the
    // window instead of running past it — so the index needs no clearance.
    document.documentElement.style.setProperty('--overhang', '0px');
  }

  // Keep a card inside the window, allowing for how big it currently is.
  function bounce(g) {
    const halfW = (g.w * g.scale) / 2;
    const halfH = (g.h * g.scale) / 2;
    let cx = g.x + g.w / 2;
    let cy = g.y + g.h / 2;

    const minX = halfW + EDGE_PAD, maxX = vw - halfW - EDGE_PAD;
    const minY = halfH + EDGE_PAD, maxY = vh - halfH - EDGE_PAD;

    if (maxX > minX) {
      if (cx < minX) { cx = minX; g.vx = Math.abs(g.vx); }
      else if (cx > maxX) { cx = maxX; g.vx = -Math.abs(g.vx); }
    } else cx = vw / 2;                      // card wider than the window
    if (maxY > minY) {
      if (cy < minY) { cy = minY; g.vy = Math.abs(g.vy); }
      else if (cy > maxY) { cy = maxY; g.vy = -Math.abs(g.vy); }
    } else cy = vh / 2;

    g.x = cx - g.w / 2;
    g.y = cy - g.h / 2;
  }

  // Cards that crowd each other drift apart. Gentle and symmetric, so the
  // arrangement keeps reorganising itself without ever snapping.
  function space(tiles) {
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        const a = tiles[i], b = tiles[j];
        const dx = (b.x + b.w / 2) - (a.x + a.w / 2);
        const dy = (b.y + b.h / 2) - (a.y + a.h / 2);
        const wantX = (a.w * a.scale + b.w * b.scale) / 2 + PUSH_GAP;
        const wantY = (a.h * a.scale + b.h * b.scale) / 2 + PUSH_GAP;
        const ox = wantX - Math.abs(dx);
        const oy = wantY - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;    // not crowding
        // Separate along whichever axis needs the least travel.
        if (ox < oy) {
          const p = ox * PUSH * (dx >= 0 ? 1 : -1);
          a.x -= p; b.x += p;
        } else {
          const p = oy * PUSH * (dy >= 0 ? 1 : -1);
          a.y -= p; b.y += p;
        }
      }
    }
  }

  let prevT = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    if (!live || !geo.length) { prevT = now; return; }

    const dt = prevT ? Math.min(0.05, (now - prevT) / 1000) : 0.016;
    prevT = now;

    // Scrolling spins the cylinder faster, then lets it settle back.
    const sy = window.scrollY;
    spinBoost += Math.abs(sy - lastScroll) * SCROLL_GAIN;
    lastScroll = sy;
    spinBoost *= SCROLL_DECAY;
    spin += ((Math.PI * 2) / (TURN_MS / 1000)) * dt + spinBoost * dt;

    const tiles = geo.filter((g) => g.tile);

    // 1. Depth, from the cylinder.
    for (const g of tiles) {
      g.near = (Math.cos(g.ang + spin) + 1) / 2;
      g.scale = SCALE_BACK + (SCALE_FRONT - SCALE_BACK) * g.near;
    }

    // 2. Drift, then spacing, then the window edges — in that order, so
    //    the edges always have the last word and nothing can be shoved
    //    out of the window by its neighbours.
    for (const g of tiles) { g.x += g.vx * dt; g.y += g.vy * dt; }
    space(tiles);
    for (const g of tiles) bounce(g);

    // 3. The cursor. A lean, riding on top of wherever the drift has got
    //    to, so the two never fight.
    const nx = hasPointer ? (pointerX - vw / 2) / (vw / 2) : 0;
    const ny = hasPointer ? (pointerY - vh / 2) / (vh / 2) : 0;
    for (let i = 0; i < geo.length; i++) {
      const g = geo[i];
      const front = g.tile ? g.near : g.depth;
      let tlx = nx * (REACH_FAR + (REACH_NEAR - REACH_FAR) * front);
      let tly = ny * (REACH_FAR + (REACH_NEAR - REACH_FAR) * front);

      if (hasPointer && g.tile) {
        const dx = pointerX - (g.x + g.w / 2);
        const dy = pointerY - (g.y + g.h / 2);
        let near = clamp01(1 - Math.sqrt(dx * dx + dy * dy) / FALLOFF);
        near *= near;
        const k = Math.min(PULL_MAX,
          (PULL * near + PULL_HOVER * (i === hovered ? 1 : 0)) * (0.35 + 0.65 * front));
        tlx += dx * k;
        tly += dy * k;
      }
      g.lx += (tlx - g.lx) * EASE;
      g.ly += (tly - g.ly) * EASE;
    }

    // 4. Write. Compositor-only properties, plus one integer when the
    //    stacking order actually changes.
    for (const g of geo) {
      if (g.tile) {
        g.el.style.setProperty('--dx', (g.x - g.homeX + g.lx).toFixed(2));
        g.el.style.setProperty('--dy', (g.y - g.homeY + g.ly).toFixed(2));
        g.el.style.setProperty('--sc', g.scale.toFixed(3));
        g.el.style.setProperty('--fade',
          (FADE_BACK + (1 - FADE_BACK) * g.near).toFixed(3));
        const z = 10 + Math.round(g.near * 40);
        if (z !== g.z) { g.z = z; g.el.style.setProperty('--z', z); }
      } else {
        g.el.style.setProperty('--dx', g.lx.toFixed(2));
        g.el.style.setProperty('--dy', g.ly.toFixed(2));
      }
    }
  }

  // ── Events ──────────────────────────────────────────────────────────

  window.addEventListener('mousemove', (e) => {
    pointerX = e.clientX;
    pointerY = e.clientY;
    hasPointer = true;
  }, { passive: true });

  document.addEventListener('mouseleave', () => { hasPointer = false; });

  items.forEach((el, i) => {
    el.addEventListener('mouseenter', () => { hovered = i; });
    el.addEventListener('mouseleave', () => { if (hovered === i) hovered = -1; });
  });

  let resizeT = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(measure, 120);
  });

  measure();
  window.addEventListener('load', measure);
  requestAnimationFrame(frame);

  // ── Local time, top left ────────────────────────────────────────────
  const clock = document.getElementById('clock');
  if (clock) {
    const tick = () => {
      clock.textContent = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Europe/London',
      }).format(new Date());
    };
    tick();
    setInterval(tick, 15000);
  }
})();
