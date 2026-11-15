// ==========================================
// CHEST QUEST (every planet)
// 1. Collect all the modules lying on a planet.
//    (The first time, on the Moon, you also get the CHEST DETECTOR.)
// 2. A chest appears on that planet. The detector (Q) shows its distance.
// 3. Open the chest (walk onto it) -> the star map to the NEXT destination.
//    Moon chest -> Mars map · Mars chest -> Europa map.
// A planet counts as BEATEN once its chest has been opened.
// ==========================================

import { PLANETS } from './planets.js';

const CHEST_MIN_DISTANCE = 1200; // from the player when it appears
const OPEN_DISTANCE = 50;

// Which star map each planet's chest gives, and its display name.
export const CHEST_REWARDS = {
  moon: { map: 'mars', name: 'MARS' },
  mars: { map: 'europa', name: 'EUROPA (MOON OF JUPITER)' },
  europa: { map: 'titan', name: 'TITAN (MOON OF SATURN)' },
  titan: { map: 'umbriel', name: 'URANUS (MOON UMBRIEL)' },
  umbriel: { map: null, name: 'STARFALL COMPLETE' }
};

// game = { partsSystem, moonSurface, getPlanet(), showTransmission(text, color), onPlanetBeaten(planet) }
export function createChestQuest(game) {
  const state = {
    chestDetector: false,
    chests: {},   // planet -> { x, y } while waiting to be found
    opened: {},   // planet -> true once its chest was opened (= beaten)
    maps: {}      // destination -> true once its star map was found
  };

  const planetNow = () => game.getPlanet();

  function spawnChest(planet) {
    const radius = PLANETS[planet]?.radius || 4800;
    const px = game.moonSurface.x;
    const py = game.moonSurface.y;
    let x = 0;
    let y = 0;

    for (let tries = 0; tries < 300; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * radius * 0.85;

      x = Math.cos(angle) * distance;
      y = Math.sin(angle) * distance;

      if (Math.hypot(x - px, y - py) >= CHEST_MIN_DISTANCE) break;
    }

    // On a world with a boss, the chest lies next to the boss's lair:
    // the boss guards it.
    const guarded = game.getChestSpot ? game.getChestSpot(planet) : null;

    if (guarded) {
      x = guarded.x;
      y = guarded.y;
    }

    state.chests[planet] = { x: Math.round(x), y: Math.round(y) };
  }

  // Called whenever a module is picked up (and after loading a save).
  function checkModules() {
    const planet = planetNow();

    // Only planets that have a chest, and only once per planet.
    if (!CHEST_REWARDS[planet] || state.chests[planet] || state.opened[planet]) return;

    // Boss rewards are extra: "all modules" means the planet's normal ones.
    const items = game.partsSystem.getParts().items.filter(part => !part.reward);
    const allFound = items.length > 0 && items.every(part => part.collected);

    if (!allFound) return;

    const firstDetector = !state.chestDetector;
    state.chestDetector = true;
    spawnChest(planet);

    game.showTransmission(
      'ALL MODULES RECOVERED\n' +
      (firstDetector ? 'CHEST DETECTOR ACQUIRED\n' : 'CHEST SIGNAL DETECTED ON THIS PLANET\n') +
      'PRESS Q TO TRACK THE SIGNAL',
      '#e0c78e'
    );
  }

  // Opens the chest when the player walks onto it.
  function update() {
    const planet = planetNow();
    const chest = state.chests[planet];

    if (!chest) return;

    const distance = Math.hypot(chest.x - game.moonSurface.x, chest.y - game.moonSurface.y);

    if (distance > OPEN_DISTANCE) return;
    if (game.canOpenChest && !game.canOpenChest(planet)) return;

    const reward = CHEST_REWARDS[planet];

    state.chests[planet] = null;
    state.opened[planet] = true;
    if (reward.map) state.maps[reward.map] = true;

    game.showTransmission(
      reward.map ? 'CHEST OPENED\n' +
      `${reward.name} STAR MAP ACQUIRED\n` +
      'ROUTE UNLOCKED' : 'FINAL CHEST OPENED\nSTARFALL COMPLETE\nTHE VOID SOVEREIGN HAS FALLEN',
      reward.map ? '#ef9c66' : '#FFFFFF'
    );

    if (game.onPlanetBeaten) game.onPlanetBeaten(planet);
  }

  // Distance from the player to this planet's chest, or null.
  function getChestDistance() {
    const chest = state.chests[planetNow()];

    if (!state.chestDetector || !chest) return null;

    return Math.hypot(chest.x - game.moonSurface.x, chest.y - game.moonSurface.y);
  }

  // Small pixel-art chest, drawn in world space (hidden by the darkness).
  function draw(ctx, cameraX, cameraY, width, height) {
    const chest = state.chests[planetNow()];

    if (!chest) return;

    const x = Math.round(cameraX + chest.x);
    const y = Math.round(cameraY + chest.y);

    if (x < -40 || y < -40 || x > width + 40 || y > height + 40) return;

    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-15, 8, 30, 5);

    ctx.shadowColor = '#e0c78e';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#5a3b22';            // body
    ctx.fillRect(-14, -6, 28, 16);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#734c2c';            // lid
    ctx.fillRect(-14, -14, 28, 9);
    ctx.fillStyle = '#c9a45a';            // metal bands
    ctx.fillRect(-14, -6, 28, 2);
    ctx.fillRect(-10, -14, 3, 24);
    ctx.fillRect(7, -14, 3, 24);
    ctx.fillStyle = '#f2d46f';            // lock
    ctx.fillRect(-2, -8, 4, 5);

    ctx.restore();
  }

  function save() {
    return structuredClone(state);
  }

  function load(data) {
    state.chestDetector = false;
    state.chests = {};
    state.opened = {};
    state.maps = {};

    if (!data || typeof data !== 'object') return;

    state.chestDetector = Boolean(data.chestDetector);

    if (data.chests || data.opened || data.maps) {
      // Current format.
      state.chests = data.chests || {};
      state.opened = data.opened || {};
      state.maps = data.maps || {};
    } else {
      // Older saves: only the Moon chest existed.
      if (data.chest && Number.isFinite(data.chest.x)) state.chests.moon = { ...data.chest };
      if (data.marsMap) { state.maps.mars = true; state.opened.moon = true; }
    }
  }

  return {
    checkModules,
    update,
    getChestDistance,
    draw,
    save,
    load,
    // Shortcuts used around the game.
    getState: () => ({
      chestDetector: state.chestDetector,
      marsMap: Boolean(state.maps.mars),
      europaMap: Boolean(state.maps.europa),
      opened: state.opened,
      maps: state.maps,
      chests: state.chests
    }),
    isBeaten: planet => Boolean(state.opened[planet])
  };
}
