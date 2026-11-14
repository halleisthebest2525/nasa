export const CONFIG = {
  // Space is 44000 x 44000 (edges at ±22000), big enough for Mars.
  worldSize: 44000,
  starCount: 700,
  // Same asteroid density as before (140 in the old 30000 space).
  asteroidCount: 300,
  ship: {
    acceleration: 170,
    reverse: 90,
    maxSpeed: 120,
    boostSpeed: 180,
    turnSpeed: 3.2
    // No drag: there is no air resistance in space.
  }
};