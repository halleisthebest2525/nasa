import { CONFIG } from './config.js';
import { random } from './math.js';

// The old inner system (Earth, Moon, Mars) is ±22000. Random asteroids
// stay inside it; the outer system has the Asteroid Belt instead.
const INNER_HALF = 22000;

// ASTEROID BELT: a ring around the inner system, between Mars and Europa.
// 3500 wide = roughly 20-30 seconds of careful flying.
export const BELT = {
  inner: 26500,
  outer: 30000,
  cell: 215,      // one rock per cell (smaller = denser = harder)
  fill: 0.88      // chance a cell has a rock
};

// Small seeded random generator: the belt is identical every time,
// so it does not need to be stored in save files.
function seeded(seed) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createBelt() {
  const rand = seeded(20261114);
  const rocks = [];
  const steps = Math.ceil(BELT.outer / BELT.cell);

  for (let gy = -steps; gy <= steps; gy++) {
    for (let gx = -steps; gx <= steps; gx++) {
      // Always draw the same random numbers per cell (stable layout).
      const jitterX = rand();
      const jitterY = rand();
      const keep = rand();
      const sizeRoll = rand();
      const spriteRoll = rand();
      const rotation = rand() * Math.PI * 2;
      const spin = (rand() - 0.5) * 0.5;

      const x = (gx + 0.15 + jitterX * 0.7) * BELT.cell;
      const y = (gy + 0.15 + jitterY * 0.7) * BELT.cell;
      const distance = Math.hypot(x, y);

      if (distance < BELT.inner || distance > BELT.outer || keep > BELT.fill) continue;

      // Thinner at the edges, thickest in the middle of the belt.
      const middle = 1 - Math.abs((distance - BELT.inner) / (BELT.outer - BELT.inner) - 0.5) * 2;
      if (keep > BELT.fill * (0.45 + middle * 0.55)) continue;

      rocks.push({
        id: `belt${rocks.length}`,
        x,
        y,
        size: Math.floor(48 + sizeRoll * 72),   // 48 - 120
        sprite: Math.floor(spriteRoll * 16),    // one of the 16 asteroid sprites
        rotation,
        spin
      });
    }
  }

  return rocks;
}

export class World {
  constructor() {
    const half = INNER_HALF;

    this.stars = Array.from(
      { length: CONFIG.starCount },
      () => ({
        x: random(-half, half),
        y: random(-half, half),
        size: Math.floor(random(1, 4)),
        brightness: random(0.25, 0.8)
      })
    );

    // Earth: the launch site, just below the starting position.
    this.earth = {
      x: 0,
      y: 200,
      radius: 140,
      name: 'EARTH'
    };

    // Keep asteroids out of the launch area around Earth and the start.
    const SAFE_RADIUS = 900;

    const randomAsteroidPosition = () => {
      let x;
      let y;

      do {
        x = random(-half, half);
        y = random(-half, half);
      } while (Math.hypot(x, y) < SAFE_RADIUS);

      return { x, y };
    };

    this.asteroids = Array.from(
      { length: CONFIG.asteroidCount },
      (_, id) => ({
        id,
        ...randomAsteroidPosition(),
        size: Math.floor(random(24, 65)),
        rotation: random(0, Math.PI * 2),
        shade: Math.floor(random(0, 3))
      })
    );

    // Mars: far away in the top-left (about 2x the Moon's distance).
    // ~3 minutes at normal speed from Earth. Landing needs the Mars star map.
    this.mars = {
      x: -18000,
      y: -16500,
      radius: 105,
      name: 'MARS'
    };

    // Keep asteroids away from Mars' landing area too.
    for (const asteroid of this.asteroids) {
      while (Math.hypot(asteroid.x - this.mars.x, asteroid.y - this.mars.y) < 700) {
        asteroid.x = random(-half, half);
        asteroid.y = random(-half, half);
      }
    }

    // The Moon: a fixed destination far from the starting point.
    this.moon = {
      x: 11000,
      y: -8500,
      radius: 95,
      name: 'THE MOON'
    };

    // The Asteroid Belt (between Mars and Europa).
    this.belt = createBelt();

    // EUROPA: moon of Jupiter, past the Asteroid Belt (further top-left
    // than Mars). Needs the Europa star map from the Mars chest.
    this.europa = {
      x: -27000,
      y: -24000,
      radius: 150,
      name: 'EUROPA'
    };

    // Jupiter: a huge backdrop behind Europa (not landable, drawn with
    // parallax so it feels far away).
    this.jupiter = {
      x: this.europa.x - 900,
      y: this.europa.y - 650,
      radius: 420
    };

    // TITAN: moon of Saturn, far in the outer system (bottom-left).
    // Needs the Titan star map from the Europa chest.
    this.titan = {
      x: -30000,
      y: 34000,
      radius: 170,
      name: 'TITAN'
    };

    // Which hidden destinations are on the map (set by main.js from the
    // star maps the player has found).
    this.discovered = {};
  }
}
