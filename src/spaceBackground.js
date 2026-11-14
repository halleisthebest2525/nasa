// ==========================================
// SPACE BACKGROUND
// Two seamless 1024x1024 pixel-art textures, tiled forever,
// with parallax that follows the rocket's position.
// ==========================================

const TILE = 1024;

// How far each layer moves per world unit the rocket moves.
// The tiny-stars layer moves 1.8x faster than the far background.
const FAR_PARALLAX = 0.08;
const NEAR_PARALLAX = FAR_PARALLAX * 1.8;

// Very slow constant drift (texels per second), so space never looks frozen.
const FAR_DRIFT_X = -1.2;
const FAR_DRIFT_Y = 0.5;

// Keeps the background close to black.
const FAR_BRIGHTNESS = 0.85;

// Twinkling: only a few percent of the tiny stars, and only slightly.
const TWINKLE_SHARE = 0.04;
const TWINKLE_MAX_DIM = 0.55;

// Positive modulo: always returns 0..size-1, even for negative values.
function wrap(value, size) {
  return ((value % size) + size) % size;
}

// Finds a small random set of star pixels in the overlay texture.
function findTwinkleStars(image) {
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);

  let data;

  try {
    data = context.getImageData(0, 0, TILE, TILE).data;
  } catch {
    return [];
  }

  // One candidate per 8x8 cell, so a 2-pixel star is not picked twice.
  const used = new Set();
  const stars = [];

  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const alpha = data[(y * TILE + x) * 4 + 3];

      if (alpha < 180) continue;

      const cell = `${x >> 3},${y >> 3}`;

      if (used.has(cell)) continue;
      used.add(cell);

      if (Math.random() < TWINKLE_SHARE) {
        stars.push({
          x,
          y,
          speed: 0.6 + Math.random() * 1.4,
          phase: Math.random() * Math.PI * 2
        });
      }
    }
  }

  return stars;
}

export function createSpaceBackground(assets) {
  const farImage = assets.space_starfield;
  const nearImage = assets.space_stars_overlay;

  const ready = (image) =>
    image && image.complete && image.naturalWidth > 0;

  let farPattern = null;
  let nearPattern = null;
  let patternContext = null;
  let twinkleStars = ready(nearImage) ? findTwinkleStars(nearImage) : [];

  let driftX = 0;
  let driftY = 0;
  let time = 0;

  // Fills the whole canvas with a repeating texture, shifted by (offsetX, offsetY).
  function fillLayer(ctx, pattern, offsetX, offsetY, w, h) {
    ctx.save();
    ctx.translate(-offsetX, -offsetY);
    ctx.fillStyle = pattern;
    ctx.fillRect(offsetX, offsetY, w, h);
    ctx.restore();
  }

  // Draws the twinkle stars that are visible on screen.
  function drawTwinkles(ctx, offsetX, offsetY, w, h) {
    for (const star of twinkleStars) {
      // Mostly fully lit, briefly dimming now and then.
      const wave = Math.sin(time * star.speed + star.phase);
      const dim = Math.pow(Math.max(0, wave), 6) * TWINKLE_MAX_DIM;

      if (dim < 0.02) continue;

      ctx.fillStyle = `rgba(0,0,0,${dim.toFixed(3)})`;

      // The same star appears once in every visible tile copy.
      const startX = wrap(star.x - offsetX, TILE);
      const startY = wrap(star.y - offsetY, TILE);

      for (let x = startX; x < w; x += TILE) {
        for (let y = startY; y < h; y += TILE) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  return {
    // Returns false if the textures are not available.
    draw(ctx, ship, dt) {
      if (!ready(farImage) || !ready(nearImage)) return false;

      if (patternContext !== ctx) {
        farPattern = ctx.createPattern(farImage, 'repeat');
        nearPattern = ctx.createPattern(nearImage, 'repeat');
        patternContext = ctx;
      }

      time += dt;
      driftX = wrap(driftX + FAR_DRIFT_X * dt, TILE);
      driftY = wrap(driftY + FAR_DRIFT_Y * dt, TILE);

      // Draw in real canvas pixels: one texel = one pixel-canvas pixel,
      // so the texture scale is identical on every screen size.
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;

      // Offsets come from the rocket position, so speed and direction
      // changes are always smooth. Rounded to whole texels for crisp pixels.
      const farX = Math.round(wrap(ship.x * FAR_PARALLAX + driftX, TILE));
      const farY = Math.round(wrap(ship.y * FAR_PARALLAX + driftY, TILE));
      const nearX = Math.round(wrap(ship.x * NEAR_PARALLAX + driftX * 1.8, TILE));
      const nearY = Math.round(wrap(ship.y * NEAR_PARALLAX + driftY * 1.8, TILE));

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      ctx.globalAlpha = FAR_BRIGHTNESS;
      fillLayer(ctx, farPattern, farX, farY, w, h);

      ctx.globalAlpha = 1;
      fillLayer(ctx, nearPattern, nearX, nearY, w, h);
      drawTwinkles(ctx, nearX, nearY, w, h);

      ctx.restore();

      return true;
    }
  };
}
