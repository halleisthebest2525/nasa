// ==========================================
// LAUNCH PAGE JUPITER (stabilised)
// The original 32 frames drifted in position/size and 9 of them (18-26)
// had a different tilt. img/jupiter/stable/ holds 23 cleaned frames:
// every frame aligned to the same centre and size, the off-tilt ones
// removed, and the rest reordered so each frame is the closest match to
// the previous one (including the loop back to frame 1).
// Playback: a steady crossfade, one frame every 0.8 s, so the planet turns
// at a constant pace with no jumps. No CSS rotation is used.
// ==========================================

const FRAME_COUNT = 23;
const FRAME_SECONDS = 0.8;

const container = document.querySelector('#menu-jupiter');
const menu = document.querySelector('#main-menu');
const [bottom, top] = container ? container.querySelectorAll('img') : [];

const framePath = index =>
  `./img/jupiter/stable/jupiter_stable_${String(index + 1).padStart(2, '0')}.png`;

// Preload and decode every frame before animating (no flicker when swapping).
async function preloadFrames() {
  const frames = Array.from({ length: FRAME_COUNT }, (_, i) => {
    const frame = new Image();
    frame.src = framePath(i);
    return frame;
  });

  await Promise.all(frames.map(frame =>
    frame.decode().catch(() => console.warn('Jupiter frame failed to load:', frame.src))
  ));

  return frames;
}

async function start() {
  if (!bottom || !top) return;

  const frames = await preloadFrames();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let current = 0;      // frame shown underneath
  let progress = 0;     // 0..1 fade of the next frame on top
  let last = performance.now();

  bottom.src = frames[0].src;
  top.src = frames[1].src;
  top.style.opacity = '0';

  function frameLoop(now) {
    const menuVisible = !menu.classList.contains('menu-hidden');

    if (menuVisible && !reducedMotion.matches) {
      progress += (now - last) / 1000 / FRAME_SECONDS;

      // Move on one frame per 0.8 s (catching up after a pause).
      while (progress >= 1) {
        progress -= 1;
        current = (current + 1) % FRAME_COUNT;
        bottom.src = frames[current].src;
        top.src = frames[(current + 1) % FRAME_COUNT].src;
      }

      top.style.opacity = progress.toFixed(3);
    }

    last = now;

    if (menuVisible) requestAnimationFrame(frameLoop);
  }

  requestAnimationFrame(frameLoop);
}

start();
