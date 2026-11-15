export const CONFIG = {
  // Space is 100000 x 100000 (edges at ±50000): room for the Asteroid Belt,
  // Europa and Titan. Random asteroids stay in the inner ±22000.
  worldSize: 100000,
  starCount: 700,
  // Same asteroid density as before (140 in the old 30000 space).
  // Random asteroids in the inner system (Earth, Moon, Mars).
  asteroidCount: 520,
  // Random asteroids past the Asteroid Belt (around Europa and Titan).
  outerAsteroidCount: 260,
  ship: {
    acceleration: 170,
    reverse: 90,
    maxSpeed: 120,
    boostSpeed: 180,
    turnSpeed: 3.2
    // No drag: there is no air resistance in space.
  }
};