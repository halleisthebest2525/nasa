import { drawShip, drawTravelDestination, drawWorld } from './renderer.js';

const smooth = x => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};
const mix = (a, b, t) => a + (b - a) * t;
const wrap = (x, size) => ((x % size) + size) % size;

// Integral of smoothstep: velocity and acceleration meet at phase boundaries.
const integral = x => x ** 3 - x ** 4 / 2;
export function travelProgress(time) {
  const t = Math.max(0, Math.min(7.5, time));
  if (t < 1) return integral(t) / 6.25;
  if (t < 6) return (0.5 + t - 1) / 6.25;
  const u = (t - 6) / 1.5;
  return (5.5 + 1.5 * (u - integral(u))) / 6.25;
}

// Owns presentation only. Inventory, surface state, stats and progress stay live.
export function createWarpTravel() {
  let trip = null;
  const stars = Array.from({ length: 140 }, (_, i) => ({
    x: ((i * 0.61803398875) % 1),
    y: ((i * 0.41421356237) % 1),
    depth: 0.3 + (i % 3) * 0.35
  }));

  return {
    isActive: () => trip !== null,
    start(options) {
      if (trip) return false;
      trip = { ...options, time: 0, ready: false };
      const current = trip;
      // Assets were fetched by loadAssets before gameplay. Decode once more
      // before arrival so a cold destination cannot interrupt the handoff.
      Promise.all(options.images.filter(Boolean).map(image =>
        image.decode ? image.decode().catch(() => {}) : Promise.resolve()
      )).then(() => { if (trip === current) current.ready = true; });
      return true;
    },
    update(dt) {
      if (!trip) return;
      const c = trip;
      c.time = Math.min(c.ready ? 7.5 : 6, c.time + Math.max(0, dt));
      const p = travelProgress(c.time);
      c.ship.x = mix(c.from.x, c.to.x, p);
      c.ship.y = mix(c.from.y, c.to.y, p);
      if (c.time >= 7.5) {
        trip = null;
        c.onComplete();
      }
    },
    draw(ctx, width, height, background, dt) {
      const c = trip;
      if (!c) return;
      const arrival = smooth((c.time - 6) / 1.5);
      const power = smooth(c.time) * (1 - arrival);
      const handoff = smooth((c.time - 7.3) / 0.2);
      const textured = background.draw(ctx, c.ship, dt);
      // Existing gameplay rendering fades in underneath the final approach.
      if (handoff > 0) {
        ctx.save();
        ctx.globalAlpha = handoff;
        drawWorld(ctx, c.world, { ...c.ship, ...c.to }, width, height, c.sprite, false, textured);
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = 1 - handoff;
      const distance = travelProgress(c.time) * 12000;
      const dx = Math.cos(c.ship.angle), dy = Math.sin(c.ship.angle);
      if (c.departure && c.time < 1) {
        const leaving = smooth(c.time);
        const { id, body } = c.departure;
        ctx.save();
        ctx.globalAlpha *= 1 - leaving;
        ctx.translate(Math.round(width / 2 + body.x - c.from.x - dx * leaving * width),
          Math.round(height / 2 + body.y - c.from.y - dy * leaving * height));
        const scale = 1 - leaving * 0.85;
        ctx.scale(scale, scale);
        drawTravelDestination(ctx, id, 0, 0, body.radius);
        ctx.restore();
      }
      // Distant planets drift slowly behind the faster foreground stars.
      // These are existing backdrop sprites, never new surface maps.
      for (const [i, image] of c.scenery.entries()) {
        if (!image?.naturalWidth) continue;
        const x = wrap(width * (0.65 + i * 0.37) - dx * distance * 0.045, width + 240) - 120;
        const y = wrap(height * (0.3 + i * 0.41) - dy * distance * 0.045, height + 240) - 120;
        const size = 70 + i * 24;
        const scale = size / Math.max(image.naturalWidth, image.naturalHeight);
        ctx.save();
        ctx.globalAlpha *= 0.22 * smooth(c.time) * (1 - arrival);
        ctx.drawImage(image, Math.round(x), Math.round(y),
          Math.round(image.naturalWidth * scale), Math.round(image.naturalHeight * scale));
        ctx.restore();
      }
      for (const star of stars) {
        const x = wrap(star.x * width - dx * distance * star.depth, width);
        const y = wrap(star.y * height - dy * distance * star.depth, height);
        ctx.fillStyle = star.depth > 0.8 ? '#b5ccd8' : '#526475';
        const size = star.depth > 0.8 ? 2 : 1;
        ctx.fillRect(Math.round(x), Math.round(y), size, size);
      }
      if (c.time >= 6) {
        const body = c.world[c.id];
        const far = Math.max(width, height) * 0.4;
        const x = mix(width / 2 + dx * far, width / 2 + body.x - c.to.x, arrival);
        const y = mix(height / 2 + dy * far, height / 2 + body.y - c.to.y, arrival);
        ctx.save();
        ctx.globalAlpha *= smooth((c.time - 6) / 0.3);
        ctx.translate(Math.round(x), Math.round(y));
        const scale = mix(3 / body.radius, 1, arrival);
        ctx.scale(scale, scale);
        drawTravelDestination(ctx, c.id, 0, 0, body.radius);
        ctx.restore();
      }
      // Camera eases into a small lead, then returns to the gameplay center.
      ctx.save();
      ctx.translate(-dx * 18 * power, -dy * 18 * power);
      drawShip(ctx, { angle: c.ship.angle, speed: 0, enginePower: power }, width, height, c.sprite);
      ctx.restore();
      ctx.restore();
      const bars = 20 * smooth(c.time / 0.4) * (1 - handoff);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, bars);
      ctx.fillRect(0, height - bars, width, bars);
    }
  };
}
