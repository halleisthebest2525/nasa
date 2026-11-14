
const SURFACE_RADIUS = 4800;
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
    this.pickupMessage = '';
    this.pickupTimer = 0;
    this.credits = 0;
    this.generate();
  }

  generate() {
    const count = 20 + Math.floor(Math.random() * 11);
    const rarityPool = [
      ...Array(68).fill('common'),
      ...Array(25).fill('rare'),
      ...Array(7).fill('epic')
    ];

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * SURFACE_RADIUS * 0.88;
      const rarity = rarityPool[Math.floor(Math.random() * rarityPool.length)];

      this.items.push({
        id: i + 1,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        rarity,
        rotation: Math.random() * Math.PI * 2,
        size: 13 + Math.random() * 5,
        collected: false
      });
    }
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
      common: this.inventory.filter(item => item.rarity === 'common').length,
      rare: this.inventory.filter(item => item.rarity === 'rare').length,
      epic: this.inventory.filter(item => item.rarity === 'epic').length
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

    if (this.inventoryOpen) return;

    for (const item of this.items) {
      if (item.collected) continue;

      if (
        Math.hypot(item.x - playerX, item.y - playerY) <= PICKUP_DISTANCE
      ) {
        item.collected = true;

        this.inventory.push({
          id: item.id,
          rarity: item.rarity
        });

        this.pickupMessage = `${RARITIES[item.rarity].label} SCRAP COLLECTED`;
        this.pickupTimer = 2.2;
      }
    }
  }

  drawWorld(ctx, cameraX, cameraY, width, height) {
    for (const item of this.items) {
      if (item.collected) continue;

      const x = cameraX + item.x;
      const y = cameraY + item.y;

      if (x < -35 || y < -35 || x > width + 35 || y > height + 35) {
        continue;
      }

      this.drawItem(ctx, item, x, y);
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
    ctx.fillText(this.pickupMessage, width / 2, 42);
    ctx.restore();
  }

  drawInventory(ctx, width, height) {
    if (!this.inventoryOpen) return;

    const panelWidth = Math.min(520, width - 36);
    const panelHeight = 390;
    const x = (width - panelWidth) / 2;
    const y = (height - panelHeight) / 2;
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
    ctx.fillText('SCRAP INVENTORY', x + 28, y + 42);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#e0c78e';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`${this.credits} CREDITS`, x + panelWidth - 28, y + 40);

    const rows = [
      ['common', 'COMMON SCRAP'],
      ['rare', 'RARE SCRAP'],
      ['epic', 'EPIC SCRAP']
    ];

    rows.forEach(([rarity, label], index) => {
      const rowY = y + 90 + index * 76;
      const color = RARITIES[rarity].color;

      ctx.fillStyle = '#222a26';
      ctx.fillRect(x + 25, rowY - 25, panelWidth - 50, 58);
      ctx.strokeStyle = '#424b43';
      ctx.strokeRect(x + 25, rowY - 25, panelWidth - 50, 58);

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + 53, rowY + 4, 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.fillStyle = color;
      ctx.font = 'bold 13px monospace';
      ctx.fillText(label, x + 78, rowY + 9);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#e0e1d8';
      ctx.font = 'bold 17px monospace';
      ctx.fillText(`x ${counts[rarity]}`, x + panelWidth - 48, rowY + 10);
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e0c78e';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(
      `ESTIMATED SELL VALUE: ${this.getInventoryValue()} CREDITS`,
      width / 2,
      y + panelHeight - 45
    );

    ctx.fillStyle = '#858b7e';
    ctx.font = '11px monospace';
    ctx.fillText('PRESS B OR ESC TO CLOSE', width / 2, y + panelHeight - 20);

    ctx.restore();
  }
}
