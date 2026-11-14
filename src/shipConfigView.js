// ==========================================
// SHIP CONFIGURATION (inside the B inventory)
// A live view of the REAL ship: the miniature uses the exact sprite the
// game is drawing the ship with, and each slot reads the installed part
// from the parts system every frame. Nothing here is a separate copy.
// ==========================================

const CARD_WIDTH = 196;
const CARD_HEIGHT = 50;
const CARD_GAP = 10;
const TITLE_HEIGHT = 22;
const SHIP_BOX = { width: 150, height: 112 };
const PULSE_SECONDS = 1.2; // highlight when a slot's part changes

// game = {
//   assets,
//   getSlots(),       partsSystem.getSlotInfo()
//   getShipSprite(),  the image main.js draws the real ship with
//   getShipRarity(),  partsSystem.getStats().shipRarity
// }
export function createShipConfigSection(game) {
  // Remembers each slot's rarity, to flash the card when it changes.
  const lastRarity = {};
  const pulseUntil = {};

  function drawImageFit(ctx, image, centerX, centerY, maxW, maxH) {
    if (!image || !image.complete || image.naturalWidth === 0) return false;

    const scale = Math.min(maxW / image.naturalWidth, maxH / image.naturalHeight);
    const w = Math.round(image.naturalWidth * scale);
    const h = Math.round(image.naturalHeight * scale);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, Math.round(centerX - w / 2), Math.round(centerY - h / 2), w, h);
    return true;
  }

  function drawCard(ctx, slot, x, y, now) {
    // Flash briefly when the installed part changes.
    if (lastRarity[slot.type] !== undefined && lastRarity[slot.type] !== slot.rarity) {
      pulseUntil[slot.type] = now + PULSE_SECONDS * 1000;
    }
    lastRarity[slot.type] = slot.rarity;

    const pulse = Math.max(0, ((pulseUntil[slot.type] || 0) - now) / (PULSE_SECONDS * 1000));

    ctx.fillStyle = '#222a26';
    ctx.fillRect(x, y, CARD_WIDTH, CARD_HEIGHT);

    ctx.strokeStyle = slot.rarity === 'base' ? '#424b43' : slot.color;
    ctx.globalAlpha = 0.55 + pulse * 0.45;
    ctx.lineWidth = 1 + pulse * 2;
    ctx.strokeRect(x + 0.5, y + 0.5, CARD_WIDTH - 1, CARD_HEIGHT - 1);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;

    if (pulse > 0) {
      ctx.fillStyle = `rgba(255, 255, 230, ${0.12 * pulse})`;
      ctx.fillRect(x, y, CARD_WIDTH, CARD_HEIGHT);
    }

    // Original part sprite (BASE has no sprite: empty socket).
    const iconX = x + 22;
    const iconY = y + CARD_HEIGHT / 2;
    const drawn = drawImageFit(ctx, game.assets[slot.imageKey], iconX, iconY, 30, 30);

    if (!drawn) {
      ctx.strokeStyle = '#59615b';
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(iconX - 13, iconY - 13, 26, 26);
      ctx.setLineDash([]);
    }

    const textX = x + 44;

    ctx.textAlign = 'left';
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#e0e1d8';
    ctx.fillText(slot.name, textX, y + 15);

    ctx.fillStyle = slot.color;
    ctx.fillText(slot.rarity.toUpperCase(), textX, y + 28);

    ctx.fillStyle = '#a8ad9d';
    ctx.font = '10px monospace';
    ctx.fillText(slot.stat, textX, y + 42);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#858b7e';
    ctx.fillText(`x${slot.collected}`, x + CARD_WIDTH - 7, y + 15);
  }

  // Dashed line from a card to the ship, in the part's rarity colour.
  function drawConnector(ctx, fromX, fromY, toX, toY, color) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  return {
    height: TITLE_HEIGHT + (CARD_HEIGHT + CARD_GAP) * 3,

    draw(ctx, x, y, panelWidth) {
      const now = performance.now();
      const slots = game.getSlots();
      const bySlot = Object.fromEntries(slots.map(slot => [slot.type, slot]));
      const shipRarity = game.getShipRarity();

      // Title.
      ctx.textAlign = 'left';
      ctx.fillStyle = '#d5dfb4';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('SHIP CONFIGURATION', x + 28, y + 10);

      ctx.textAlign = 'right';
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = slots.find(s => s.rarity === shipRarity)?.color || '#aeb4a9';
      ctx.fillText(`SHIP: ${shipRarity.toUpperCase()}`, x + panelWidth - 28, y + 10);

      const top = y + TITLE_HEIGHT;
      const leftX = x + 25;
      const rightX = x + panelWidth - 25 - CARD_WIDTH;
      const centerX = x + panelWidth / 2;
      const row = index => top + index * (CARD_HEIGHT + CARD_GAP);

      // Miniature ship: the same sprite the real ship uses, with a gentle hover.
      const bob = Math.round(Math.sin(now / 600) * 2);
      const shipCenterY = top + SHIP_BOX.height / 2 + 4 + bob;

      // Card layout: engine + fuel tank left, energy + hull right, computer below.
      const layout = [
        ['engine', leftX, row(0), 'right'],
        ['fuelTank', leftX, row(1), 'right'],
        ['energyModule', rightX, row(0), 'left'],
        ['hullCargo', rightX, row(1), 'left'],
        ['computer', centerX - CARD_WIDTH / 2, row(2), 'top']
      ];

      for (const [type, cardX, cardY, side] of layout) {
        const slot = bySlot[type];
        if (!slot) continue;

        const fromX = side === 'right' ? cardX + CARD_WIDTH : side === 'left' ? cardX : centerX;
        const fromY = side === 'top' ? cardY : cardY + CARD_HEIGHT / 2;
        const toX = side === 'right' ? centerX - 28 : side === 'left' ? centerX + 28 : centerX;
        const toY = side === 'top' ? shipCenterY + 34 : shipCenterY + (cardY - row(0) - 30) * 0.4;

        drawConnector(ctx, fromX, fromY, toX, toY, slot.rarity === 'base' ? '#59615b' : slot.color);
      }

      // Soft pad under the ship.
      ctx.fillStyle = 'rgba(130, 150, 130, 0.08)';
      ctx.beginPath();
      ctx.ellipse(centerX, top + SHIP_BOX.height - 2, 52, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      drawImageFit(
        ctx,
        game.getShipSprite(),
        centerX,
        shipCenterY,
        SHIP_BOX.width,
        SHIP_BOX.height
      );

      for (const [type, cardX, cardY] of layout) {
        if (bySlot[type]) drawCard(ctx, bySlot[type], cardX, cardY, now);
      }
    }
  };
}
