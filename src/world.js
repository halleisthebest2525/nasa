import { CONFIG } from './config.js';
import { random } from './math.js';

export class World {
  constructor() {
    const half = CONFIG.worldSize / 2;

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

    // The Moon: a fixed destination far from the starting point.
    this.moon = {
      x: 11000,
      y: -8500,
      radius: 95,
      name: 'THE MOON'
    };
  }
}