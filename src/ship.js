
import { CONFIG } from './config.js';
import { clamp } from './math.js';
import { isDown } from './input.js';

export class Ship {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.angle = -Math.PI / 2;
    this.boosting = false;
  }

  update(dt, fuelAvailable = true, modules = {}) {
    const c = CONFIG.ship;

    // Arrow keys and WASD.
    if (isDown('arrowleft', 'a')) this.angle -= c.turnSpeed * dt;
    if (isDown('arrowright', 'd')) this.angle += c.turnSpeed * dt;

    if (!fuelAvailable) {
      this.vx = 0;
      this.vy = 0;
      this.boosting = false;
      return;
    }

    const forward = isDown('arrowup', 'w');
    const reverse = isDown('arrowdown', 's');

    this.boosting = forward && isDown('shift');

    const accelerationMultiplier =
      modules.accelerationMultiplier || 1;

    const speedMultiplier =
      modules.maxSpeedMultiplier || 1;

    const power = this.boosting
      ? c.acceleration * 1.65 * accelerationMultiplier
      : c.acceleration * accelerationMultiplier;

    const speedBefore = Math.hypot(this.vx, this.vy);

    if (forward) {
      this.vx += Math.cos(this.angle) * power * dt;
      this.vy += Math.sin(this.angle) * power * dt;
    }

    if (reverse) {
      this.vx -= Math.cos(this.angle) * c.reverse * dt;
      this.vy -= Math.sin(this.angle) * c.reverse * dt;
    }

    // SPACE = retro thrusters (brake). Otherwise there is NO air
    // resistance in space: the ship keeps drifting at the same speed.
    if (isDown(' ')) {
      this.vx *= Math.pow(0.04, dt);
      this.vy *= Math.pow(0.04, dt);
    }

    // The engine can only push the ship up to its top speed
    // (higher while boosting). Thrust never adds speed above that,
    // but the ship keeps any speed it already has (momentum).
    const engineMax = (
      this.boosting ? c.boostSpeed : c.maxSpeed
    ) * speedMultiplier;

    const absoluteMax = c.boostSpeed * speedMultiplier;

    const speed = Math.hypot(this.vx, this.vy);

    if (speed > engineMax && speed > speedBefore) {
      const limit = Math.min(absoluteMax, Math.max(engineMax, speedBefore));

      this.vx = this.vx / speed * limit;
      this.vy = this.vy / speed * limit;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // World edge: stop the movement that pushes into the edge.
    const half = CONFIG.worldSize / 2;

    if (Math.abs(this.x) > half) this.vx = 0;
    if (Math.abs(this.y) > half) this.vy = 0;

    this.x = clamp(this.x, -half, half);
    this.y = clamp(this.y, -half, half);
  }

  get speed() {
    return Math.round(Math.hypot(this.vx, this.vy));
  }
}
