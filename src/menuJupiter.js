// ==========================================
// LAUNCH PAGE JUPITER
// 32 rotation frames: img/jupiter/rotation/jupiter_rotation_00.png ... _31.png
// They are shown in number order, one at a time (no blending), and one
// full turn takes 24 seconds (0.75 s per frame), looping without a pause.
//
// The planet never changes size, position or shape: every frame is drawn
// in the same box, unscaled relative to the others, with nearest-neighbour
// (pixelated) scaling set in index.html. No CSS rotation, flip or stretch.
// ==========================================

const FRAME_COUNT = 32;
const ROTATION_SECONDS = 24;
const FRAME_SECONDS = ROTATION_SECONDS / FRAME_COUNT;

const container = document.querySelector('#menu-jupiter');
const menu = document.querySelector('#main-menu');
const picture = container ? container.querySelector('img') : null;

const framePath = index =>
  `./img/jupiter/rotation/jupiter_rotation_${String(index).padStart(2, '0')}.png`;

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
  if (!picture) return;

  const frames = await preloadFrames();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const startTime = performance.now();

  let shown = -1;

  function frameLoop(now) {
    const menuVisible = !menu.classList.contains('menu-hidden');

    if (menuVisible && !reducedMotion.matches) {
      // The frame comes straight from the clock, so the speed is constant
      // and the loop from frame 31 back to frame 00 has no pause.
      const index = Math.floor((now - startTime) / 1000 / FRAME_SECONDS) % FRAME_COUNT;

      if (index !== shown) {
        shown = index;
        picture.src = frames[index].src;
      }
    }

    if (menuVisible) requestAnimationFrame(frameLoop);
  }

  requestAnimationFrame(frameLoop);
}

start();
