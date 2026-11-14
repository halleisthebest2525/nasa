
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

const IMAGE_NAMES = {
  engine: 'engine',
  fuelTank: 'fuel_tank',
  energyModule: 'energy_module',
  hullCargo: 'hull_and_cargo',
  computer: 'control_center'
};

// ==========================================
// MODULE STATS (balance chart) - EXPONENTIAL UPGRADES
// Rank: 0 base · 1 common · 2 rare · 3 epic · 4 mythic · 5 legendary
// Every tier multiplies the previous one by the same GROWTH factor, so
// early (Moon) tiers are small steps and late tiers are big jumps.
//
//                      base  common  rare  epic  mythic  legendary
// Engine speed  x1.08  1.00  1.08    1.17  1.26  1.36    1.47
// Engine burn   x1.04  1.00  1.04    1.08  1.12  1.17    1.22  (cost)
// Fuel tank     x1.25  100   125     156   195   244     305
// Energy use    x0.92  1.00  0.92    0.85  0.78  0.72    0.66
// Energy regen  x1.6   0     0.5     0.8   1.3   2.0     3.3   (fuel/min)
// Hull & cargo  x1.25  100   125     156   195   244     305
// Landing assist x1.10 1.00  1.10    1.21  1.33  1.46    1.61  (Control Center)
//
// Full legendary ship: ~5.5x the travel range of a base ship, matching
// destinations that get farther away (Moon 14k, Mars 24k, later more).
// ==========================================
const GROWTH = {
  engineSpeed: 1.08,
  engineBurn: 1.04,
  fuelTank: 1.25,
  energyUse: 0.92,
  energyRegen: 1.6,
  hull: 1.25,
  landingAssist: 1.10
};

const RANKS = [0, 1, 2, 3, 4, 5];
const curve = (base, growth) => RANKS.map(rank => base * growth ** rank);

const ENGINE_SPEED = curve(1, GROWTH.engineSpeed);
const ENGINE_DRAIN = curve(1, GROWTH.engineBurn);
const ENERGY_EFFICIENCY = curve(1, GROWTH.energyUse);
// Fuel regenerated per SECOND (0.5 per minute at common, x1.6 per tier).
const ENERGY_PASSIVE = RANKS.map(rank =>
  rank === 0 ? 0 : 0.5 * GROWTH.energyRegen ** (rank - 1) / 60
);
const FUEL_TANK = RANKS.map(rank => Math.round(100 * GROWTH.fuelTank ** rank));
const HULL = RANKS.map(rank => Math.round(100 * GROWTH.hull ** rank));
const LANDING_ASSIST = curve(1, GROWTH.landingAssist);

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

// RARITY ODDS PER DESTINATION (percent, each row adds up to 100).
// Part type is picked separately: all 5 types are equally likely (20%).
// So exact-part odds = 20% x rarity odds (Moon common engine = 14%).
const PLANET_RARITY_ODDS = {
  moon:    { common: 70, rare: 27, epic: 3,  mythic: 0,  legendary: 0 },
  mars:    { common: 45, rare: 40, epic: 13, mythic: 2,  legendary: 0 },
  // Not built yet - ready for when these destinations are added.
  europa:  { common: 20, rare: 35, epic: 30, mythic: 13, legendary: 2 },
  titan:   { common: 8,  rare: 22, epic: 38, mythic: 25, legendary: 7 },
  umbriel: { common: 2,  rare: 8,  epic: 25, mythic: 45, legendary: 20 }
};

// Rarities that cannot drop on a planet yet, e.g. { mars: ['mythic'] }
// until the Mars boss is defeated. A locked roll becomes the next lower
// rarity, so the odds of everything else stay as in the sheet.
const lockedRarities = {};

const RARITY_ORDER = ['common', 'rare', 'epic', 'mythic', 'legendary'];

function rollRarity(planet = 'moon') {
  const odds = PLANET_RARITY_ODDS[planet] || PLANET_RARITY_ODDS.moon;
  let roll = Math.random() * 100;
  let result = 'common';

  for (const [rarity, chance] of Object.entries(odds)) {
    if (roll < chance) { result = rarity; break; }
    roll -= chance;
  }

  const locked = lockedRarities[planet] || [];

  while (locked.includes(result) && result !== 'common') {
    result = RARITY_ORDER[RARITY_ORDER.indexOf(result) - 1];
  }

  return result;
}

// Number of modules lying on the Moon at a time (balance setting).
const PARTS_PER_MOON = 6;

