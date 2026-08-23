// Sound on hover, for the clips that ask for it.
//
// Every clip on a project page starts muted, because muted autoplay is
// the only kind a browser will begin without being asked. Unmuting later
// is a different matter: once a video is already playing, raising its
// volume is not gated by autoplay policy, so a hover is enough. That is
// the whole trick — the video was never stopped, it was only silent.
//
// The player lives inside a Cloudflare iframe, so it cannot be reached
// with the ordinary media API; Cloudflare's SDK wraps the iframe and
// gives back an object with the same shape. If the SDK has not arrived —
// blocked, offline, whatever — nothing here runs and the clips simply
// stay muted, which is a perfectly good page.
(() => {
  const blocks = document.querySelectorAll('.stage-stream[data-sound-on-hover]');
  if (!blocks.length || typeof window.Stream !== 'function') return;

  blocks.forEach((block) => {
    const iframe = block.querySelector('iframe');
    if (!iframe) return;

    let player = null;
    const attach = () => (player = player || window.Stream(iframe));

    // Ramp rather than jump. A clip that snaps to full volume as the
    // cursor crosses its edge is startling; a short fade reads as the
    // sound belonging to the picture you are looking at.
    let fade = null;
    const to = (target) => {
      const p = attach();
      if (!p) return;
      clearInterval(fade);
      if (target > 0) p.muted = false;
      let v = typeof p.volume === 'number' ? p.volume : (target > 0 ? 0 : 1);
      fade = setInterval(() => {
        v += (target - v) * 0.25;
        if (Math.abs(target - v) < 0.02) {
          v = target;
          clearInterval(fade);
          if (target === 0) p.muted = true;
        }
        try { p.volume = v; } catch (e) { clearInterval(fade); }
      }, 40);
    };

    block.addEventListener('mouseenter', () => to(1));
    block.addEventListener('mouseleave', () => to(0));

    // Leaving the tab with a clip playing out loud is rude.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) to(0);
    });
  });
})();
