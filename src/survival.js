
export class Survival {
  constructor() {
    this.fuel = 100;
    this.shipOxygen = 100;
    this.oxygen = 100;
    this.health = 100;
    this.stamina = 100;

    this.detectorOn = false;
    this.detectorFlash = 0;
    this.detectorLit = false;
  }

  updateFuel(dt, moving, boosting) {
    if (!moving || this.fuel <= 0) return;

    const drain = boosting ? 0.60 : 0.20;
    this.fuel = Math.max(0, this.fuel - drain * dt);
  }

  updateMoon(dt, running) {
    this.oxygen = Math.max(0, this.oxygen - 0.35 * dt);

    if (this.oxygen <= 0) {
      this.health = Math.max(0, this.health - 0.8 * dt);
    }

    if (running && this.stamina > 0) {
      this.stamina = Math.max(0, this.stamina - 28 * dt);
    } else {
      this.stamina = Math.min(100, this.stamina + 8 * dt);
    }
  }

  updateStamina(dt, running) {
    if (running && this.stamina > 0) {
      this.stamina = Math.max(0, this.stamina - 28 * dt);
    } else {
      this.stamina = Math.min(100, this.stamina + 8 * dt);
    }
  }

  refillSuit() {
    const amount = Math.min(100 - this.oxygen, this.shipOxygen);
    this.oxygen += amount;
    this.shipOxygen -= amount;
    return amount;
  }

  buyFuel(scraps) {
    if (scraps.credits < 30 || this.fuel >= 100) return false;
    scraps.credits -= 30;
    this.fuel = Math.min(100, this.fuel + 20);
    return true;
  }

  buyOxygen(scraps) {
    if (scraps.credits < 30 || this.shipOxygen >= 100) return false;
    scraps.credits -= 30;
    this.shipOxygen = Math.min(100, this.shipOxygen + 20);
    return true;
  }

  updateDetector(dt, distance) {
    if (!this.detectorOn || distance === null) {
      this.detectorLit = false;
      return;
    }

    const closeness = Math.max(0, 1 - distance / 1800);
    const interval = 1.4 - closeness * 1.25;

    this.detectorFlash += dt;

    if (this.detectorFlash >= interval) {
      this.detectorFlash = 0;
      this.detectorLit = !this.detectorLit;
    }
  }
}