// Modules lying on each planet (Mars has a few more than the Moon).
const PARTS_PER_PLANET = { moon: 6, mars: 7 };
const partsCount = planet => PARTS_PER_PLANET[planet] || PARTS_PER_MOON;

// Creates a fresh batch of modules scattered over the Moon.
function createParts(planet = 'moon') {
  const parts = [];
  const count = partsCount(planet);
  const batch = Date.now().toString(36);

  for (let i = 0; i < count; i++) {
    const angle = randomRange(0, Math.PI * 2);
    const distance = randomRange(1000, SURFACE_RADIUS * 0.82);

    parts.push({
      id: `moon-part-${batch}-${i}`,
      type: TYPES[Math.floor(Math.random() * TYPES.length)],
      rarity: rollRarity(planet),
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      collected: false
    });
  }

  return parts;
}

function createInitialState() {
  return {
    items: createParts(),
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

    // Ship rarity (and sprite) is the average of all five modules,
    // rounded down, so every upgrade counts.
    const shipRank = Math.floor(
      ranks.reduce((total, rank) => total + rank, 0) / ranks.length
    );

    const engineRank = RARITIES[installed.engine]?.rank ?? 0;
    const tankRank = RARITIES[installed.fuelTank]?.rank ?? 0;
    const energyRank = RARITIES[installed.energyModule]?.rank ?? 0;
    const hullRank = RARITIES[installed.hullCargo]?.rank ?? 0;
    const computerRank = RARITIES[installed.computer]?.rank ?? 0;

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

      maxFuel: FUEL_TANK[tankRank],
      maxHull: HULL[hullRank],

      // Control Center: makes the launch/landing green zone wider.
      landingAssist: LANDING_ASSIST[computerRank]
    };
  }

  // Find the closest uncollected ship module.
  function getNearestUncollected(x, y) {
    let nearest = null;

    for (const part of parts.items) {
      if (part.collected) continue;

      const distance = Math.hypot(
        x - part.x,
        y - part.y
      );

      if (!nearest || distance < nearest.distance) {
        nearest = {
          ...part,
          distance
        };
      }
    }

    return nearest;
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

    // Modules are NOT installed in the field: they are fitted at Earth.
    parts.pickupMessage =
      `${part.rarity.toUpperCase()} ${TYPE_NAMES[part.type]} COLLECTED · INSTALL AT EARTH`;

    parts.pickupTimer = 3;

    window.dispatchEvent(new CustomEvent('nasareth:modules-changed', {
      detail: getStats()
    }));
  }

  const originalUpdate = moonSurface.update.bind(moonSurface);

  // Pass every argument through (dt AND canRun) to the original update.
  moonSurface.update = function(dt, ...args) {
    originalUpdate(dt, ...args);

    parts.pickupTimer = Math.max(0, parts.pickupTimer - dt);

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
  };

  // Replace the modules lying on the Moon with a new batch (each new day).
  // Installed modules and the module inventory are kept.
  // planet = 'moon' or 'mars' (uses that planet's rarity odds).
  function respawn(planet = 'moon') {
    // Keep boss rewards that have not been picked up yet.
    const rewards = parts.items.filter(part => part.reward && !part.collected);
    parts.items = [...rewards, ...createParts(planet)];
  }

  // Older saves could have too many modules on the Moon, or mythic /
  // legendary ones. If so, replace them with a normal batch.
  function fixMoonItems(planet = 'moon') {
    // Rarities that can drop on this planet (odds above 0).
    const odds = PLANET_RARITY_ODDS[planet] || PLANET_RARITY_ODDS.moon;
    const MOON_RARITIES = Object.keys(odds).filter(rarity => odds[rarity] > 0);

    const invalid =
      !Array.isArray(parts.items) ||
      parts.items.filter(part => !part.reward).length > partsCount(planet) ||
      parts.items.some(part => !part.reward && !MOON_RARITIES.includes(part.rarity));

    if (invalid) {
      parts.items = createParts(planet);
    }
  }

  fixMoonItems();

  // Draw actual module images.
  const originalDrawWorld =
    moonSurface.scraps.drawWorld.bind(moonSurface.scraps);

  moonSurface.scraps.drawWorld = function(
    ctx,
    cameraX,
    cameraY,
    width,
    height
  ) {
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

      ctx.shadowColor = color;
      ctx.shadowBlur = 14;

      if (
        image &&
        image.complete &&
        image.naturalWidth > 0 &&
        image.naturalHeight > 0
      ) {
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
      200 // below the scrap message and the SHIP TIME / HULL boxes
    );

    ctx.restore();
  };

  // A part's own effect as short text (same tables getStats() uses).
  function partStat(type, rank) {
    if (type === 'engine') {
      return `SPD x${ENGINE_SPEED[rank].toFixed(2)} FUEL x${ENGINE_DRAIN[rank].toFixed(2)}`;
    }
    if (type === 'fuelTank') return `MAX FUEL ${FUEL_TANK[rank]}`;
    if (type === 'energyModule') {
      return `USE x${ENERGY_EFFICIENCY[rank].toFixed(2)} +${(ENERGY_PASSIVE[rank] * 60).toFixed(1)}/MIN`;
    }
    if (type === 'hullCargo') return `MAX HULL ${HULL[rank]}`;
    return `LANDING ZONE x${LANDING_ASSIST[rank].toFixed(2)}`;
  }

  // EARTH SHIPYARD: what can be fitted in a slot = the stock BASE part
  // plus every rarity of that type the player has collected.
  function getSlotOptions(type) {
    const owned = {};

    for (const part of parts.inventory) {
      if (part.type === type) owned[part.rarity] = (owned[part.rarity] || 0) + 1;
    }

    return ['base', ...Object.keys(owned)]
      .filter((rarity, index, list) => list.indexOf(rarity) === index)
      .sort((a, b) => (RARITIES[a]?.rank ?? 0) - (RARITIES[b]?.rank ?? 0))
      .map(rarity => ({
        rarity,
        count: rarity === 'base' ? null : owned[rarity],
        color: RARITIES[rarity]?.color || '#aeb4a9',
        stat: partStat(type, RARITIES[rarity]?.rank ?? 0),
        installed: parts.installed[type] === rarity
      }));
  }

  // Fit a part (only at Earth). Returns false if the player doesn't own it.
  function fitPart(type, rarity) {
    if (!TYPES.includes(type)) return false;

    const owned = rarity === 'base' ||
      parts.inventory.some(part => part.type === type && part.rarity === rarity);

    if (!owned) return false;

    parts.installed[type] = rarity;

    window.dispatchEvent(new CustomEvent('nasareth:modules-changed', {
      detail: getStats()
    }));

    return true;
  }

  // LIVE SLOT DATA for the Ship Configuration view in the B inventory.
  // Read straight from parts.installed every time, never a copy.
  function getSlotInfo() {
    return TYPES.map(type => {
      const rarity = parts.installed[type] || 'base';
      const rank = RARITIES[rarity]?.rank ?? 0;

      // This part's own effect (same tables getStats() uses).
      const stat = partStat(type, rank);

      return {
        type,
        name: TYPE_NAMES[type],
        rarity,
        color: RARITIES[rarity]?.color || '#aeb4a9',
        // Same asset name used to draw this part on the Moon.
        imageKey: `${IMAGE_NAMES[type]}_${rarity}`,
        stat,
        collected: parts.inventory.filter(part => part.type === type).length
      };
    });
  }

  return {
    getStats,
    getParts: () => parts,
    getInstalled: () => parts.installed,
    getNearestUncollected,
    getSlotInfo,
    getSlotOptions,
    fitPart,
    typeName: type => TYPE_NAMES[type],
    types: () => [...TYPES],
    respawn,
    fixMoonItems,

    // ADMIN MODE (temporary): collect every module left on this planet at once.
    collectAll() {
      const left = parts.items.filter(part => !part.collected);
      left.forEach(collectPart);
      if (left.length) {
        parts.pickupMessage = `ADMIN: ${left.length} MODULES COLLECTED · INSTALL AT EARTH`;
        parts.pickupTimer = 3;
      }
      return left.length;
    },

    // For the planet log.
    getRarityOdds: planet => (PLANET_RARITY_ODDS[planet] ? { ...PLANET_RARITY_ODDS[planet] } : null),
    getLockedRarities: planet => [...(lockedRarities[planet] || [])],

    // Lock / unlock rarities on a planet (e.g. Mars mythic until the boss dies).
    setLockedRarities(planet, rarities) {
      lockedRarities[planet] = [...rarities];
    },

    // Boss reward: a guaranteed part placed in the world (picked up like any part).
    addRewardPart(x, y, rarity) {
      const types = ['engine', 'fuelTank', 'energyModule', 'hullCargo', 'computer'];

      parts.items.push({
        id: `boss-reward-${Date.now().toString(36)}`,
        type: types[Math.floor(Math.random() * types.length)],
        rarity,
        x: Math.round(x),
        y: Math.round(y),
        collected: false,
        reward: true
      });
    }
  };
}
