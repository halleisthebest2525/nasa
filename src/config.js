export const CONFIG = {
  // Space is 100000 x 100000 (edges at ±50000): room for the Asteroid Belt,
  // Europa and Titan. Random asteroids stay in the inner ±22000.
  worldSize: 100000,
  starCount: 700,
  // More frequent encounters throughout the inner system, retaining the
  // existing clear areas around Earth and the planetary landing zones.
  asteroidCount: 1800,
  // Denser loose asteroids on the Europa–Titan–Umbriel travel routes.
  outerAsteroidCount: 1000,
  ship: {
    acceleration: 170,
    reverse: 90,
    maxSpeed: 120,
    boostSpeed: 180,
    turnSpeed: 3.2
    // No drag: there is no air resistance in space.
  }
};
