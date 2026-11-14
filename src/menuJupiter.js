// ==========================================
// LAUNCH PAGE JUPITER
// Plays img/jupiter/jupiter_001.png ... jupiter_032.png in order, looping,
// one frame every 0.8 s. The rotation comes from the frames themselves.
// ==========================================

const FRAME_COUNT = 32;
const FRAME_SECONDS = 0.8;

const container = document.querySelector('#menu-jupiter');
const menu = document.querySelector('#main-menu');
const image = container ? container.querySelector('img') : null;

const framePath = index =>
  `./img/jupiter/jupiter_${String(index + 1).padStart(3, '0')}.png`;

// Preload and decode every frame before animating (no flicker when swapping).
async function preloadFrames() {
  const frames = Array.from({ length: FRAME_COUNT }, (_, i) => {
    const frame = new Image();
    frame.src = framePath(i);
    return frame;
  });

  await Promise.all(frames.map(frame =>
    frame.decode().catch(() => {
      console.warn('Jupiter frame failed to load:', frame.src);
    })
  ));

  return frames;
}

async function start() {
  if (!image) return;

  const frames = await preloadFrames();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let current = 0;
  let elapsed = 0;
  let last = performance.now();

  function frameLoop(now) {
    // Only animate while the launch page is visible.
    const menuVisible = !menu.classList.contains('menu-hidden');

    if (menuVisible && !reducedMotion.matches) {
      elapsed += (now - last) / 1000;

      // Advance exactly one frame per 0.8 s (catch up after a pause).
      let next = current;

      while (elapsed >= FRAME_SECONDS) {
        elapsed -= FRAME_SECONDS;
        next = (next + 1) % FRAME_COUNT;
      }

      // Only touch the DOM when the frame actually changes.
      if (next !== current) {
        current = next;
        image.src = frames[current].src;
      }
    }

    last = now;

    if (menuVisible) {
      requestAnimationFrame(frameLoop);
    }
  }

  requestAnimationFrame(frameLoop);
}

start();
