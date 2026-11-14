
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

    if (isDown('a', 'arrowleft')) this.angle -= c.turnSpeed * dt;
    if (isDown('d', 'arrowright')) this.angle += c.turnSpeed * dt;

    if (!fuelAvailable) {
      this.vx = 0;
      this.vy = 0;
      this.boosting = false;
      return;
    }

    const forward = isDown('w', 'arrowup');
    const reverse = isDown('s', 'arrowdown');

    this.boosting = forward && isDown('shift');

    const accelerationMultiplier =
      modules.accelerationMultiplier || 1;

    const speedMultiplier =
      modules.maxSpeedMultiplier || 1;

    const power = this.boosting
      ? c.acceleration * 1.65 * accelerationMultiplier
      : c.acceleration * accelerationMultiplier;

    if (forward) {
      this.vx += Math.cos(this.angle) * power * dt;
      this.vy += Math.sin(this.angle) * power * dt;
    }

    if (reverse) {
      this.vx -= Math.cos(this.angle) * c.reverse * dt;
      this.vy -= Math.sin(this.angle) * c.reverse * dt;
    }

    if (isDown(' ')) {
      this.vx *= Math.pow(0.04, dt);
      this.vy *= Math.pow(0.04, dt);
    } else {
      this.vx *= Math.pow(c.drag, dt * 60);
      this.vy *= Math.pow(c.drag, dt * 60);
    }

    const max = (
      this.boosting ? c.boostSpeed : c.maxSpeed
    ) * speedMultiplier;

    const speed = Math.hypot(this.vx, this.vy);

    if (speed > max) {
      this.vx = this.vx / speed * max;
      this.vy = this.vy / speed * max;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.x = clamp(this.x, -CONFIG.worldSize / 2, CONFIG.worldSize / 2);
    this.y = clamp(this.y, -CONFIG.worldSize / 2, CONFIG.worldSize / 2);
  }

  get speed() {
    return Math.round(Math.hypot(this.vx, this.vy));
  }
}
