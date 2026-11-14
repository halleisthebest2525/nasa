
const SURFACE_RADIUS = 4800;
const PICKUP_DISTANCE = 55;

const RARITIES = {
  base:      { rank: 0, color: '#aeb4a9' },
  common:    { rank: 1, color: '#b8b9ae' },
  rare:      { rank: 2, color: '#71b9e8' },
  epic:      { rank: 3, color: '#c18aff' },
  mythic:    { rank: 4, color: '#ef9c66' },
  legendary: { rank: 5, color: '#f2d46f' }
};

const TYPES = [
  'engine',
  'fuelTank',
  'energyModule',
  'hullCargo',
  'computer'
];

const TYPE_NAMES = {
  engine: 'ENGINE',
  fuelTank: 'FUEL TANK',
  energyModule: 'ENERGY MODULE',
  hullCargo: 'HULL & CARGO',
  computer: 'COMPUTER'
};

// Maps each part type to its exact assets.txt prefix.
const IMAGE_NAMES = {
  engine: 'engine',
  fuelTank: 'fuel_tank',
  energyModule: 'energy_module',
  hullCargo: 'hull_and_cargo',
  computer: 'control_center'
};

const ENGINE_SPEED = [1, 1.05, 1.09, 1.13, 1.17, 1.22];
const ENGINE_DRAIN = [1, 1.06, 1.12, 1.18, 1.24, 1.30];
const ENERGY_EFFICIENCY = [1, 0.95, 0.90, 0.85, 0.80, 0.75];
const ENERGY_PASSIVE = [0, 0.008, 0.012, 0.018, 0.025, 0.035];

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function createInitialState() {
  const parts = [];

  for (let i = 0; i < 2; i++) {
    const angle = randomRange(0, Math.PI * 2);
    const distance = randomRange(1000, SURFACE_RADIUS * 0.82);
    const roll = Math.random() * 100;

    let rarity = 'common';

    if (roll >= 97) rarity = 'epic';
    else if (roll >= 70) rarity = 'rare';

    parts.push({
      id: `moon-part-${i}`,
      type: TYPES[Math.floor(Math.random() * TYPES.length)],
      rarity,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      collected: false
    });
  }

  return {
    items: parts,
    inventory: [],
    installed: {
      engine: 'base',
      fuelTank: 'base',
      energyModule: 'base',
      hullCargo: 'base',
      computer: 'base'
    },
    pickupMessage: '',
    pickupTimer: 0
  };
}

function normalizeState(state) {
  const initial = createInitialState();

  if (!state || typeof state !== 'object') return initial;

  return {
    items: Array.isArray(state.items) ? state.items : initial.items,
    inventory: Array.isArray(state.inventory) ? state.inventory : [],
    installed: {
      ...initial.installed,
      ...(state.installed || {})
    },
    pickupMessage: state.pickupMessage || '',
    pickupTimer: Number(state.pickupTimer) || 0
  };
}

