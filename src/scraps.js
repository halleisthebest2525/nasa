// ==========================================
// SCRAPS
// Scraps are the game's money. Walking over a scrap collects it and adds
// its value to the balance straight away (this.credits).
//
// Scraps keep appearing: every few seconds a new one spawns somewhere on
// the planet (never next to the player or the ship), up to a maximum.
// Each planet has its own settings in planets.js ("scrap").
// ==========================================

const SURFACE_RADIUS = 4800;
const SHIP_CLEAR_RADIUS = 160;   // no scrap right on top of the landed ship
const SPAWN_ANIMATION = 0.45;    // seconds a new scrap takes to "pop" in
const POPUP_TIME = 0.9;          // "+10" floats this long after a pickup

// Used when a planet has no "scrap" settings of its own.
const DEFAULT_SCRAP = {
  start: 18,               // scraps lying around when you arrive
  maxActive: 30,           // most scraps on the planet at one time
  interval: [5, 11],       // a new one every 5-11 seconds
  minPlayerDistance: 320,  // never spawns closer to the player than this
  valueMultiplier: 1,      // scrap is worth more on later planets
  common: 68, rare: 25, epic: 7
};
const PICKUP_DISTANCE = 42;

const RARITIES = {
  common: { label: 'COMMON', color: '#b8b9ae', weight: 68, price: 10 },
  rare: { label: 'RARE', color: '#71b9e8', weight: 25, price: 25 },
  epic: { label: 'EPIC', color: '#c18aff', weight: 7, price: 75 }
};

export class ScrapSystem {
  constructor(assets = {}) {
    this.assets = assets;
    this.items = [];
    this.inventory = [];
    this.inventoryOpen = false;
    // Extra inventory sections added by other systems (ship config, stats).
    this.inventorySections = [];
    this.pickupMessage = '';
    this.pickupTimer = 0;
    this.credits = 0;                             // the SCRAPS balance
    this.found = { common: 0, rare: 0, epic: 0 }; // lifetime pickups (stats)
    this.popups = [];                             // floating "+10" texts
    this.planet = null;
    this.spawnTimer = 3;
    this.nextId = 1;
    this.clock = 0;
    this.onCollect = null;                        // set by main.js (sound)
    this.generate();
  }

  // Settings for the current planet (falls back to the defaults).
  settings() {
    return { ...DEFAULT_SCRAP, ...(this.planet?.scrap || {}) };
  }

  setPlanet(planet) {
    this.planet = planet;
  }

  rollRarity() {
    const s = this.settings();
    const roll = Math.random() * (s.common + s.rare + s.epic);

    if (roll < s.common) return 'common';
    return roll < s.common + s.rare ? 'rare' : 'epic';
  }

  // Makes one scrap. Position is random but always valid: on the surface,
  // away from the ship, and at least minPlayerDistance from the player.
  spawnOne(playerX = null, playerY = null, rarity = null, x = null, y = null) {
    const s = this.settings();
    const radius = this.planet?.radius || SURFACE_RADIUS;

    if (x === null) {
      let ok = false;

      for (let tries = 0; tries < 40 && !ok; tries++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.sqrt(Math.random()) * radius * 0.88;

        x = Math.cos(angle) * distance;
        y = Math.sin(angle) * distance;

        ok =
          Math.hypot(x, y) >= SHIP_CLEAR_RADIUS &&
          (playerX === null || Math.hypot(x - playerX, y - playerY) >= s.minPlayerDistance);
      }

      if (!ok) return null;   // no valid spot this time; try again later
    } else {
      // Dropped at a given spot (a defeated monster): keep it on the surface.
      const distance = Math.hypot(x, y);
      const limit = radius * 0.94;

      if (distance > limit) {
        x = x / distance * limit;
        y = y / distance * limit;
      }
    }

    const kind = rarity || this.rollRarity();

    const item = {
      id: this.nextId++,
      x,
      y,
      rarity: kind,
      value: Math.round(RARITIES[kind].price * s.valueMultiplier),
      rotation: Math.random() * Math.PI * 2,
      size: 13 + Math.random() * 5,
      age: 0,
      collected: false
    };

    this.items.push(item);
    return item;
  }

