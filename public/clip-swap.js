// A plate that changes its mind about which clip it is showing.
//
// The clips are short — three or four seconds — and they loop, so at rest
// the plate is a single repeating shot. Every time the cursor arrives or
// leaves it moves to the next clip in the set, which means a plate you
// keep glancing at keeps showing you something else, and a plate you
// never touch stays exactly as it was.
//
// The clips are stacked, not swapped by src: changing a video's src tears
// the current frame down before the next one has decoded, which reads as
// a flash. Stacked, the incoming clip is already showing a frame by the
// time it fades up. Only the first is fetched on load; the rest carry
// their address in data-src and are only asked for when they are first
// needed, so a plate nobody hovers costs one clip, not five.
(() => {
  document.querySelectorAll('[data-clip-swap]').forEach((box) => {
    const clips = Array.from(box.querySelectorAll('video'));
    if (clips.length < 2) return;

    let current = 0;
    let settling = null;

    const show = (next) => {
      if (next === current) return;
      const from = clips[current];
      const to = clips[next];

      // Fetch on first use. Everything after this is free.
      if (!to.src && to.dataset.src) to.src = to.dataset.src;
      to.currentTime = 0;
      const started = to.play();
      if (started && started.catch) started.catch(() => {});

      to.classList.add('is-on');
      from.classList.remove('is-on');

      // Stop the outgoing clip once it has finished fading, not before —
      // pausing it while it is still visible freezes a frame on screen.
      clearTimeout(settling);
      settling = setTimeout(() => from.pause(), 420);

      current = next;
    };

    const advance = () => show((current + 1) % clips.length);

    box.addEventListener('mouseenter', advance);
    box.addEventListener('mouseleave', advance);

    // A plate scrolled out of sight has no reason to keep decoding.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          const v = clips[current];
          if (e.isIntersecting) {
            const started = v.play();
            if (started && started.catch) started.catch(() => {});
          } else {
            v.pause();
          }
        });
      }, { threshold: 0.01 }).observe(box);
    }
  });
})();