export function attachPartsSystem(moonSurface) {
  const parts = normalizeState(moonSurface.parts);
  moonSurface.parts = parts;

  function getStats() {
    const installed = parts.installed;

    const ranks = Object.values(installed).map(
      rarity => RARITIES[rarity]?.rank ?? 0
    );

    const shipRank = Math.min(...ranks);

    const engineRank = RARITIES[installed.engine]?.rank ?? 0;
    const tankRank = RARITIES[installed.fuelTank]?.rank ?? 0;
    const energyRank = RARITIES[installed.energyModule]?.rank ?? 0;
    const hullRank = RARITIES[installed.hullCargo]?.rank ?? 0;

    return {
      shipRank,
      shipRarity: Object.keys(RARITIES).find(
        key => RARITIES[key].rank === shipRank
      ) || 'base',

      accelerationMultiplier: ENGINE_SPEED[engineRank],
      maxSpeedMultiplier: ENGINE_SPEED[engineRank],
      fuelDrainMultiplier:
        ENGINE_DRAIN[engineRank] * ENERGY_EFFICIENCY[energyRank],

      passiveFuel: ENERGY_PASSIVE[energyRank],

      maxFuel: 100 + tankRank * 20,
      maxHull: 100 + hullRank * 20
    };
  }

  function installPart(part) {
    const current = parts.installed[part.type];

    const currentRank = RARITIES[current]?.rank ?? 0;
    const newRank = RARITIES[part.rarity]?.rank ?? 0;

    if (newRank > currentRank) {
      parts.installed[part.type] = part.rarity;
      return true;
    }

    return false;
  }

  function collectPart(part) {
    part.collected = true;

    const collected = {
      id: part.id,
      type: part.type,
      rarity: part.rarity
    };

    parts.inventory.push(collected);

    const installed = installPart(collected);

    parts.pickupMessage =
      `${part.rarity.toUpperCase()} ${TYPE_NAMES[part.type]}` +
      (installed ? ' INSTALLED' : ' COLLECTED');

    parts.pickupTimer = 3;

    window.dispatchEvent(new CustomEvent('nasareth:modules-changed', {
      detail: getStats()
    }));
  }

  // Keep the existing scrap update unchanged.
  const originalUpdate = moonSurface.update.bind(moonSurface);

  moonSurface.update = function(dt, canRun = true) {
  originalUpdate(dt, canRun);

    if (moonSurface.scraps.inventoryOpen) return;

    for (const part of parts.items) {
      if (part.collected) continue;

      const distance = Math.hypot(
        moonSurface.x - part.x,
        moonSurface.y - part.y
      );

      if (distance <= PICKUP_DISTANCE) {
        collectPart(part);
      }
    }

    parts.pickupTimer = Math.max(0, parts.pickupTimer - dt);
  };

  // Draw actual part images instead of placeholder hexagons.
  const originalDrawWorld =
    moonSurface.scraps.drawWorld.bind(moonSurface.scraps);

  moonSurface.scraps.drawWorld = function(ctx, cameraX, cameraY, width, height) {
    originalDrawWorld(ctx, cameraX, cameraY, width, height);

    for (const part of parts.items) {
      if (part.collected) continue;

      const x = cameraX + part.x;
      const y = cameraY + part.y;

      if (x < -40 || y < -40 || x > width + 40 || y > height + 40) {
        continue;
      }

      const color = RARITIES[part.rarity]?.color || '#b8b9ae';

      const prefix = IMAGE_NAMES[part.type];
      const assetName = `${prefix}_${part.rarity}`;
      const image = moonSurface.assets[assetName];

      ctx.save();
      ctx.translate(x, y);

      // Rarity glow.
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;

      if (
        image &&
        image.complete &&
        image.naturalWidth > 0 &&
        image.naturalHeight > 0
      ) {
        // Preserve the image's original proportions.
        const maxWidth = 48;
        const maxHeight = 48;

        const scale = Math.min(
          maxWidth / image.naturalWidth,
          maxHeight / image.naturalHeight
        );

        const drawWidth = image.naturalWidth * scale;
        const drawHeight = image.naturalHeight * scale;

        ctx.drawImage(
          image,
          -drawWidth / 2,
          -drawHeight / 2,
          drawWidth,
          drawHeight
        );
      } else {
        // Fallback if an image fails to load.
        ctx.fillStyle = '#171b19';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(0, -13);
        ctx.lineTo(11, -6);
        ctx.lineTo(11, 6);
        ctx.lineTo(0, 13);
        ctx.lineTo(-11, 6);
        ctx.lineTo(-11, -6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.fillStyle = color;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const symbol = {
          engine: 'E',
          fuelTank: 'F',
          energyModule: 'P',
          hullCargo: 'H',
          computer: 'C'
        }[part.type];

        ctx.fillText(symbol, 0, 1);
      }

      ctx.restore();
    }
  };

  // Keep the existing scrap pickup message.
  const originalPickupMessage =
    moonSurface.scraps.drawPickupMessage.bind(moonSurface.scraps);

  moonSurface.scraps.drawPickupMessage = function(ctx, width) {
    originalPickupMessage(ctx, width);

    if (parts.pickupTimer <= 0) return;

    ctx.save();
    ctx.globalAlpha = Math.min(1, parts.pickupTimer);
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#d5dfc6';

    ctx.fillText(
      `MODULE: ${parts.pickupMessage}`,
      width / 2,
      95
    );

    ctx.restore();
  };

  return {
    getStats,
    getParts: () => parts,
    getInstalled: () => parts.installed
  };
}