  // A defeated monster drops scrap where it fell.
  dropAt(x, y, rarity = null, count = 1) {
    for (let i = 0; i < count; i++) {
      const spread = count > 1 ? 46 : 0;

      this.spawnOne(
        null, null, rarity,
        x + (Math.random() - 0.5) * spread * 2,
        y + (Math.random() - 0.5) * spread * 2
      );
    }
  }

  // planet = settings from planets.js (count, rarity mix, size).
  generate(planet = null) {
    if (planet) this.planet = planet;

    const count = this.settings().start;

    for (let i = 0; i < count; i++) {
      const item = this.spawnOne();
      if (item) item.age = SPAWN_ANIMATION;   // already there, no pop-in
    }
  }

  // Replace all scrap on the surface with a fresh starting batch.
  respawn(planet = null) {
    this.items = [];
    this.generate(planet);
  }

  toggleInventory() {
    this.inventoryOpen = !this.inventoryOpen;
  }

  closeInventory() {
    this.inventoryOpen = false;
  }

  // Finds the closest scrap that has not been collected.
  getNearestUncollected(x, y) {
    let nearest = null;
    let nearestDistance = Infinity;

    for (const item of this.items) {
      if (item.collected) continue;

      const distance = Math.hypot(
        item.x - x,
        item.y - y
      );

      if (distance < nearestDistance) {
        nearest = item;
        nearestDistance = distance;
      }
    }

    return nearest
      ? { item: nearest, distance: nearestDistance }
      : null;
  }

  // Older saves kept scrap in an inventory until it was sold. Scrap now
  // counts straight away, so pay out anything still waiting there.
  cashInInventory() {
    if (!Array.isArray(this.inventory) || !this.inventory.length) {
      this.inventory = [];
      return 0;
    }

    return this.sellAll().earnings;
  }

  sellAll() {
    let earnings = 0;

    for (const item of this.inventory) {
      earnings += RARITIES[item.rarity].price;
    }

    const soldCount = this.inventory.length;

    this.inventory = [];
    this.credits += earnings;

    return { earnings, soldCount };
  }

  getInventoryCounts() {
    return {
      common: this.found?.common || 0,
      rare: this.found?.rare || 0,
      epic: this.found?.epic || 0
    };
  }

  getInventoryValue() {
    return this.inventory.reduce(
      (total, item) => total + RARITIES[item.rarity].price,
      0
    );
  }

  update(playerX, playerY, dt) {
    this.pickupTimer = Math.max(0, this.pickupTimer - dt);
    this.clock += dt;

    for (const popup of this.popups) popup.time -= dt;
    this.popups = this.popups.filter(popup => popup.time > 0);

    if (this.inventoryOpen) return;

    const settings = this.settings();

    // CONTINUOUS SPAWNING: a new scrap every few seconds, up to the maximum.
    this.spawnTimer -= dt;

    if (this.spawnTimer <= 0) {
      const [shortest, longest] = settings.interval;
      this.spawnTimer = shortest + Math.random() * (longest - shortest);

      if (this.items.length < settings.maxActive) {
        this.spawnOne(playerX, playerY);
      }
    }

    // COLLECTING: touch a scrap to pick it up. It is removed from the list
    // in the same step, so it can never be collected twice.
    let collectedAny = false;

    for (const item of this.items) {
      item.age = (item.age ?? SPAWN_ANIMATION) + dt;

      if (item.collected) continue;

      if (
        Math.hypot(item.x - playerX, item.y - playerY) <= PICKUP_DISTANCE
      ) {
        item.collected = true;
        collectedAny = true;

        const value = item.value ?? RARITIES[item.rarity].price;

        this.credits += value;   // the balance updates immediately
        this.found[item.rarity] = (this.found[item.rarity] || 0) + 1;

        this.popups.push({
          x: item.x,
          y: item.y,
          text: `+${value}`,
          color: RARITIES[item.rarity].color,
          time: POPUP_TIME
        });

        this.pickupMessage = `${RARITIES[item.rarity].label} SCRAP · +${value} · TOTAL ${this.credits}`;
        this.pickupTimer = 2.2;

        if (this.onCollect) this.onCollect(item, value);
      }
    }

    if (collectedAny) this.items = this.items.filter(item => !item.collected);
  }

  drawWorld(ctx, cameraX, cameraY, width, height) {
    for (const item of this.items) {
      if (item.collected) continue;

      const x = cameraX + item.x;
      const y = cameraY + item.y;

      if (x < -35 || y < -35 || x > width + 35 || y > height + 35) {
        continue;
      }

      // New scraps pop in (grow from nothing, with a small overshoot).
      const grow = Math.min(1, (item.age ?? SPAWN_ANIMATION) / SPAWN_ANIMATION);
      const scale = grow < 1 ? grow * (1.35 - 0.35 * grow) : 1;

      this.drawItem(ctx, item, x, y, scale);

      // A glint now and then, so scrap is easy to spot.
      if (Math.floor(this.clock * 2 + item.id * 0.7) % 5 === 0) {
        const gx = Math.round(x + item.size * 0.4);
        const gy = Math.round(y - item.size * 0.7);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(gx, gy, 2, 6);
        ctx.fillRect(gx - 2, gy + 2, 6, 2);
      }
    }

    // Pickup animation: a ring bursts outward and "+value" floats up.
    for (const popup of this.popups) {
      const x = cameraX + popup.x;
      const y = cameraY + popup.y;
      const progress = 1 - popup.time / POPUP_TIME;

      ctx.save();
      ctx.globalAlpha = Math.min(1, popup.time * 2.5);

      ctx.strokeStyle = popup.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 8 + progress * 26, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#fff3c4';
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3 + 0.4;
        const reach = 10 + progress * 34;
        ctx.fillRect(Math.round(x + Math.cos(angle) * reach), Math.round(y + Math.sin(angle) * reach), 2, 2);
      }

      ctx.textAlign = 'center';
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = '#000';
      ctx.fillText(popup.text, x + 1, y - 14 - progress * 30 + 1);
      ctx.fillStyle = '#ffe9a0';
      ctx.fillText(popup.text, x, y - 14 - progress * 30);
      ctx.restore();
    }
  }

  drawItem(ctx, item, x, y, scale = 1) {
    const image = this.assets[`scrap_${item.rarity}`];

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(item.rotation);

    if (image && image.complete && image.naturalWidth > 0) {
      ctx.drawImage(
        image,
        -item.size * scale,
        -item.size * scale,
        item.size * 2 * scale,
        item.size * 2 * scale
      );
    } else {
      const size = item.size * scale;
      const color = RARITIES[item.rarity].color;

      ctx.shadowColor = color;
      ctx.shadowBlur = item.rarity === 'epic' ? 13 : 7;

      if (item.rarity === 'common') {
        ctx.fillStyle = '#777d78';
        ctx.fillRect(-size * 0.75, -size * 0.45, size * 1.5, size * 0.9);
        ctx.fillStyle = '#c2c4b9';
        ctx.fillRect(-size * 0.35, -size * 0.7, size * 0.65, size * 0.35);
        ctx.strokeStyle = '#414843';
        ctx.lineWidth = 1.5 * scale;
        ctx.strokeRect(-size * 0.75, -size * 0.45, size * 1.5, size * 0.9);
      } else if (item.rarity === 'rare') {
        ctx.fillStyle = '#4d91b7';
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size * 0.75, -size * 0.15);
        ctx.lineTo(size * 0.4, size * 0.8);
        ctx.lineTo(-size * 0.55, size * 0.55);
        ctx.lineTo(-size * 0.8, -size * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#b9e7ff';
        ctx.lineWidth = 1.5 * scale;
        ctx.stroke();
      } else {
        ctx.fillStyle = '#8d5dbb';
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size * 0.85, -size * 0.25);
        ctx.lineTo(size * 0.55, size * 0.75);
        ctx.lineTo(-size * 0.55, size * 0.75);
        ctx.lineTo(-size * 0.85, -size * 0.25);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#f0d3ff';
        ctx.lineWidth = 2 * scale;
        ctx.stroke();
        ctx.fillStyle = '#f5d58c';
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // Scrap locations are deliberately hidden from the map.
  drawMap() {}

  drawPickupMessage(ctx, width) {
    if (this.pickupTimer <= 0) return;

    ctx.save();
    ctx.globalAlpha = Math.min(1, this.pickupTimer);
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#d5dfb4';
    // Below the SHIP TIME / HULL INTEGRITY boxes (they end at ~147px).
    ctx.fillText(this.pickupMessage, width / 2, 178);
    ctx.restore();
  }

  drawInventory(ctx, width, height) {
    if (!this.inventoryOpen) return;

    // Other systems (ship modules, stats) add sections below the scrap rows:
    // this.inventorySections = [{ height, draw(ctx, x, y, w) }, ...]
    const sections = this.inventorySections || [];
    const SECTION_GAP = 14;
    const SECTIONS_TOP = 236;

    const sectionsHeight = sections.reduce(
      (total, section) => total + section.height + SECTION_GAP,
      0
    );

    const panelWidth = Math.min(620, width - 36);
    const panelHeight = SECTIONS_TOP + sectionsHeight + 30;
    const x = (width - panelWidth) / 2;
    // Keep the panel below the clock / hull boxes at the top when it fits.
    const topClear = 155;
    const y = height - panelHeight >= topClear + 10
      ? Math.max(topClear, (height - panelHeight) / 2)
      : Math.max(10, (height - panelHeight) / 2);
    const counts = this.getInventoryCounts();

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#151a18';
    ctx.fillRect(x, y, panelWidth, panelHeight);
    ctx.strokeStyle = '#89917b';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, panelWidth, panelHeight);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#d5dfb4';
    ctx.font = 'bold 21px monospace';
    ctx.fillText('INVENTORY', x + 28, y + 42);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#e0c78e';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`${this.credits} SCRAPS`, x + panelWidth - 28, y + 40);

    const rows = [
      ['common', 'COMMON SCRAP FOUND'],
      ['rare', 'RARE SCRAP FOUND'],
      ['epic', 'EPIC SCRAP FOUND']
    ];

    rows.forEach(([rarity, label], index) => {
      const rowY = y + 80 + index * 46;
      const color = RARITIES[rarity].color;

      ctx.fillStyle = '#222a26';
      ctx.fillRect(x + 25, rowY - 17, panelWidth - 50, 38);
      ctx.strokeStyle = '#424b43';
      ctx.strokeRect(x + 25, rowY - 17, panelWidth - 50, 38);

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + 50, rowY + 2, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.fillStyle = color;
      ctx.font = 'bold 13px monospace';
      ctx.fillText(label, x + 72, rowY + 7);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#e0e1d8';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(`x ${counts[rarity]}`, x + panelWidth - 45, rowY + 8);
    });

    ctx.textAlign = 'right';
    ctx.fillStyle = '#e0c78e';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(
      'SCRAP ADDS TO YOUR BALANCE WHEN PICKED UP · K = MARTIAL ARTS',
      x + panelWidth - 28,
      y + 214
    );

    let sectionY = y + SECTIONS_TOP;

    for (const section of sections) {
      ctx.save();
      section.draw(ctx, x, sectionY, panelWidth);
      ctx.restore();

      sectionY += section.height + SECTION_GAP;
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#858b7e';
    ctx.font = '11px monospace';
    ctx.fillText('PRESS B OR ESC TO CLOSE', width / 2, y + panelHeight - 14);

    ctx.restore();
  }
}
