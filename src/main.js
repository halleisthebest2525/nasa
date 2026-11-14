import { Ship } from './ship.js';
import { World } from './world.js';
import { OnFoot } from './onFoot.js';
import { CONFIG } from './config.js';
import { drawBackground, drawWorld } from './renderer.js';
import { updateHud } from './hud.js';
import { MoonSurface } from './moonSurface.js';
import { loadAssets } from './assets.js';
import { Survival } from './survival.js';
import { attachPartsSystem } from './partsSystem.js';
import { readSaves, writeSave, removeSave, applySnapshot } from './saveSystem.js';
import { isTypingTarget } from './input.js';
import { createSpaceBackground } from './spaceBackground.js';
import { runGaugeChallenge, isGaugeChallengeActive } from './gaugeChallenge.js';
import { createStatsSection } from './inventoryStats.js';
import { createShipConfigSection } from './shipConfigView.js';
import { createLunarCrawlers } from './lunarCrawler.js';
import { createChestQuest } from './chestQuest.js';
import { PLANETS } from './planets.js';
import { createMarsMonsters } from './marsMonsters.js';
import { createEuropaMonsters } from './europaMonsters.js';
import { createEarthBase } from './earthBase.js';
import { createPlanetLog } from './planetLog.js';
import { adminFlags, createAdminMode } from './adminMode.js'; // TEMPORARY
import { createMusic } from './music.js';
import { createMartialArts } from './martialArts.js';
import { createSkillMenu } from './skillMenu.js';
import { sfx } from './sfx.js';
import { BELT } from './world.js';

const canvas = document.querySelector('#space');
const ctx = canvas.getContext('2d');

const ship = new Ship();
const world = new World();

const assets = await loadAssets();

const onFoot = new OnFoot(assets);
// Sprites the space renderer needs (Asteroid Belt rocks, Jupiter backdrop).
world.sprites = {
  asteroids: Array.from({ length: 16 }, (_, i) => assets[`asteroid_${String(i + 1).padStart(2, '0')}`]),
  jupiter: assets.jupiter_backdrop,
  saturn: assets.saturn_backdrop
};

const moonSurface = new MoonSurface(assets);
const survival = new Survival();

const partsSystem = attachPartsSystem(moonSurface);
const spaceBackground = createSpaceBackground(assets);

// Chest quest: all Moon modules -> chest detector -> chest -> Mars map.
const chestQuest = createChestQuest({
  partsSystem,
  moonSurface,
  getPlanet: () => landedPlanet,
  showTransmission: (text, color) => showTransmission(text, color),

  // Planet beaten (all modules + chest): Earth calls the player home to
  // refit the ship before the next destination.
  onPlanetBeaten() {
    setTimeout(() => {
      showTransmission(
        'INCOMING CALL · EARTH CONTROL\n' +
        'GOOD WORK OUT THERE, PILOT\n' +
        'RETURN TO EARTH TO REFIT YOUR SHIP',
        '#8fc3e8'
      );
    }, 7000);
  }
});
moonSurface.chestQuest = chestQuest;

// Moon enemies (not saved: a fresh group appears on load and each new day).
const crawlers = createLunarCrawlers(assets);
moonSurface.enemies = crawlers;

// Mars enemies: Dust Stalkers + the Ares Colossus boss (not saved, except
// whether the boss has been defeated).
// EARTH SHIPYARD: repair / restore the ship and fit collected parts.
const earthBase = createEarthBase({
  partsSystem,
  restoreShip() {
    hull = hullMax;
    updateHull();
    survival.fuel = survival.maxFuel;
    survival.shipOxygen = 100;
    survival.oxygen = 100;
  },
  getShipSprite: () => shipSprite,
  getShipRarity: () => partsSystem.getStats().shipRarity,
  onLaunch: () => startEarthLaunch()
});

// PLANET LOG (P): beaten planets + module odds per planet.
const planetLog = createPlanetLog({
  getOdds: planet => partsSystem.getRarityOdds(planet),
  getLocked: planet => partsSystem.getLockedRarities(planet),
  isBeaten: planet => chestQuest.isBeaten(planet),
  hasMap: planet => Boolean(chestQuest.getState().maps[planet]),
  getModuleProgress(planet) {
    const items =
      planet === landedPlanet && landedOnMoon !== undefined && moonSurface.planet.id === planet
        ? partsSystem.getParts().items
        : planetStates[planet]?.partItems;

    if (!items) return null;

    const normal = items.filter(part => !part.reward);
    return { found: normal.filter(part => part.collected).length, total: normal.length };
  }
});

const marsMonsters = createMarsMonsters(assets, {
  onBossDefeated(x, y) {
    // The strongest Mars item: a guaranteed MYTHIC module where it fell.
    partsSystem.addRewardPart(x, y, 'mythic');
    // From now on mythic modules can also drop normally on Mars.
    partsSystem.setLockedRarities('mars', []);

    showTransmission(
      'ARES COLOSSUS DEFEATED\n' +
      'A MYTHIC MODULE LIES WHERE IT FELL\n' +
      'MYTHIC SALVAGE NOW APPEARS ON MARS',
      '#ff7b5c'
    );
  },
  onBossEnraged() {
    showMoonMessage('ARES COLOSSUS IS ENRAGED · WATCH FOR CRYSTAL ERUPTIONS');
  }
});

// Mythic modules only drop on Mars after the boss is defeated.
partsSystem.setLockedRarities('mars', ['mythic']);

// EUROPA: Frost Skitters and the Cryolith Leviathan.
const europaMonsters = createEuropaMonsters(assets, {
  onBossDefeated(x, y) {
    // The strongest Europa item: a guaranteed LEGENDARY module where it fell.
    partsSystem.addRewardPart(x, y, 'legendary');
    partsSystem.setLockedRarities('europa', []);

    showTransmission(
      'CRYOLITH LEVIATHAN DEFEATED\n' +
      'A LEGENDARY MODULE LIES WHERE IT FELL\n' +
      'LEGENDARY SALVAGE NOW APPEARS ON EUROPA',
      '#8fe0ff'
    );
  },
  onBossPhase(phase) {
    showMoonMessage(phase === 2
      ? 'THE LEVIATHAN CRACKS · PHASE 2 · WATCH FOR ICE SPIRES'
      : 'THE LEVIATHAN RAGES · PHASE 3 · IT IS FASTER NOW');
  },
  onAbsoluteZero() {
    showMoonMessage('ABSOLUTE ZERO · RUN OUT OF THE CIRCLE');
  }
});

// Legendary modules only drop on Europa after the boss is defeated.
partsSystem.setLockedRarities('europa', ['legendary']);

// Which enemy group lives on each planet (see planets.js "enemies").
const ENEMY_GROUPS = { moon: crawlers, mars: marsMonsters, europa: europaMonsters };

function currentEnemies() {
  return ENEMY_GROUPS[PLANETS[landedPlanet].enemies] || null;
}

// Red screen flash when a crawler hits the player.
let playerHurtFlash = 0;

// MARTIAL ARTS: the player's only way to fight (no weapons).
// Skills are learned with scraps in the Martial Arts menu (K).
const martialArts = createMartialArts({
  getPlayer: () => ({ x: moonSurface.x, y: moonSurface.y, angle: moonSurface.angle }),
  movePlayer(dx, dy) {
    moonSurface.x += dx;
    moonSurface.y += dy;

    // Stay on the planet (the flying kick cannot leave the surface).
    const distance = Math.hypot(moonSurface.x, moonSurface.y);
    const limit = moonSurface.planet.radius - 40;

    if (distance > limit) {
      moonSurface.x = moonSurface.x / distance * limit;
      moonSurface.y = moonSurface.y / distance * limit;
    }
  },
  getEnemies: () => currentEnemies(),
  getScraps: () => moonSurface.scraps.credits ?? 0,
  spendScraps(amount) {
    moonSurface.scraps.credits -= amount;
  },
  // What the player has achieved so far (decides which skills can be learned).
  getProgress: () => ({
    reachedMars: Boolean(chestQuest.getState().maps.mars),
    marsBoss: marsMonsters.isBossDefeated(),
    europaBoss: europaMonsters.isBossDefeated(),
    titanBeaten: chestQuest.isBeaten('titan'),
    neptuneBoss: false   // Neptune is not in the game yet
  }),
  // Defeated monsters drop scrap: one piece each, a pile from a boss.
  onKill(result) {
    if (result.boss) moonSurface.scraps.dropAt(result.x, result.y, 'epic', 6);
    else moonSurface.scraps.dropAt(result.x, result.y, null, 1);
  },
  message: text => showMoonMessage(text),
  sfx
});

const skillMenu = createSkillMenu({
  arts: martialArts,
  getScraps: () => moonSurface.scraps.credits ?? 0
});

// The surface draws the attack effects and the skill bar.
moonSurface.combat = martialArts;

// Scrap picked up: play the collection sound.
moonSurface.scraps.onCollect = item => sfx.pickup(item.rarity);

function canUseMoonCombat(event) {
  return (
    gameMode === 'moon' &&
    !paused &&
    !gameOver &&
    !sleeping &&
    !computerOpen &&
    !moonSurface.scraps.inventoryOpen &&
    !launchConfirmationOpen &&
    !sleepConfirmationOpen &&
    !isGaugeChallengeActive() &&
    !earthBase.isOpen() &&
    !planetLog.isOpen() &&
    !skillMenu.isOpen() &&
    !isTypingTarget(event)
  );
}

// ATTACK: Space or left mouse button = PUNCH. Number keys 1-6 = skills.
window.addEventListener('keydown', (event) => {
  if (event.repeat || !canUseMoonCombat(event)) return;

  if (event.key === ' ') {
    event.preventDefault();
    martialArts.use('punch');
  } else if (/^Digit[1-6]$/.test(event.code)) {
    event.preventDefault();
    martialArts.useByKey(event.code.slice(5));
  }
});

canvas.addEventListener('mousedown', (event) => {
  if (event.button !== 0 || !canUseMoonCombat(event)) return;

  martialArts.use('punch');
});

// Ship Configuration in the B inventory: a live view of the real ship.
// getShipSprite returns the same variable drawWorld() uses for the ship.
moonSurface.scraps.inventorySections.push(createShipConfigSection({
  assets,
  getSlots: () => partsSystem.getSlotInfo(),
  getShipSprite: () => shipSprite,
  getShipRarity: () => partsSystem.getStats().shipRarity
}));

// Ship + player stats in the B inventory (below the ship configuration).
moonSurface.scraps.inventorySections.push(createStatsSection({
  survival,
  getModuleStats: () => partsSystem.getStats(),
  getHull: () => ({ hull, hullMax }),
  getProgress: () => chestQuest.getState(),
  getSkillCount: () => martialArts.unlockedCount()
}));
let moduleStats = partsSystem.getStats();

let hullMax = moduleStats.maxHull;

// landedOnMoon = "landed on a planet surface" (Moon or Mars).
let landedOnMoon = false;
let shipSprite = assets.ship_space_common;

// ==========================================
// PLANETS (Moon, Mars)
// One surface object (moonSurface) is reused for every planet.
// landedPlanet = the planet whose surface is currently loaded.
// planetStates keeps the scrap/modules of the planets NOT loaded right now.
// ==========================================
let landedPlanet = 'moon';
let planetStates = {};

// Turns crawlers / the chest on or off for the loaded planet.
function applyPlanetFeatures() {
  const planet = PLANETS[landedPlanet];

  moonSurface.enemies = currentEnemies();
  moonSurface.chestQuest = planet.chestQuest ? chestQuest : null;
}

// Loads another planet's surface, keeping each planet's own loot.
function switchPlanet(id) {
  if (!PLANETS[id] || id === landedPlanet) return;

  // Store the planet we are leaving.
  planetStates[landedPlanet] = {
    scrapItems: moonSurface.scraps.items,
    partItems: partsSystem.getParts().items
  };

  landedPlanet = id;

  const stored = planetStates[id];

  if (stored) {
    // Scrap may have been refreshed by a night's sleep (null = regenerate).
    if (stored.scrapItems) moonSurface.scraps.items = stored.scrapItems;
    else moonSurface.scraps.respawn(PLANETS[id]);

    partsSystem.getParts().items = stored.partItems;
    delete planetStates[id];
  } else {
    // First visit: fresh scrap and modules with this planet's odds.
    moonSurface.scraps.respawn(PLANETS[id]);
    partsSystem.respawn(id);
  }

  moonSurface.setPlanet(PLANETS[id]);
  applyPlanetFeatures();
}

// Distance to the quest chest, only on the planet that has it.
function currentChestDistance() {
  return PLANETS[landedPlanet].chestQuest
    ? chestQuest.getChestDistance()
    : null;
}

// GAME STATE
let hull = 100;
let gameOver = false;
let gameMode = 'driving';
let minimapOpen = false;
let paused = false;
let autosaveAccumulator = 0;

let sleepConfirmationOpen = false;
let sleeping = false;
let sleepTimer = 0;
let forcedSleep = false;
let modeBeforeSleep = 'walking';

// Shown once each time the fuel runs out while the player can still pay.
let fuelWarningShown = false;

// Ship computer prices.
const FUEL_PRICE = 30;
const HULL_REPAIR_PRICE = 40;
const HULL_REPAIR_AMOUNT = 20;

// FLASHLIGHT: price of each level (index 0 = buying level 1).
const FLASHLIGHT_PRICES = [60, 120, 200, 320];
const FLASHLIGHT_MAX_LEVEL = FLASHLIGHT_PRICES.length;

// MED KIT: heals 40 health. Carry up to 5. Use with H.
const MEDKIT_PRICE = 45;
const MEDKIT_HEAL = 40;
const MEDKIT_MAX = 5;

function useMedkit() {
  if (survival.medkits <= 0 || survival.health >= 100) return false;

  survival.medkits -= 1;
  survival.health = Math.min(100, survival.health + MEDKIT_HEAL);
  return true;
}

// Flashlight beam on the Moon. Each level makes it longer and wider.
// Level 1: 290 long · Level 4: 470 long.
const BEAM_BASE_LENGTH = 230;
const BEAM_LENGTH_PER_LEVEL = 60;
const BEAM_BASE_HALF_ANGLE = 0.30; // radians, each side of centre
const BEAM_HALF_ANGLE_PER_LEVEL = 0.04;

function applyFlashlight() {
  const level = Math.max(
    0,
    Math.min(FLASHLIGHT_MAX_LEVEL, Number(survival.flashlightLevel) || 0)
  );

  survival.flashlightLevel = level;
  survival.flashlightOn = Boolean(survival.flashlightOn) && level > 0;

  moonSurface.flashlight = survival.flashlightOn
    ? {
      length: BEAM_BASE_LENGTH + level * BEAM_LENGTH_PER_LEVEL,
      halfAngle: BEAM_BASE_HALF_ANGLE + level * BEAM_HALF_ANGLE_PER_LEVEL
    }
    : null;
}

// Short message at the top of the Moon screen.
function showMoonMessage(text) {
  moonSurface.scraps.pickupMessage = text;
  moonSurface.scraps.pickupTimer = 2.2;
}

applyFlashlight();

let launchConfirmationOpen = false;
let launchSelection = 0;

let computerOpen = false;
let computerPage = 'home';

// GAME CLOCK
let gameMinutes = 8 * 60;
let clockAccumulator = 0;

const particles = [];
const collisionCooldowns = new Map();

// TRACK HELD KEYS FOR RESOURCE SYSTEMS
const heldKeys = new Set();

window.addEventListener('keydown', event => {
  if (isTypingTarget(event)) return;

  heldKeys.add(event.key.toLowerCase());
});

window.addEventListener('keyup', event => {
  heldKeys.delete(event.key.toLowerCase());
});

window.addEventListener('blur', () => {
  heldKeys.clear();
});

function isMovingOnFoot() {
  return [
    'w', 'a', 's', 'd',
    'arrowup', 'arrowdown',
    'arrowleft', 'arrowright'
  ].some(key => heldKeys.has(key));
}

function isRunning() {
  return heldKeys.has('shift') &&
    isMovingOnFoot() &&
    survival.canRun();
}

// RENDERING
const pixelCanvas = document.createElement('canvas');
const pixelCtx = pixelCanvas.getContext('2d');

let width = 0;
let height = 0;
let previous = 0;

let shake = 0;
let impactFlash = 0;
let impactMessageTimer = 0;

// CLOCK DISPLAY
const clockDisplay = document.createElement('div');

clockDisplay.style.cssText = `
  position:fixed;
  top:75px;
  left:50%;
  transform:translateX(-50%);
  z-index:20;
  padding:8px 16px;
  background:rgba(0,0,0,.85);
  border:1px solid #484b43;
  color:#d5d0c5;
  font:bold 15px monospace;
  letter-spacing:2px;
  pointer-events:none;
`;

document.body.appendChild(clockDisplay);

function formatTime(minutes) {
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = Math.floor(minutes % 60);
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;

  return `${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${period}`;
}

function updateClockDisplay() {
  clockDisplay.textContent = `SHIP TIME · ${formatTime(gameMinutes)}`;
}

updateClockDisplay();

// HULL DISPLAY
const hullDisplay = document.createElement('div');

hullDisplay.style.cssText = `
  position:fixed;
  top:110px;
  left:50%;
  transform:translateX(-50%);
  z-index:20;
  padding:9px 17px;
  background:rgba(0,0,0,.9);
  border:1px solid #555;
  color:#d5d0c5;
  font:bold 15px monospace;
  letter-spacing:2px;
  pointer-events:none;
`;

document.body.appendChild(hullDisplay);

// SLEEP CONFIRMATION
let sleepSelection = 0;

const sleepConfirm = document.createElement('div');

sleepConfirm.style.cssText = `
  position:fixed;
  inset:0;
  z-index:80;
  display:none;
  align-items:center;
  justify-content:center;
  background:rgba(0,0,0,.72);
  font-family:monospace;
  text-align:center;
`;

sleepConfirm.innerHTML = `
  <div style="
    width:min(390px,90vw);
    padding:28px;
    background:#151a18;
    border:1px solid #727c6d;
    box-shadow:0 15px 60px #000;
  ">
    <div style="color:#c6d0b2;font-size:20px;letter-spacing:3px">
      REST
    </div>
    <p style="color:#aaa;font-size:12px;line-height:1.8">
      Sleep until 7:00 AM?
    </p>
    <div style="display:flex;justify-content:center;gap:14px;margin-top:24px">
      <button id="sleep-yes" style="
        padding:11px 24px;background:#68775e;color:white;
        border:1px solid #aab99b;font:14px monospace;cursor:pointer;
      ">YES</button>
      <button id="sleep-no" style="
        padding:11px 24px;background:#252927;color:#ccc;
        border:1px solid #555;font:14px monospace;cursor:pointer;
      ">NO</button>
    </div>
    <div style="margin-top:18px;color:#858b7e;font-size:10px">
      ← → SELECT · ENTER CONFIRM · Y / N
    </div>
  </div>
`;

document.body.appendChild(sleepConfirm);

// SLEEP SCREEN
const sleepScreen = document.createElement('div');

sleepScreen.style.cssText = `
  position:fixed;
  inset:0;
  z-index:90;
  display:none;
  align-items:center;
  justify-content:center;
  flex-direction:column;
  background:#050706;
  color:#c5cbb9;
  font-family:monospace;
  text-align:center;
`;

sleepScreen.innerHTML = `
  <div id="sleep-title" style="
    font-size:clamp(28px,5vw,48px);
    letter-spacing:7px;
  ">RESTING</div>
  <div id="sleep-description" style="
    margin-top:20px;color:#858b7e;font-size:12px;letter-spacing:2px;
  ">AUTOMATIC WAKE-UP · 07:00 AM</div>
`;

document.body.appendChild(sleepScreen);

// GAME OVER
const gameOverScreen = document.createElement('div');

gameOverScreen.style.cssText = `
  position:fixed;
  inset:0;
  z-index:100;
  display:none;
  align-items:center;
  justify-content:center;
  flex-direction:column;
  background:rgba(0,0,0,.96);
  color:#c7c0b3;
  font-family:monospace;
  text-align:center;
`;

gameOverScreen.innerHTML = `
  <div style="
    color:#b64d3f;
    font-size:clamp(35px,7vw,75px);
    font-weight:bold;
    letter-spacing:8px;
  ">SHIP DESTROYED</div>
  <div style="margin-top:20px;color:#aaa;font-size:14px">
    HULL INTEGRITY: 0%
  </div>
  <div style="margin-top:15px;color:#777;font-size:12px">
    MISSION FAILED
  </div>
  <button id="restart-game" style="
    margin-top:35px;padding:13px 30px;color:#ddd;
    background:#252522;border:1px solid #777;
    font:14px monospace;letter-spacing:2px;cursor:pointer;
  ">RESTART MISSION</button>
`;

document.body.appendChild(gameOverScreen);

document.querySelector('#restart-game').addEventListener('click', () => {
  location.reload();
});

// SPACESHIP COMPUTER
const computerScreen = document.createElement('div');

computerScreen.style.cssText = `
  position:fixed;
  inset:0;
  z-index:75;
  display:none;
  align-items:center;
  justify-content:center;
  background:rgba(0,0,0,.82);
  font-family:monospace;
  color:#d5dfc6;
`;

document.body.appendChild(computerScreen);

function getScrapCounts() {
  const counts = {
    common: 0,
    rare: 0,
    epic: 0
  };

  for (const item of moonSurface.scraps.inventory) {
    if (counts[item.rarity] !== undefined) {
      counts[item.rarity]++;
    }
  }

  return counts;
}

function openComputer() {
  if (
    gameOver ||
    sleeping ||
    sleepConfirmationOpen ||
    launchConfirmationOpen || isGaugeChallengeActive() || earthBase.isOpen() || planetLog.isOpen() || skillMenu.isOpen() ||
    moonSurface.scraps.inventoryOpen
  ) return;

  computerOpen = true;
  computerPage = 'home';

  onFoot.clearKeys();
  moonSurface.clearKeys();

  computerScreen.style.display = 'flex';

  renderComputer();
}

function closeComputer() {
  computerOpen = false;
  computerScreen.style.display = 'none';

  onFoot.clearKeys();
  moonSurface.clearKeys();
}

function renderComputer() {
  const scraps = moonSurface.scraps;
  const counts = getScrapCounts();

  const credits = scraps.credits ?? 0;
  const totalItems = scraps.inventory.length;
  const totalValue = scraps.getInventoryValue();

  const flashlightLevel = survival.flashlightLevel;
  const flashlightMaxed = flashlightLevel >= FLASHLIGHT_MAX_LEVEL;
  const flashlightPrice = flashlightMaxed
    ? 0
    : FLASHLIGHT_PRICES[flashlightLevel];

  let content = '';

  if (computerPage === 'home') {
    content = `
      <div style="
        color:#9eae8e;
        font-size:11px;
        letter-spacing:3px;
        margin-bottom:12px;
      ">SHIP SYSTEM TERMINAL</div>

      <h1 style="
        margin:0 0 12px;
        font-size:28px;
        letter-spacing:4px;
        color:#dce8c9;
      ">MARKETPLACE</h1>

      <p style="color:#899382;font-size:12px;margin-bottom:30px">
        SPEND THE SCRAPS YOU COLLECT
      </p>

      <div style="
        background:#111814;
        border:1px solid #465447;
        padding:14px;
        margin-bottom:24px;
        color:#c7d5ae;
        font-size:14px;
      ">YOUR SCRAPS: ${credits}</div>

      <div style="display:flex;flex-direction:column;gap:12px">
        <button id="computer-sell" class="computer-button">
          MARTIAL ARTS SKILLS
        </button>

        <button id="computer-buy" class="computer-button">
          BUY ITEMS
        </button>

        <button id="computer-close" class="computer-button secondary">
          CLOSE TERMINAL
        </button>
      </div>
    `;
  } else if (computerPage === 'sell') {
    content = `
      <div style="
        color:#9eae8e;
        font-size:11px;
        letter-spacing:3px;
        margin-bottom:12px;
      ">RESOURCE EXCHANGE</div>

      <h1 style="
        margin:0 0 10px;
        font-size:26px;
        letter-spacing:4px;
      ">SELL SCRAPS</h1>

      <p style="color:#899382;font-size:12px;margin-bottom:24px">
        YOUR CURRENT INVENTORY
      </p>

      <div style="
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:10px;
        margin-bottom:18px;
        text-align:left;
      ">
        <div class="computer-item">
          <span style="color:#b8b9ae">COMMON</span>
          <strong>${counts.common}</strong>
          <small>10 credits each</small>
        </div>

        <div class="computer-item">
          <span style="color:#71b9e8">RARE</span>
          <strong>${counts.rare}</strong>
          <small>25 credits each</small>
        </div>

        <div class="computer-item">
          <span style="color:#c18aff">EPIC</span>
          <strong>${counts.epic}</strong>
          <small>75 credits each</small>
        </div>

        <div class="computer-item">
          <span style="color:#c7d5ae">TOTAL</span>
          <strong>${totalItems}</strong>
          <small>scrap items</small>
        </div>
      </div>

      <div style="
        background:#111814;
        border:1px solid #465447;
        padding:14px;
        margin-bottom:20px;
        font-size:14px;
      ">
        TOTAL SALE VALUE:
        <strong style="color:#c7e49b">${totalValue} CREDITS</strong>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px">
        <button
          id="computer-sell-all"
          class="computer-button"
          ${totalItems === 0 ? 'disabled' : ''}
        >
          SELL ALL SCRAPS
        </button>

        <button id="computer-back" class="computer-button secondary">
          BACK
        </button>
      </div>
    `;
  } else {
    content = `
      <div style="
        color:#9eae8e;
        font-size:11px;
        letter-spacing:3px;
        margin-bottom:12px;
      ">SHIP SUPPLY STORE</div>

      <h1 style="
        margin:0 0 15px;
        font-size:26px;
        letter-spacing:4px;
      ">BUY SUPPLIES</h1>

      <div style="
        display:flex;
        flex-direction:column;
        gap:12px;
        margin-bottom:20px;
      ">
        <div class="computer-item">
          <span style="color:#d5b66b">SHIP FUEL</span>
          <strong>${Math.round(survival.fuel / survival.maxFuel * 100)}%</strong>
          <small>+20 FUEL · 30 SCRAPS</small>
          <button
            id="buy-fuel"
            class="computer-button"
            ${survival.fuel >= survival.maxFuel || credits < 30 ? 'disabled' : ''}
          >
            PURCHASE FUEL
          </button>
        </div>

        <div class="computer-item">
          <span style="color:#77b9d4">SHIP OXYGEN</span>
          <strong>${Math.round(survival.shipOxygen)}%</strong>
          <small>+20% OXYGEN · 30 SCRAPS</small>
          <button
            id="buy-oxygen"
            class="computer-button"
            ${survival.shipOxygen >= 100 || credits < 30 ? 'disabled' : ''}
          >
            PURCHASE OXYGEN
          </button>
        </div>

        <div class="computer-item">
          <span style="color:#c66c60">HULL REPAIR</span>
          <strong>${Math.round(hull)} / ${hullMax}</strong>
          <small>+${HULL_REPAIR_AMOUNT} HULL · ${HULL_REPAIR_PRICE} SCRAPS</small>
          <button
            id="buy-repair"
            class="computer-button"
            ${hull >= hullMax || credits < HULL_REPAIR_PRICE ? 'disabled' : ''}
          >
            REPAIR HULL
          </button>
        </div>

        <div class="computer-item">
          <span style="color:#f2e6a6">
            ${flashlightLevel === 0 ? 'FLASHLIGHT' : 'FLASHLIGHT UPGRADE'}
          </span>
          <strong>LEVEL ${flashlightLevel} / ${FLASHLIGHT_MAX_LEVEL}</strong>
          <small>
            ${flashlightMaxed
              ? `MAXIMUM LEVEL · BEAM ${BEAM_BASE_LENGTH + flashlightLevel * BEAM_LENGTH_PER_LEVEL}`
              : `LEVEL ${flashlightLevel + 1}: BEAM ${flashlightLevel === 0 ? 0 : BEAM_BASE_LENGTH + flashlightLevel * BEAM_LENGTH_PER_LEVEL} → ${BEAM_BASE_LENGTH + (flashlightLevel + 1) * BEAM_LENGTH_PER_LEVEL} · F TO TOGGLE · ${flashlightPrice} SCRAPS`}
          </small>
          <small style="color:#6f786c">
            LV1 ${BEAM_BASE_LENGTH + BEAM_LENGTH_PER_LEVEL} · LV2 ${BEAM_BASE_LENGTH + 2 * BEAM_LENGTH_PER_LEVEL} · LV3 ${BEAM_BASE_LENGTH + 3 * BEAM_LENGTH_PER_LEVEL} · LV4 ${BEAM_BASE_LENGTH + 4 * BEAM_LENGTH_PER_LEVEL}
          </small>
          <button
            id="buy-flashlight"
            class="computer-button"
            ${flashlightMaxed || credits < flashlightPrice ? 'disabled' : ''}
          >
            ${flashlightMaxed
              ? 'FULLY UPGRADED'
              : flashlightLevel === 0 ? 'BUY FLASHLIGHT (LEVEL 1)' : `UPGRADE TO LEVEL ${flashlightLevel + 1}`}
          </button>
        </div>

        <div class="computer-item">
          <span style="color:#c66c60">MED KIT</span>
          <strong>${survival.medkits} / ${MEDKIT_MAX}</strong>
          <small>+${MEDKIT_HEAL} HEALTH · PRESS H TO USE · ${MEDKIT_PRICE} SCRAPS</small>
          <button
            id="buy-medkit"
            class="computer-button"
            ${survival.medkits >= MEDKIT_MAX || credits < MEDKIT_PRICE ? 'disabled' : ''}
          >
            ${survival.medkits >= MEDKIT_MAX ? 'CARRYING MAXIMUM' : 'BUY MED KIT'}
          </button>
        </div>

      </div>

      <div style="
        color:#c7d5ae;
        font-size:13px;
        margin-bottom:18px;
      ">
        YOUR SCRAPS: ${credits}
      </div>

      <button id="computer-back" class="computer-button secondary">
        BACK
      </button>
    `;
  }

  computerScreen.innerHTML = `
    <style>
      .computer-panel {
        width:min(490px,92vw);
        max-height:90vh;
        overflow-y:auto;
        padding:30px;
        background:#18211c;
        border:1px solid #65765d;
        box-shadow:0 20px 80px #000;
        text-align:center;
      }

      .computer-button {
        width:100%;
        padding:14px;
        background:#52664c;
        color:#e3ecd8;
        border:1px solid #94a984;
        font:bold 13px monospace;
        letter-spacing:2px;
        cursor:pointer;
      }

      .computer-button:hover:not(:disabled) {
        background:#6b805e;
      }

      .computer-button:disabled {
        opacity:.35;
        cursor:not-allowed;
      }

      .computer-button.secondary {
        background:#252d28;
        border-color:#505b50;
        color:#b8c0b2;
      }

      .computer-item {
        display:flex;
        flex-direction:column;
        gap:8px;
        padding:13px;
        background:#111814;
        border:1px solid #3c493e;
      }

      .computer-item strong {
        font-size:23px;
        color:#dce8c9;
      }

      .computer-item small {
        color:#899382;
        font-size:10px;
      }
    </style>

    <div class="computer-panel">
      ${content}

      <div style="
        margin-top:22px;
        color:#687465;
        font-size:10px;
        letter-spacing:2px;
      ">
        STARFALL · SHIP TERMINAL
      </div>

      <div style="
        margin-top:8px;
        color:#596456;
        font-size:10px;
      ">
        PRESS ESC TO CLOSE
      </div>
    </div>
  `;

  const sellButton = computerScreen.querySelector('#computer-sell');
  const buyButton = computerScreen.querySelector('#computer-buy');
  const closeButton = computerScreen.querySelector('#computer-close');
  const backButton = computerScreen.querySelector('#computer-back');
  const sellAllButton = computerScreen.querySelector('#computer-sell-all');
  const buyFuelButton = computerScreen.querySelector('#buy-fuel');
  const buyOxygenButton = computerScreen.querySelector('#buy-oxygen');
  const buyRepairButton = computerScreen.querySelector('#buy-repair');
  const buyFlashlightButton = computerScreen.querySelector('#buy-flashlight');

  if (sellButton) {
    // Scrap no longer needs selling: this button opens the skills menu.
    sellButton.addEventListener('click', () => {
      closeComputer();
      skillMenu.toggle();
    });
  }

  if (buyButton) {
    buyButton.addEventListener('click', () => {
      computerPage = 'buy';
      renderComputer();
    });
  }

  if (closeButton) {
    closeButton.addEventListener('click', closeComputer);
  }

  if (backButton) {
    backButton.addEventListener('click', () => {
      computerPage = 'home';
      renderComputer();
    });
  }

  if (sellAllButton) {
    sellAllButton.addEventListener('click', () => {
      if (scraps.inventory.length === 0) return;

      scraps.sellAll();
      computerPage = 'sell';
      renderComputer();
    });
  }

  if (buyFuelButton) {
    buyFuelButton.addEventListener('click', () => {
      if (survival.buyFuel(scraps)) {
        renderComputer();
      }
    });
  }

  if (buyOxygenButton) {
    buyOxygenButton.addEventListener('click', () => {
      if (survival.buyOxygen(scraps)) {
        renderComputer();
      }
    });
  }

  const buyMedkitButton = computerScreen.querySelector('#buy-medkit');
  const buyWeaponButton = computerScreen.querySelector('#buy-weapon');

  if (buyMedkitButton) {
    buyMedkitButton.addEventListener('click', () => {
      if (survival.medkits >= MEDKIT_MAX || scraps.credits < MEDKIT_PRICE) return;

      scraps.credits -= MEDKIT_PRICE;
      survival.medkits += 1;
      renderComputer();
    });
  }


  if (buyRepairButton) {
    buyRepairButton.addEventListener('click', () => {
      if (hull >= hullMax || scraps.credits < HULL_REPAIR_PRICE) return;

      scraps.credits -= HULL_REPAIR_PRICE;
      hull = Math.min(hullMax, hull + HULL_REPAIR_AMOUNT);

      updateHull();
      renderComputer();
    });
  }

  if (buyFlashlightButton) {
    buyFlashlightButton.addEventListener('click', () => {
      if (flashlightMaxed || scraps.credits < flashlightPrice) return;

      scraps.credits -= flashlightPrice;
      survival.flashlightLevel += 1;
      survival.flashlightOn = true; // Ready to use right away.

      applyFlashlight();
      renderComputer();
    });
  }
}

// HULL SYSTEM
function updateHull() {
  hullDisplay.textContent =
    `HULL INTEGRITY: ${Math.round(hull)} / ${hullMax}`;

  hullDisplay.style.color =
    hull <= hullMax * 0.3 ? '#e45d4c' : '#d5d0c5';

  hullDisplay.style.borderColor =
    hull <= hullMax * 0.3 ? '#a33d32' : '#555';

  const hullValue = document.querySelector('#hull-value');
  const hullMeter = document.querySelector('#hull-meter');

  // The HUD label next to this number is "%", so show a percentage.
  if (hullValue) {
    hullValue.textContent = Math.round(hull / hullMax * 100);
    hullValue.style.color = hull <= hullMax * 0.3 ? '#e45d4c' : '';
  }

  if (hullMeter) {
    hullMeter.style.width =
      `${Math.max(0, Math.min(100, hull / hullMax * 100))}%`;
  }

  if (hull <= 0 && !gameOver) {
    hull = 0;
    gameOver = true;

    ship.vx = 0;
    ship.vy = 0;
    ship.boosting = false;

    closeComputer();
    gameOverScreen.style.display = 'flex';
  }
}

// MODULE EFFECTS
function updateModuleEffects(adjustHull = true) {
  const previousMax = hullMax;

  moduleStats = partsSystem.getStats();

  ship.moduleStats = moduleStats;
  survival.maxFuel = moduleStats.maxFuel;

  hullMax = moduleStats.maxHull;

  // Preserve current hull while adding the extra module capacity.
  if (adjustHull && hullMax > previousMax) {
    hull += hullMax - previousMax;
  }

  hull = Math.min(hull, hullMax);

  const rarity = partsSystem.getStats().shipRarity;

  shipSprite =
    assets[`ship_space_${rarity}`] ||
    assets.ship_space_common;

  // The landed ship on the Moon uses the matching "closed" sprite.
  moonSurface.shipSprite =
    assets[`ship_moon_${rarity}`] ||
    assets.ship_moon_common;

  updateHull();
}

window.addEventListener('nasareth:modules-changed', () => {
  updateModuleEffects();

  // All modules on the Moon collected -> chest detector (Moon only).
  if (PLANETS[landedPlanet].chestQuest) {
    chestQuest.checkModules();
  }
});

updateModuleEffects(false);

// LIFE SUPPORT GAME OVER
function triggerLifeSupportFailure(
  title = 'LIFE SUPPORT FAILED',
  detail = 'SUIT OXYGEN: 0%'
) {
  if (gameOver) return;

  gameOver = true;

  ship.vx = 0;
  ship.vy = 0;
  ship.boosting = false;

  closeComputer();

  gameOverScreen.querySelector('div').textContent = title;
  gameOverScreen.querySelector('div').style.color = '#77b9d4';
  gameOverScreen.children[1].textContent = detail;
  gameOverScreen.children[2].textContent = 'MISSION FAILED';

  gameOverScreen.style.display = 'flex';
}

// SLEEP SYSTEM
function updateSleepButtons() {
  const yes = document.querySelector('#sleep-yes');
  const no = document.querySelector('#sleep-no');

  yes.style.outline =
    sleepSelection === 0 ? '2px solid #d6e3b8' : 'none';

  no.style.outline =
    sleepSelection === 1 ? '2px solid #d6e3b8' : 'none';
}

function openSleepConfirmation() {
  if (sleeping || sleepConfirmationOpen || gameOver) return;

  sleepConfirmationOpen = true;
  sleepSelection = 0;
  onFoot.clearKeys();

  sleepConfirm.style.display = 'flex';
  updateSleepButtons();
}

function closeSleepConfirmation() {
  sleepConfirmationOpen = false;
  sleepConfirm.style.display = 'none';
  onFoot.clearKeys();
}

function beginSleep(isForced = false) {
  if (sleeping || gameOver) return;

  closeSleepConfirmation();

  // Forced sleep (2 AM) can happen while a menu is open. Close them.
  closeLaunchConfirmation();
  closeComputer();
  moonSurface.scraps.closeInventory();

  // Remember where the player was, so they wake up in the same place.
  modeBeforeSleep = gameMode;

  sleeping = true;
  forcedSleep = isForced;
  sleepTimer = 3.5;
  gameMode = 'sleeping';

  ship.vx = 0;
  ship.vy = 0;
  ship.boosting = false;

  onFoot.clearKeys();
  sleepScreen.style.display = 'flex';

  document.querySelector('#sleep-title').textContent =
    isForced ? 'SLEEP REQUIRED' : 'RESTING';

  document.querySelector('#sleep-description').textContent =
    'WAKING UP AT 07:00 AM';
}

function finishSleep() {
  sleeping = false;
  forcedSleep = false;
  sleepTimer = 0;

  gameMinutes = 7 * 60;
  clockAccumulator = 0;

  // A night's rest heals the player (otherwise health could never recover).
  survival.health = 100;
  survival.stamina = 100;
  survival.staminaExhausted = false;

  updateClockDisplay();
  sleepScreen.style.display = 'none';

  // Wake up where the player fell asleep.
  gameMode = modeBeforeSleep;

  if (gameMode === 'walking') {
    onFoot.enter();
  } else if (gameMode === 'moon') {
    moonSurface.clearKeys();
  }

  onFoot.clearKeys();
  heldKeys.clear();

  // A new day: fresh SCRAP on the loaded planet, and on other planets
  // the next time you land there. Modules are NOT reset: the modules
  // lying on each planet (and which ones you collected) stay as they were.
  moonSurface.scraps.respawn(PLANETS[landedPlanet]);

  for (const state of Object.values(planetStates)) {
    state.scrapItems = null; // regenerated on the next landing
  }

  crawlers.respawn(moonSurface.x, moonSurface.y);
  marsMonsters.respawn(moonSurface.x, moonSurface.y);
  europaMonsters.respawn(moonSurface.x, moonSurface.y);

  showTransmission(
    'LONG-RANGE SCAN COMPLETE\n' +
    'NEW SALVAGE DETECTED ON THE MOON',
    '#8bd0b7'
  );

  console.log('Good morning. It is 7 AM.');
}

document.querySelector('#sleep-yes').addEventListener('click', () => {
  beginSleep(false);
});

document.querySelector('#sleep-no').addEventListener('click', () => {
  closeSleepConfirmation();
});

window.addEventListener('keydown', (event) => {
  if (!sleepConfirmationOpen) return;

  const key = event.key.toLowerCase();

  if (key === 'arrowleft' || key === 'arrowup') {
    event.preventDefault();
    sleepSelection = 0;
    updateSleepButtons();
  } else if (key === 'arrowright' || key === 'arrowdown') {
    event.preventDefault();
    sleepSelection = 1;
    updateSleepButtons();
  } else if (key === 'enter') {
    event.preventDefault();

    if (sleepSelection === 0) beginSleep(false);
    else closeSleepConfirmation();
  } else if (key === 'y') {
    event.preventDefault();
    beginSleep(false);
  } else if (key === 'n' || key === 'escape') {
    event.preventDefault();
    // Stop the pause-menu Escape handler from also running.
    event.stopImmediatePropagation();
    closeSleepConfirmation();
  }
});

// IN-GAME LAUNCH CONFIRMATION
const launchConfirm = document.createElement('div');

launchConfirm.style.cssText = `
  position:fixed;
  inset:0;
  z-index:85;
  display:none;
  align-items:center;
  justify-content:center;
  background:rgba(0,0,0,.78);
  font-family:monospace;
  text-align:center;
`;

launchConfirm.innerHTML = `
  <div style="
    width:min(420px,90vw);
    padding:28px;
    background:#151a18;
    border:1px solid #89917b;
    box-shadow:0 15px 60px #000;
  ">
    <div id="launch-title" style="color:#d5dfb4;font-size:20px;letter-spacing:3px">
      DEPART THE MOON?
    </div>
    <p id="launch-text" style="color:#aaa;font-size:12px;line-height:1.8">
      Launch the spaceship and leave the surface?
    </p>
    <div style="display:flex;justify-content:center;gap:14px;margin-top:24px">
      <button id="launch-yes" style="
        padding:11px 24px;background:#68775e;color:white;
        border:1px solid #aab99b;font:14px monospace;cursor:pointer;
      ">YES</button>
      <button id="launch-no" style="
        padding:11px 24px;background:#252927;color:#ccc;
        border:1px solid #555;font:14px monospace;cursor:pointer;
      ">NO</button>
    </div>
    <div style="margin-top:18px;color:#858b7e;font-size:10px">
      ← → SELECT · ENTER CONFIRM · Y / N
    </div>
  </div>
`;

document.body.appendChild(launchConfirm);

function updateLaunchButtons() {
  const yes = document.querySelector('#launch-yes');
  const no = document.querySelector('#launch-no');

  yes.style.outline =
    launchSelection === 0 ? '2px solid #d6e3b8' : 'none';

  no.style.outline =
    launchSelection === 1 ? '2px solid #d6e3b8' : 'none';
}

function openLaunchConfirmation() {
  if (launchConfirmationOpen || isGaugeChallengeActive() || earthBase.isOpen() || planetLog.isOpen() || skillMenu.isOpen() || gameOver || sleeping) return;

  launchConfirmationOpen = true;
  launchSelection = 0;
  onFoot.clearKeys();

  // "DEPART THE MOON?" / "DEPART MARS?"
  const planetName = PLANETS[landedPlanet].name;
  launchConfirm.querySelector('#launch-title').textContent =
    `DEPART ${planetName}?`;

  launchConfirm.style.display = 'flex';
  updateLaunchButtons();
}

function closeLaunchConfirmation() {
  launchConfirmationOpen = false;
  launchConfirm.style.display = 'none';
  onFoot.clearKeys();
}

function confirmLaunch() {
  closeLaunchConfirmation();

  // Back into space next to the planet we were on.
  const body = world[landedPlanet] || world.moon;

  ship.x = body.x + body.radius + 170;
  ship.y = body.y;
  ship.vx = 0;
  ship.vy = 0;
  ship.boosting = false;
  ship.angle = -Math.PI / 2;

  landedOnMoon = false;
  gameMode = 'driving';
  minimapOpen = false;

  console.log('Departed from the Moon');
}

document.querySelector('#launch-yes').addEventListener('click', confirmLaunch);
document.querySelector('#launch-no').addEventListener('click', closeLaunchConfirmation);

window.addEventListener('keydown', (event) => {
  if (!launchConfirmationOpen) return;

  const key = event.key.toLowerCase();

  if (key === 'arrowleft' || key === 'arrowup') {
    event.preventDefault();
    launchSelection = 0;
    updateLaunchButtons();
  } else if (key === 'arrowright' || key === 'arrowdown') {
    event.preventDefault();
    launchSelection = 1;
    updateLaunchButtons();
  } else if (key === 'enter') {
    event.preventDefault();

    if (launchSelection === 0) confirmLaunch();
    else closeLaunchConfirmation();
  } else if (key === 'y') {
    event.preventDefault();
    confirmLaunch();
  } else if (key === 'n' || key === 'escape') {
    event.preventDefault();
    // Stop the pause-menu Escape handler from also running.
    event.stopImmediatePropagation();
    closeLaunchConfirmation();
  }
});

// GLOBAL INVENTORY KEY
window.addEventListener('keydown', (event) => {
  if (
    paused ||
    isTypingTarget(event) ||
    gameOver ||
    sleeping ||
    sleepConfirmationOpen ||
    launchConfirmationOpen || isGaugeChallengeActive() || earthBase.isOpen() || planetLog.isOpen() || skillMenu.isOpen() ||
    computerOpen
  ) return;

  if (event.code === 'KeyB' && !event.repeat) {
    event.preventDefault();

    moonSurface.scraps.toggleInventory();

    if (moonSurface.scraps.inventoryOpen) {
      onFoot.clearKeys();
      moonSurface.clearKeys();
    }
  } else if (
    event.key === 'Escape' &&
    moonSurface.scraps.inventoryOpen
  ) {
    event.preventDefault();
    // Stop the pause-menu Escape handler from also running.
    event.stopImmediatePropagation();
    moonSurface.scraps.closeInventory();
    onFoot.clearKeys();
    moonSurface.clearKeys();
  }
});

// METAL DETECTOR KEY
window.addEventListener('keydown', (event) => {
  if (
    event.code !== 'KeyQ' ||
    event.repeat ||
    paused ||
    isTypingTarget(event) ||
    gameMode !== 'moon' ||
    gameOver ||
    sleeping ||
    computerOpen ||
    moonSurface.scraps.inventoryOpen ||
    launchConfirmationOpen || isGaugeChallengeActive() || earthBase.isOpen() || planetLog.isOpen() || skillMenu.isOpen() ||
    sleepConfirmationOpen
  ) return;

  survival.detectorOn = !survival.detectorOn;
  survival.detectorFlash = 0;
  survival.detectorLit = false;
});

// MED KIT KEY (H): on a planet or inside the ship.
window.addEventListener('keydown', (event) => {
  if (
    event.code !== 'KeyH' ||
    event.repeat ||
    paused ||
    isTypingTarget(event) ||
    (gameMode !== 'moon' && gameMode !== 'walking') ||
    gameOver ||
    sleeping ||
    computerOpen ||
    moonSurface.scraps.inventoryOpen ||
    launchConfirmationOpen || isGaugeChallengeActive() || earthBase.isOpen() || planetLog.isOpen() || skillMenu.isOpen() ||
    sleepConfirmationOpen
  ) return;

  let text;

  if (survival.medkits <= 0) text = 'NO MED KITS · BUY THEM AT THE SHIP COMPUTER';
  else if (survival.health >= 100) text = 'HEALTH ALREADY FULL';
  else {
    useMedkit();
    text = `MED KIT USED · HEALTH ${Math.round(survival.health)}% · ${survival.medkits} LEFT`;
  }

  if (gameMode === 'moon') showMoonMessage(text);
  else showTransmission(text, '#c66c60');
});

// FLASHLIGHT KEY (Moon only)
window.addEventListener('keydown', (event) => {
  if (
    event.code !== 'KeyF' ||
    event.repeat ||
    paused ||
    isTypingTarget(event) ||
    gameMode !== 'moon' ||
    gameOver ||
    sleeping ||
    computerOpen ||
    moonSurface.scraps.inventoryOpen ||
    launchConfirmationOpen || isGaugeChallengeActive() || earthBase.isOpen() || planetLog.isOpen() || skillMenu.isOpen() ||
    sleepConfirmationOpen
  ) return;

  if (survival.flashlightLevel <= 0) {
    showMoonMessage('NO FLASHLIGHT · BUY ONE AT THE SHIP COMPUTER');
    return;
  }

  survival.flashlightOn = !survival.flashlightOn;
  applyFlashlight();

  showMoonMessage(survival.flashlightOn ? 'FLASHLIGHT ON' : 'FLASHLIGHT OFF');
});

// COMPUTER CLOSE KEY
window.addEventListener('keydown', (event) => {
  if (!computerOpen) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeComputer();
  }
});

// MAP KEY
window.addEventListener('keydown', (event) => {
  if (
    event.code !== 'KeyM' ||
    event.repeat ||
    paused ||
    isTypingTarget(event) ||
    moonSurface.scraps.inventoryOpen ||
    computerOpen ||
    gameOver ||
    sleeping ||
    launchConfirmationOpen || isGaugeChallengeActive() || earthBase.isOpen() || planetLog.isOpen() || skillMenu.isOpen() ||
    sleepConfirmationOpen
  ) return;

  if (gameMode === 'driving') {
    minimapOpen = !minimapOpen;
  } else if (gameMode === 'moon') {
    moonSurface.toggleMap();
  } else {
    return;
  }

  event.preventDefault();
});

// ==========================================
// EARTH LAUNCH AND MOON LANDING (GAUGE CHALLENGES)
// ==========================================

// Hull damage for each failed gauge attempt.
const LAUNCH_FAIL_DAMAGE = 10;
const LANDING_FAIL_DAMAGE = 8;

// Moon landing: 3 successful burns needed within 10 attempts.
const LANDING_REQUIRED = 3;
const LANDING_MAX_ATTEMPTS = 10;

// false until the player has launched from Earth (new game).
let launchComplete = false;

function damageHullFromChallenge(amount) {
  hull = Math.max(0, hull - amount);
  shake = 12;
  updateHull(); // Shows the game-over screen if the hull reaches 0.
}

function startEarthLaunch() {
  if (isGaugeChallengeActive() || gameOver) return;

  // Sit on the launch pad above Earth, pointing up.
  ship.x = world.earth.x;
  ship.y = world.earth.y - world.earth.radius - 45;
  ship.vx = 0;
  ship.vy = 0;
  ship.angle = -Math.PI / 2;
  ship.boosting = false;
  gameMode = 'driving';

  runGaugeChallenge({
    kicker: 'EARTH · LAUNCH CONTROL',
    title: 'LAUNCH THE ROCKET',
    required: 1,
    maxAttempts: Infinity,
    fillSeconds: 1.5,
    zoneSize: Math.min(28, 16 * (moduleStats.landingAssist || 1)),
    onAttempt(success) {
      if (!success) damageHullFromChallenge(LAUNCH_FAIL_DAMAGE);
      return !gameOver;
    }
  }).then(result => {
    if (!result.success) return;

    launchComplete = true;

    // Lift-off: push the rocket away from Earth.
    ship.angle = -Math.PI / 2;
    // No air resistance: the rocket keeps drifting until you steer or brake.
    ship.vy = -90;
    heldKeys.clear();

    showTransmission(
      'LIFT-OFF CONFIRMED\n' +
      'COURSE SET FOR THE MOON · PRESS M FOR MAP',
      '#8bd0b7'
    );
  });
}

// planetId = 'moon' or 'mars'. Same landing gauge for every planet.
function startMoonLanding(planetId = 'moon') {
  if (isGaugeChallengeActive() || gameOver) return;

  const planet = PLANETS[planetId];
  const body = world[planetId];

  ship.vx = 0;
  ship.vy = 0;
  ship.boosting = false;
  minimapOpen = false;

  runGaugeChallenge({
    kicker: `${planet.name} APPROACH · DESCENT BURNS`,
    title: `LAND ON ${planet.name}`,
    required: LANDING_REQUIRED,
    maxAttempts: LANDING_MAX_ATTEMPTS,
    // Each planet has its own difficulty (Mars: faster, tighter zone).
    fillSeconds: planet.landing?.fillSeconds || 1.25,
    zoneSize: Math.min(24, (planet.landing?.zoneSize || 13) * (moduleStats.landingAssist || 1)),
    onAttempt(success) {
      if (!success) damageHullFromChallenge(LANDING_FAIL_DAMAGE);
      return !gameOver;
    }
  }).then(result => {
    heldKeys.clear();

    if (result.aborted || gameOver) return;

    if (!result.success) {
      showTransmission(
        'LANDING ABORTED\n' +
        'TOO MANY FAILED BURNS · RETURNING TO ORBIT\n' +
        'PRESS E TO TRY AGAIN',
        '#e18b58'
      );
      return;
    }

    // LANDED: load this planet's surface.
    ship.x = body.x;
    ship.y = body.y;
    ship.vx = 0;
    ship.vy = 0;
    ship.boosting = false;

    switchPlanet(planetId);
    resetSurfaceUi();

    landedOnMoon = true;
    gameMode = 'moon';
    moonSurface.enter();

    console.log(`Landed on ${planet.name}`);
  });
}

// MODE SWITCHING AND INTERACTION
window.addEventListener('keydown', (event) => {
  if (
    event.code !== 'KeyE' ||
    event.repeat ||
    paused ||
    isTypingTarget(event) ||
    gameOver ||
    sleeping ||
    sleepConfirmationOpen ||
    launchConfirmationOpen || isGaugeChallengeActive() || earthBase.isOpen() || planetLog.isOpen() || skillMenu.isOpen() ||
    computerOpen ||
    moonSurface.scraps.inventoryOpen
  ) return;

  event.preventDefault();

  if (gameMode === 'driving') {
    // Which planet (if any) is close enough to land on?
    const nearPlanet = ['earth', 'moon', 'mars', 'europa', 'titan'].find(id => {
      const body = world[id];
      return body && Math.hypot(body.x - ship.x, body.y - ship.y) <= body.radius + 125;
    });

    if (MAP_SOURCES[nearPlanet] && !chestQuest.getState().maps[nearPlanet]) {
      // Hidden destinations need the star map from the previous chest.
      showTransmission(
        'NAVIGATION DATA MISSING\n' +
        `${PLANETS[nearPlanet].name} LANDING REQUIRES THE ${PLANETS[nearPlanet].name} STAR MAP\n` +
        `FIND THE CHEST ON ${MAP_SOURCES[nearPlanet]}`,
        '#d0704a'
      );
    } else if (nearPlanet === 'earth') {
      // EARTH: land at the shipyard to repair and refit.
      startEarthLanding();
    } else if (nearPlanet) {
      // LAND: the landing gauge must be passed first.
      startMoonLanding(nearPlanet);
    } else {
      // ENTER SHIP INTERIOR.
      gameMode = 'walking';
      minimapOpen = false;

      ship.vx = 0;
      ship.vy = 0;
      ship.boosting = false;

      onFoot.enter();

      console.log('Entered spaceship interior');
    }
  } else if (gameMode === 'moon') {
    // ENTER SHIP FROM THE MOON.
    if (moonSurface.canEnterShip()) {
      moonSurface.clearKeys();
      survival.refillSuit();
      onFoot.enter();
      gameMode = 'walking';

      console.log('Entered spaceship from the Moon');
    }
  } else if (gameMode === 'walking') {
    // USE THE COMPUTER.
    if (onFoot.canUseComputer()) {
      openComputer();
    } else if (onFoot.canExit()) {
      // EXIT THE INTERIOR.
      onFoot.clearKeys();

      if (landedOnMoon) {
        gameMode = 'moon';
        moonSurface.enter();

        console.log('Exited onto the Moon surface');
      } else {
        gameMode = 'driving';

        console.log('Exited spaceship interior');
      }
    } else if (onFoot.canDrive()) {
      // USE THE PILOT SEAT.
      if (landedOnMoon) {
        openLaunchConfirmation();
      } else {
        gameMode = 'driving';
        onFoot.clearKeys();

        console.log('Entered driving mode');
      }
    } else if (onFoot.canSleep()) {
      openSleepConfirmation();
    }
  }
});

// EXPLOSION PARTICLES
function createExplosion(x, y) {
  for (let i = 0; i < 45; i++) {
    const angle = Math.random() * Math.PI * 2;
    const force = 50 + Math.random() * 200;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * force,
      vy: Math.sin(angle) * force,
      life: 0.4 + Math.random() * 0.7,
      maxLife: 1.1,
      size: 2 + Math.random() * 4,
      color: Math.random() > 0.4 ? '#e28a45' : '#d5c4a1'
    });
  }

  for (let i = 0; i < 14; i++) {
    const angle = Math.random() * Math.PI * 2;
    const force = 30 + Math.random() * 110;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * force,
      vy: Math.sin(angle) * force,
      life: 0.8 + Math.random() * 0.8,
      maxLife: 1.6,
      size: 4 + Math.random() * 5,
      color: '#51483e'
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    p.vx *= Math.pow(0.15, dt);
    p.vy *= Math.pow(0.15, dt);

    p.life -= dt;

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }

  for (const [id, time] of collisionCooldowns) {
    const remaining = time - dt;

    if (remaining <= 0) collisionCooldowns.delete(id);
    else collisionCooldowns.set(id, remaining);
  }

  shake = Math.max(0, shake - dt * 35);
  impactFlash = Math.max(0, impactFlash - dt * 3);
  impactMessageTimer = Math.max(0, impactMessageTimer - dt);
}

// DRAW EFFECTS
function drawParticles(context) {
  context.save();

  context.beginPath();
  context.arc(width / 2, height / 2, 340, 0, Math.PI * 2);
  context.clip();

  for (const p of particles) {
    context.globalAlpha = Math.max(0, p.life / p.maxLife);
    context.fillStyle = p.color;

    context.fillRect(
      Math.floor(p.x),
      Math.floor(p.y),
      Math.ceil(p.size),
      Math.ceil(p.size)
    );
  }

  context.globalAlpha = 1;

  if (impactFlash > 0) {
    context.fillStyle = `rgba(255,190,110,${impactFlash * 0.35})`;
    context.beginPath();
    context.arc(width / 2, height / 2, 340, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();

  if (impactMessageTimer > 0) {
    context.save();
    context.globalAlpha = Math.min(1, impactMessageTimer);
    context.fillStyle = '#e18b58';
    context.textAlign = 'center';
    context.font = 'bold 16px monospace';

    context.fillText(
      '!! COLLISION DETECTED !!',
      width / 2,
      height / 2 + 100
    );

    context.restore();
  }
}
function getNearestDetectorTargets() {
  const x = moonSurface.x;
  const y = moonSurface.y;

  // Find nearest scrap.
  const nearestScrap =
    moonSurface.scraps.getNearestUncollected(x, y);

  // Find nearest spaceship module.
  const parts = partsSystem.getParts();

  let nearestModule = null;
  let nearestModuleDistance = Infinity;

  for (const part of parts.items) {
    if (part.collected) continue;

    const distance = Math.hypot(
      part.x - x,
      part.y - y
    );

    if (distance < nearestModuleDistance) {
      nearestModuleDistance = distance;
      nearestModule = {
        part,
        distance
      };
    }
  }

  return {
    scrap: nearestScrap,
    module: nearestModule
  };
}
// SURVIVAL EQUIPMENT DISPLAY
function drawSurvivalEquipment(context) {
  // METAL DETECTOR
  if (gameMode === 'moon' && survival.detectorOn) {
    const targets = getNearestDetectorTargets();

    const scrap = targets.scrap;
    const module = targets.module;

    context.save();

    // Chest line only once the chest detector has been earned.
    const hasChestDetector = chestQuest.getState().chestDetector;
    const panelHeight = hasChestDetector ? 107 : 83;

    // Shift right, next to the SHIP STATUS box (it used to hide the
    // bottom of this panel).
    context.translate(237, 0);

    // Detector panel.
    context.fillStyle = 'rgba(0,0,0,.88)';
    context.fillRect(18, 18, 230, panelHeight);

    context.strokeStyle = '#62665b';
    context.strokeRect(18, 18, 230, panelHeight);

    // Title.
    context.fillStyle = '#c5c9b8';
    context.font = 'bold 11px monospace';
    context.textAlign = 'left';

    context.fillText('METAL DETECTOR [Q]', 30, 37);

    // SCRAP SIGNAL.
    context.beginPath();
    context.arc(39, 57, 5, 0, Math.PI * 2);

    context.fillStyle =
      scrap && survival.detectorLit
        ? '#ff3028'
        : '#54201d';

    context.shadowColor = '#ff3028';
    context.shadowBlur =
      scrap && survival.detectorLit ? 12 : 0;

    context.fill();

    context.shadowBlur = 0;

    context.fillStyle = '#c5c9b8';
    context.font = '10px monospace';

    context.fillText(
      scrap
        ? `SCRAP: ${Math.round(scrap.distance)}m`
        : 'SCRAP: NO SIGNAL',
      53,
      61
    );

    // MODULE SIGNAL.
    context.beginPath();
    context.arc(39, 81, 5, 0, Math.PI * 2);

    context.fillStyle =
      module && survival.detectorLit
        ? '#ff3028'
        : '#54201d';

    context.shadowColor = '#ff3028';
    context.shadowBlur =
      module && survival.detectorLit ? 12 : 0;

    context.fill();

    context.shadowBlur = 0;

    context.fillStyle = '#c5c9b8';

    context.fillText(
      module
        ? `MODULE: ${Math.round(module.distance)}m`
        : 'MODULE: NO SIGNAL',
      53,
      85
    );

    // CHEST SIGNAL (gold light).
    if (hasChestDetector) {
      const chestDistance = currentChestDistance();
      const chestLit = chestDistance !== null && survival.detectorLit;

      context.beginPath();
      context.arc(39, 105, 5, 0, Math.PI * 2);
      context.fillStyle = chestLit ? '#f2d46f' : '#4d4120';
      context.shadowColor = '#f2d46f';
      context.shadowBlur = chestLit ? 12 : 0;
      context.fill();
      context.shadowBlur = 0;

      context.fillStyle = '#e0c78e';
      context.fillText(
        chestDistance !== null
          ? `CHEST: ${Math.round(chestDistance)}m`
          : chestQuest.isBeaten(landedPlanet) ? 'CHEST: OPENED' : 'CHEST: NO SIGNAL',
        53,
        109
      );
    }

    context.restore();
  }

  // SHIP FUEL AND OXYGEN TANKS
  if (gameMode === 'walking') {
    const tankY = height - 145;

    context.save();

    context.fillStyle = 'rgba(0,0,0,.78)';
    context.fillRect(width - 160, tankY - 12, 142, 118);

    context.strokeStyle = '#65705f';
    context.strokeRect(width - 160, tankY - 12, 142, 118);

    function drawTank(x, y, label, value, color) {
      const amount = Math.max(0, Math.min(100, value));

      context.fillStyle = '#c7cbbd';
      context.font = '10px monospace';
      context.textAlign = 'left';
      context.fillText(label, x, y);

      context.fillStyle = '#303a34';
      context.fillRect(x, y + 8, 112, 12);

      context.fillStyle = color;
      context.fillRect(x, y + 8, 112 * amount / 100, 12);

      context.fillStyle = '#d5d0c5';
      context.fillText(`${Math.round(amount)}%`, x + 116, y + 18);
    }

    drawTank(
      width - 148,
      tankY + 5,
      'FUEL TANK',
      survival.fuel / survival.maxFuel * 100,
      '#d5b66b'
    );

    drawTank(
      width - 148,
      tankY + 55,
      'OXYGEN TANK',
      survival.shipOxygen,
      '#77b9d4'
    );

    context.restore();
  }
}

// IMPACT
function handleImpact() {
  ship.vx = 0;
  ship.vy = 0;
  ship.boosting = false;

  createExplosion(width / 2, height / 2);

  shake = 16;
  impactFlash = 1;
  impactMessageTimer = 1.5;

  const damage = Math.floor(Math.random() * 11) + 10;
  hull = Math.max(0, hull - damage);

  updateHull();

  console.log(`COLLISION! -${damage}% HULL. Remaining: ${hull}%`);
}
// Shows a short message box in the middle-top of the screen.
// Use "\n" in the text for new lines.
function showTransmission(text, color = '#77b9d4') {
  const message = document.createElement('div');

  message.textContent = text;

  message.style.cssText = `
    position:fixed;
    top:25%;
    left:50%;
    transform:translateX(-50%);
    z-index:150;
    padding:20px 28px;
    background:rgba(10,18,22,.96);
    border:1px solid ${color};
    color:${color};
    font:bold 14px monospace;
    letter-spacing:2px;
    line-height:2;
    text-align:center;
    white-space:pre-line;
  `;

  document.body.appendChild(message);
  setTimeout(() => message.remove(), 6500);
}

function showEmergencyFuelMessage() {
  showTransmission(
    'NASA EMERGENCY TRANSMISSION\n' +
    'EMERGENCY FUEL DEPLOYED\n' +
    'ONE-TIME REFILL GRANTED',
    '#bde9f5'
  );
}

function handleFuelDepletion() {
  if (gameOver) return;

  if (survival.fuel > 0) {
    fuelWarningShown = false;
    return;
  }

  // Credits plus the value of unsold scrap.
  const scraps = moonSurface.scraps;
  const money = (scraps.credits ?? 0) + scraps.getInventoryValue();

  // 1. The player can still pay for fuel: tell them how, no game over.
  if (money >= FUEL_PRICE) {
    if (!fuelWarningShown) {
      fuelWarningShown = true;

      showTransmission(
        'FUEL DEPLETED\n' +
        'PRESS E TO ENTER THE SHIP\n' +
        'BUY FUEL AT THE COMPUTER',
        '#d5b66b'
      );
    }

    return;
  }

  // 2. Not enough money: NASA sends ONE free refill.
  // 3. Already used: game over.
  if (survival.emergencyFuelUsed) {
    gameOver = true;

    ship.vx = 0;
    ship.vy = 0;
    ship.boosting = false;

    gameOverScreen.children[0].textContent = 'FUEL DEPLETED';
    gameOverScreen.children[1].textContent = 'SHIP FUEL: 0%';
    gameOverScreen.children[2].textContent =
      'NASA EMERGENCY SUPPORT EXHAUSTED';

    gameOverScreen.style.display = 'flex';
    return;
  }

  survival.emergencyFuelUsed = true;
  survival.fuel = survival.maxFuel;

  showEmergencyFuelMessage();
  saveCurrentGame('Autosave');
}
// Where each hidden destination's star map comes from.
const MAP_SOURCES = { mars: 'THE MOON', europa: 'MARS', titan: 'EUROPA' };

// ASTEROID BELT: is the ship inside (or right next to) the ring?
function shipInBelt(margin = 0) {
  const distance = Math.hypot(ship.x, ship.y);
  return distance > BELT.inner - margin && distance < BELT.outer + margin;
}

// Belt rocks hit harder to dodge than to survive: same damage as a
// normal asteroid, but there are a lot of them.
function checkBeltCollisions() {
  if (!shipInBelt(200)) return;

  for (const rock of world.belt) {
    const dx = rock.x - ship.x;
    if (dx > 120 || dx < -120) continue;

    const dy = rock.y - ship.y;
    if (dy > 120 || dy < -120) continue;

    const distance = Math.hypot(dx, dy);
    const collisionDistance = rock.size * 0.4 + 26;

    if (distance >= collisionDistance) continue;

    const nx = distance > 0.001 ? dx / distance : Math.cos(ship.angle);
    const ny = distance > 0.001 ? dy / distance : Math.sin(ship.angle);
    const overlap = collisionDistance - distance + 2;

    // Bounce back a little instead of a dead stop, so the ship can't get stuck.
    ship.x -= nx * overlap;
    ship.y -= ny * overlap;
    ship.vx = -nx * 40;
    ship.vy = -ny * 40;
    ship.boosting = false;

    if (!collisionCooldowns.has(rock.id) && !gameOver) {
      collisionCooldowns.set(rock.id, 1.2);
      handleImpact();
    }
  }
}

// SOUNDTRACK: which track fits what the player is doing right now.
const music = createMusic();
let beltHold = 0;          // keeps the danger track on briefly after leaving the belt
let dangerCheckTimer = 0;
let stingCooldown = 0;
let monstersHunting = false;

// The monster music only plays while a hunting monster is this close.
// When they are farther away (or give up), it stops straight away.
const MONSTER_MUSIC_RADIUS = 360;
const BOSS_MUSIC_RADIUS = 620;

function monstersAreHunting() {
  const enemies = currentEnemies();
  if (!enemies) return false;

  const info = enemies.list();
  const group = Array.isArray(info) ? info : info.stalkers || [];
  const near = (monster, radius) =>
    Math.hypot(monster.x - moonSurface.x, monster.y - moonSurface.y) <= radius;

  if (group.some(monster =>
    monster.alerted && monster.state !== 'die' && monster.state !== 'death' && near(monster, MONSTER_MUSIC_RADIUS)
  )) return true;

  const boss = Array.isArray(info) ? null : info.boss;
  if (!boss || info.bossDefeated || boss.state === 'die' || !near(boss, BOSS_MUSIC_RADIUS)) return false;
  return boss.alerted !== undefined ? boss.alerted : boss.state !== 'idle';
}

function updateMusic(dt) {
  dangerCheckTimer -= dt;
  stingCooldown = Math.max(0, stingCooldown - dt);
  beltHold = Math.max(0, beltHold - dt);

  // Checking the monsters five times a second is plenty.
  if (dangerCheckTimer <= 0) {
    dangerCheckTimer = 0.2;

    const hunting = gameMode === 'moon' && !sleeping && monstersAreHunting();

    if (hunting && !monstersHunting && stingCooldown <= 0) {
      music.sting();           // "monster appears" sound
      stingCooldown = 12;
    }

    monstersHunting = hunting;
  }

  const inBelt = gameMode === 'driving' && launchComplete && shipInBelt(150);

  if (inBelt) beltHold = 1.5;

  const monsterDanger = monstersHunting && gameMode === 'moon';
  const beltDanger = beltHold > 0 && gameMode === 'driving';

  let situation;

  if (gameOver) {
    situation = null;                                   // silence
  } else if (earthBase.isOpen() || !launchComplete) {
    situation = 'travel';                               // launch pad / shipyard
  } else if (computerOpen) {
    situation = 'shop';                                 // ship computer + shop
  } else if (monsterDanger || beltDanger) {
    situation = 'danger';                               // monsters / boss / Asteroid Belt
  } else if (gameMode === 'moon' || landedOnMoon) {
    situation = landedPlanet;                           // on a world (or in the landed ship)
  } else {
    // In space: the theme of a nearby world, otherwise the travel theme.
    situation = 'travel';

    // (Earth has no track of its own: the travel theme plays there.)
    for (const id of ['moon', 'mars', 'europa', 'titan']) {
      const body = world[id];

      if (body && Math.hypot(body.x - ship.x, body.y - ship.y) < body.radius + 1800) {
        situation = id;
        break;
      }
    }
  }

  music.update(dt, situation, paused);
}

// COLLISION DETECTION
function checkCollisions() {
  checkBeltCollisions();

  for (const asteroid of world.asteroids) {
    // Space does not wrap around, so a plain difference is correct.
    const dx = asteroid.x - ship.x;
    const dy = asteroid.y - ship.y;

    const distance = Math.hypot(dx, dy);
    const collisionDistance = asteroid.size / 2 + 32;

    if (distance >= collisionDistance) continue;

    const nx = distance > 0.001
      ? dx / distance
      : Math.cos(ship.angle);

    const ny = distance > 0.001
      ? dy / distance
      : Math.sin(ship.angle);

    const overlap = collisionDistance - distance + 2;

    ship.x -= nx * overlap;
    ship.y -= ny * overlap;

    const limit = CONFIG.worldSize / 2;

    ship.x = Math.max(-limit, Math.min(limit, ship.x));
    ship.y = Math.max(-limit, Math.min(limit, ship.y));

    ship.vx = 0;
    ship.vy = 0;
    ship.boosting = false;

    if (!collisionCooldowns.has(asteroid.id) && !gameOver) {
      collisionCooldowns.set(asteroid.id, 1.2);
      handleImpact();
    }
  }
}

// RESIZE
function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);

  width = window.innerWidth;
  height = window.innerHeight;

  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);

  pixelCanvas.width = Math.ceil(width / 1.5);
  pixelCanvas.height = Math.ceil(height / 1.5);

  pixelCtx.imageSmoothingEnabled = false;
  ctx.imageSmoothingEnabled = false;

  pixelCtx.setTransform(
    pixelCanvas.width / width,
    0,
    0,
    pixelCanvas.height / height,
    0,
    0
  );
}

window.addEventListener('resize', resize);
resize();

// SAVE SYSTEM
function createSnapshot() {
  const saveOnFoot = {};

  for (const [key, value] of Object.entries(onFoot)) {
    if (
      key === 'assets' ||
      key === 'keys' ||
      typeof value === 'function' ||
      value instanceof Set ||
      value instanceof Map
    ) continue;

    if (
      value === null ||
      ['string', 'number', 'boolean'].includes(typeof value) ||
      Array.isArray(value)
    ) {
      saveOnFoot[key] = structuredClone(value);
    }
  }

  return {
    version: 1,
    game: 'Project: Nasareth',

    // Saving during sleep stores the state as if the player already woke up.
    gameMode: sleeping ? modeBeforeSleep : gameMode,
    gameMinutes: sleeping ? 7 * 60 : gameMinutes,
    hull,
    landedOnMoon,
    landedPlanet,
    planetStates: structuredClone(planetStates),
    launchComplete,

    ship: {
      x: ship.x,
      y: ship.y,
      vx: ship.vx,
      vy: ship.vy,
      angle: ship.angle,
      boosting: ship.boosting
    },

    survival: {
      fuel: survival.fuel,
      maxFuel: survival.maxFuel,
      shipOxygen: survival.shipOxygen,
      oxygen: survival.oxygen,
      health: survival.health,
      stamina: survival.stamina,
      emergencyFuelUsed: survival.emergencyFuelUsed,
      staminaExhausted: survival.staminaExhausted,
      detectorOn: survival.detectorOn,
      detectorFlash: survival.detectorFlash,
      detectorLit: survival.detectorLit,
      flashlightLevel: survival.flashlightLevel,
      flashlightOn: survival.flashlightOn,
      medkits: survival.medkits,
      weaponLevel: survival.weaponLevel
    },
    moon: {
      x: moonSurface.x,
      y: moonSurface.y,
      angle: moonSurface.angle,
      mapOpen: moonSurface.mapOpen,
      shipX: moonSurface.shipX,
      shipY: moonSurface.shipY,

      scraps: {
        items: structuredClone(moonSurface.scraps.items),
        inventory: structuredClone(moonSurface.scraps.inventory),
        credits: moonSurface.scraps.credits,
        found: structuredClone(moonSurface.scraps.found)
      },

      parts: structuredClone(partsSystem.getParts()),

      // Chest detector / chest position / Mars map.
      progress: chestQuest.save(),

      // Mars boss: defeated or not.
      marsBoss: marsMonsters.save(),
      europaBoss: europaMonsters.save(),

      // Learned martial arts.
      skills: martialArts.save()
    },

    onFoot: saveOnFoot,

    world: {
      asteroids: structuredClone(world.asteroids)
    }
  };
}

function saveCurrentGame(name = 'Expedition') {
  const saved = writeSave(name, createSnapshot());

  window.dispatchEvent(new CustomEvent('nasareth:saves-updated'));

  return saved;
}

function loadPendingSave() {
  const pending = localStorage.getItem('nasareth.pending-load');

  if (!pending) return;

  try {
    const save = JSON.parse(pending);

    applySnapshot(save, {
      ship,
      survival,
      moonSurface,
      onFoot,
      world
    });

    // Which planet's surface was loaded (older saves: the Moon).
    landedPlanet = PLANETS[save.landedPlanet] ? save.landedPlanet : 'moon';
    planetStates = save.planetStates && typeof save.planetStates === 'object'
      ? save.planetStates
      : {};
    moonSurface.setPlanet(PLANETS[landedPlanet]);
    applyPlanetFeatures();

    // Keep the parts-system reference alive after loading a save.
    if (save.moon?.parts) {
      const liveParts = partsSystem.getParts();

      Object.assign(liveParts, save.moon.parts);

      moonSurface.parts = liveParts;

      // Max 6 modules on the Moon, epic at most (fixes older saves).
      partsSystem.fixMoonItems(landedPlanet);
    }

    // Chest quest progress (older saves have none).
    chestQuest.load(save.moon?.progress);

    // Mars boss state; mythic stays locked on Mars until it is defeated.
    marsMonsters.load(save.moon?.marsBoss);
    partsSystem.setLockedRarities('mars', marsMonsters.isBossDefeated() ? [] : ['mythic']);
    europaMonsters.load(save.moon?.europaBoss);
    martialArts.load(save.moon?.skills);

    // Older saves: scrap waiting to be sold becomes balance.
    moonSurface.scraps.cashInInventory();
    partsSystem.setLockedRarities('europa', europaMonsters.isBossDefeated() ? [] : ['legendary']);

    if (save.moon && PLANETS[landedPlanet].chestQuest) {
      chestQuest.checkModules();
    }

    // Older saves could store 'sleeping'; load those inside the ship.
    if (save.gameMode === 'sleeping') {
      gameMode = 'walking';
    } else {
      gameMode = ['driving', 'walking', 'moon'].includes(save.gameMode)
        ? save.gameMode
        : 'driving';
    }

    gameMinutes = Number.isFinite(save.gameMinutes)
      ? save.gameMinutes
      : 480;

    hull = Number.isFinite(save.hull)
      ? save.hull
      : 100;

    landedOnMoon = Boolean(save.landedOnMoon);

    // Older saves have no launchComplete: they are already in space.
    launchComplete = save.launchComplete !== false;

    if (gameMode === 'walking') onFoot.clearKeys();
    if (gameMode === 'moon') moonSurface.clearKeys();

    // Recalculate module stats and sprites without adding hull twice.
    updateModuleEffects(false);

    // Older saves have no flashlight; applyFlashlight() treats that as 0.
    // Saves that bought one before the on/off switch existed: turn it on.
    if (save.survival && save.survival.flashlightOn === undefined) {
      survival.flashlightOn = survival.flashlightLevel > 0;
    }

    applyFlashlight();

    updateClockDisplay();
    updateHull();

    localStorage.removeItem('nasareth.pending-load');
  } catch (error) {
    console.error('Could not load save:', error);
    localStorage.removeItem('nasareth.pending-load');
  }
}

loadPendingSave();

// New game (or a save made before lift-off): start on Earth.
if (!launchComplete && !gameOver) {
  startEarthLaunch();
}

window.NasarethGame = {
  save: saveCurrentGame,
  saves: readSaves,
  deleteSave: removeSave,

  pause() {
    if (
      gameOver ||
      computerOpen ||
      sleeping ||
      sleepConfirmationOpen ||
      launchConfirmationOpen || isGaugeChallengeActive() || earthBase.isOpen() || planetLog.isOpen() || skillMenu.isOpen() ||
      moonSurface.scraps.inventoryOpen
    ) return false;

    paused = true;
    return true;
  },

  resume() {
    paused = false;
    previous = 0;
  },

  // Read-only debug info about the Moon's crawlers (for testers).
  // Read-only debug info about the Mars monsters (for testers).
  debugMars() {
    return marsMonsters.list();
  },

  debugEuropa() {
    return europaMonsters.list();
  },

  // Martial arts + scrap info (for testers).
  debugSkills() {
    return {
      scraps: moonSurface.scraps.credits,
      scrapsOnPlanet: moonSurface.scraps.items.length,
      skills: Object.fromEntries(
        ['punch', 'kick', 'flyingKick', 'energyWave', 'advancedWave', 'finisher']
          .map(id => [id, `${martialArts.status(id)} cd ${martialArts.cooldownOf(id).toFixed(1)}`])
      ),
      player: { x: Math.round(moonSurface.x), y: Math.round(moonSurface.y) }
    };
  },

  // Move the player on the surface (for testers).
  debugGoto(x, y) {
    moonSurface.x = x;
    moonSurface.y = y;
  },

  debugCrawlers() {
    return {
      alive: crawlers.list(),
      respawnsIn: crawlers.pendingRespawns(),
      player: { x: Math.round(moonSurface.x), y: Math.round(moonSurface.y) }
    };
  },

  isPaused() {
    return paused;
  }
};

// ADMIN MODE (temporary) - remove before release.
createAdminMode({
  addCredits(amount) {
    moonSurface.scraps.credits = (moonSurface.scraps.credits ?? 0) + amount;
    return `SCRAPS: ${moonSurface.scraps.credits}`;
  },
  restoreAll() {
    hull = hullMax;
    updateHull();
    Object.assign(survival, { health: 100, fuel: survival.maxFuel, oxygen: 100, shipOxygen: 100, stamina: 100, staminaExhausted: false });
  },
  giveAllMaps() {
    const saved = chestQuest.save();
    saved.chestDetector = true;
    saved.maps = { ...saved.maps, mars: true, europa: true, titan: true };
    chestQuest.load(saved);
    return 'MARS + EUROPA + TITAN MAPS GIVEN';
  },
  maxGear() {
    survival.flashlightLevel = FLASHLIGHT_PRICES.length;
    survival.flashlightOn = true;
    applyFlashlight();
    survival.medkits = MEDKIT_MAX;
  },
  unlockSkills() {
    martialArts.unlockAll();
    return 'ALL 6 MARTIAL ARTS UNLOCKED (KEYS 1-6)';
  },
  gotoNextModule() {
    if (gameMode !== 'moon') return 'LAND ON A PLANET FIRST';
    const part = partsSystem.getParts().items.find(item => !item.collected);
    if (!part) return 'NO MODULES LEFT';
    moonSurface.x = part.x;
    moonSurface.y = part.y + 20;
    return 'TELEPORTED (module picks up automatically)';
  },
  collectAllModules() {
    if (gameMode !== 'moon') return 'LAND ON A PLANET FIRST';
    const count = partsSystem.collectAll();
    return count ? `COLLECTED ${count} MODULES` : 'NO MODULES LEFT';
  },
  gotoBoss() {
    if (gameMode !== 'moon') return 'LAND ON A PLANET FIRST';
    const lair = { mars: [-2800, -2600], europa: [2900, -2700] }[landedPlanet];
    if (!lair) return 'NO BOSS ON THIS PLANET';
    moonSurface.x = lair[0];
    moonSurface.y = lair[1] + 480;
    return 'TELEPORTED NEAR THE BOSS LAIR';
  },
  gotoChest() {
    if (gameMode !== 'moon') return 'LAND ON A PLANET FIRST';
    const chest = chestQuest.getState().chests[landedPlanet];
    if (!chest) return 'NO CHEST YET (collect all modules first)';
    moonSurface.x = chest.x;
    moonSurface.y = chest.y;
    return 'TELEPORTED TO CHEST';
  },
  flyTo(id) {
    if (gameMode !== 'driving') return 'MUST BE FLYING IN SPACE (leave the ship/planet first)';
    // The belt: just inside its inner edge, on the way from Mars to Europa.
    const body = id === 'belt'
      ? { x: -0.747 * (BELT.inner - 400), y: -0.664 * (BELT.inner - 400), radius: -60 }
      : world[id];
    ship.x = body.x;
    ship.y = body.y - body.radius - 60;
    ship.vx = 0;
    ship.vy = 0;
    return `AT ${id.toUpperCase()} - PRESS E TO LAND`;
  },
  setTime(minutes) {
    gameMinutes = minutes;
  }
});

window.dispatchEvent(new CustomEvent('nasareth:game-ready'));

// MARTIAL ARTS MENU KEY (K) - Esc also closes it.
window.addEventListener('keydown', (event) => {
  if (isTypingTarget(event) || event.repeat) return;

  if ((event.key === 'Escape' || event.code === 'KeyK') && skillMenu.isOpen()) {
    event.preventDefault();
    event.stopImmediatePropagation(); // don't also open the pause menu
    skillMenu.close();
    return;
  }

  if (
    event.code !== 'KeyK' ||
    paused ||
    gameOver ||
    sleeping ||
    computerOpen ||
    !launchComplete ||
    moonSurface.scraps.inventoryOpen ||
    launchConfirmationOpen || isGaugeChallengeActive() || earthBase.isOpen() || planetLog.isOpen() || skillMenu.isOpen() ||
    sleepConfirmationOpen
  ) return;

  event.preventDefault();

  // No keys stay "held" while the menu is open.
  heldKeys.clear();
  onFoot.clearKeys();
  moonSurface.clearKeys();

  skillMenu.toggle();
});

// PLANET LOG KEY (P) - Esc also closes it.
window.addEventListener('keydown', (event) => {
  if (isTypingTarget(event) || event.repeat) return;

  if (event.key === 'Escape' && planetLog.isOpen()) {
    event.preventDefault();
    event.stopImmediatePropagation(); // don't also open the pause menu
    planetLog.close();
    return;
  }

  if (
    event.code !== 'KeyP' ||
    paused ||
    gameOver ||
    sleeping ||
    computerOpen ||
    earthBase.isOpen() ||
    moonSurface.scraps.inventoryOpen ||
    launchConfirmationOpen || isGaugeChallengeActive() || earthBase.isOpen() || planetLog.isOpen() || skillMenu.isOpen() ||
    sleepConfirmationOpen
  ) return;

  event.preventDefault();
  planetLog.toggle();
});

// PAUSE MENU SHORTCUT
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.repeat) return;

  if (
    gameOver ||
    computerOpen ||
    sleeping ||
    sleepConfirmationOpen ||
    launchConfirmationOpen || isGaugeChallengeActive() || earthBase.isOpen() || planetLog.isOpen() || skillMenu.isOpen() ||
    moonSurface.scraps.inventoryOpen
  ) return;

  event.preventDefault();

  paused = !paused;

  window.dispatchEvent(new CustomEvent(
    paused ? 'nasareth:pause' : 'nasareth:resume'
  ));
});

// EARTH LANDING: same gauge as the planets, but easier (home turf).
function startEarthLanding() {
  if (isGaugeChallengeActive() || gameOver) return;

  ship.vx = 0;
  ship.vy = 0;
  ship.boosting = false;
  minimapOpen = false;

  runGaugeChallenge({
    kicker: 'EARTH APPROACH · SHIPYARD DOCKING',
    title: 'LAND ON EARTH',
    required: LANDING_REQUIRED,
    maxAttempts: LANDING_MAX_ATTEMPTS,
    fillSeconds: 1.4,
    zoneSize: Math.min(26, 18 * (moduleStats.landingAssist || 1)),
    onAttempt(success) {
      if (!success) damageHullFromChallenge(LANDING_FAIL_DAMAGE);
      return !gameOver;
    }
  }).then(result => {
    heldKeys.clear();

    if (result.aborted || gameOver) return;

    if (!result.success) {
      showTransmission('DOCKING ABORTED\nPRESS E TO TRY AGAIN', '#e18b58');
      return;
    }

    // Parked on the launch pad; the shipyard opens.
    ship.x = world.earth.x;
    ship.y = world.earth.y - world.earth.radius - 45;
    ship.vx = 0;
    ship.vy = 0;
    ship.angle = -Math.PI / 2;
    earthBase.open();
  });
}

// Fresh UI when arriving on a planet: panels closed, detector off,
// surface map open, old messages cleared.
function resetSurfaceUi() {
  moonSurface.scraps.closeInventory();
  moonSurface.mapOpen = true;
  moonSurface.scraps.pickupTimer = 0;
  partsSystem.getParts().pickupTimer = 0;
  survival.detectorOn = false;
  survival.detectorLit = false;
  survival.detectorFlash = 0;
  minimapOpen = false;
  if (planetLog.isOpen()) planetLog.close();
  if (skillMenu.isOpen()) skillMenu.close();
  martialArts.reset();
}

// The ENVIRONMENT panel (top right) shows where the player is.
let lastEnvironment = '';

function updateEnvironmentPanel() {
  let title = 'DEEP SPACE';
  let place = 'SECTOR 01';
  let detail = 'Uncharted region';

  if (earthBase.isOpen()) {
    title = 'EARTH'; place = 'ORBITAL SHIPYARD'; detail = 'Repair and refit';
  } else if (gameMode === 'moon') {
    title = PLANETS[landedPlanet].name;
    place = 'SURFACE';
    detail = chestQuest.isBeaten(landedPlanet) ? 'Planet beaten' : 'Salvage in progress';
  } else if (gameMode === 'walking') {
    title = 'WAYFARER';
    place = 'SHIP INTERIOR';
    detail = landedOnMoon ? `Landed on ${PLANETS[landedPlanet].name.replace('THE ', '')}` : 'In flight';
  }

  const key = title + place + detail;
  if (key === lastEnvironment) return;   // only touch the DOM when it changes
  lastEnvironment = key;

  const titleElement = document.querySelector('#environment-title');
  const placeElement = document.querySelector('#environment-place');
  const detailElement = document.querySelector('#environment-detail');

  if (titleElement) titleElement.textContent = title;
  if (placeElement) placeElement.textContent = place;
  if (detailElement) detailElement.textContent = detail;
}

// MAIN LOOP
function frame(time) {
  const dt = Math.min(
    (time - previous) / 1000 || 0,
    0.033
  );

  previous = time;

  updateMusic(dt);

  // ADMIN MODE (temporary): god mode keeps everything full.
  if (adminFlags.god && !gameOver) {
    hull = hullMax;
    survival.health = 100;
    survival.fuel = survival.maxFuel;
    survival.oxygen = 100;
    survival.shipOxygen = 100;
    survival.stamina = 100;
    survival.staminaExhausted = false;
  }

  // ADMIN MODE (temporary): auto-collect every module on the planet.
  if (adminFlags.autoCollect && gameMode === 'moon' && !gameOver) {
    partsSystem.collectAll();
  }

  // The world is frozen while the launch / landing gauge is on screen.
  if (!gameOver && !paused && !isGaugeChallengeActive() && !earthBase.isOpen() && !planetLog.isOpen() && !skillMenu.isOpen()) {
    if (sleeping) {
      sleepTimer -= dt;

      if (sleepTimer <= 0) finishSleep();
    } else {
      // Killed crawlers come back 30 s later, out of the player's view.
      // The view is the flashlight beam if on, else the small glow (~170).
      const respawnView = {
        x: moonSurface.x,
        y: moonSurface.y,
        viewDistance: moonSurface.flashlight ? moonSurface.flashlight.length : 170
      };
      crawlers.tickRespawns(dt, respawnView);
      marsMonsters.tickRespawns(dt, respawnView);
      europaMonsters.tickRespawns(dt, respawnView);

      clockAccumulator += dt * 2;

      while (clockAccumulator >= 1) {
        clockAccumulator -= 1;
        gameMinutes += 1;

        if (gameMinutes >= 24 * 60) gameMinutes = 0;

        if (gameMinutes === 2 * 60) {
          beginSleep(true);
          break;
        }
      }

      updateClockDisplay();

      if (
        !sleeping &&
        !launchConfirmationOpen &&
        !sleepConfirmationOpen &&
        !computerOpen &&
        !moonSurface.scraps.inventoryOpen
      ) {
        // Passive energy-module fuel generation outside driving mode.
        if (gameMode !== 'driving') {
          survival.updateFuel(dt, false, false, moduleStats);
        }

        if (gameMode === 'driving') {
          const forwardPressed =
            heldKeys.has('w') || heldKeys.has('arrowup');

          const reversePressed =
            heldKeys.has('s') || heldKeys.has('arrowdown');

          const engineActive = forwardPressed || reversePressed;
          const boostRequested = forwardPressed && heldKeys.has('shift');

          survival.updateFuel(
            dt,
            engineActive,
            boostRequested,
            moduleStats
          );

          handleFuelDepletion();

          ship.update(
            dt,
            survival.fuel > 0,
            adminFlags.fast
              ? { ...moduleStats,
                  accelerationMultiplier: (moduleStats.accelerationMultiplier || 1) * 3,
                  maxSpeedMultiplier: (moduleStats.maxSpeedMultiplier || 1) * 3 }
              : moduleStats
          );

          checkCollisions();
        } else if (gameMode === 'walking') {
          onFoot.update(dt, survival.canRun(), survival.staminaExhausted);
          survival.updateStamina(dt, isRunning());
        } else if (gameMode === 'moon') {
          moonSurface.update(dt, survival.canRun(), survival.staminaExhausted);

          // Attacks in progress: flying kick, energy waves, cooldowns.
          martialArts.update(dt);

          // This planet's monsters chase and attack the player.
          const enemies = currentEnemies();

          if (enemies) enemies.update(dt, {
            x: moonSurface.x,
            y: moonSurface.y,
            damage(amount, cause = 'ATTACKED BY A LUNAR CRAWLER') {
              survival.health = Math.max(0, survival.health - amount);
              playerHurtFlash = 1;

              if (survival.health <= 0) {
                triggerLifeSupportFailure('KILLED IN ACTION', cause);
              }
            },
            // Solid monsters (the boss) push the player out of their body.
            push(dx, dy) {
              moonSurface.x += dx;
              moonSurface.y += dy;
            }
          });

          survival.updateMoon(dt, isRunning());

          // Open the quest chest when the player walks onto it.
          if (PLANETS[landedPlanet].chestQuest) chestQuest.update();

          const targets = getNearestDetectorTargets();

          const distances = [
            targets.scrap?.distance,
            targets.module?.distance,
            currentChestDistance()
          ].filter(Number.isFinite);

          const nearestDistance = distances.length
            ? Math.min(...distances)
            : null;

          // Update the detector only ONCE per frame.
          survival.updateDetector(dt, nearestDistance);

          if (survival.health <= 0) {
            triggerLifeSupportFailure();
          }
        }
      }
    }
  }

  if (!paused && !gameOver) {
    autosaveAccumulator += dt;

    if (autosaveAccumulator >= 60) {
      autosaveAccumulator = 0;
      saveCurrentGame('Autosave');
    }
  }

  updateParticles(dt);

  // Hurt flash fades in every mode (it used to freeze if you left the Moon).
  playerHurtFlash = Math.max(0, playerHurtFlash - dt * 2.5);
  drawBackground(pixelCtx, width, height);

  if (gameMode === 'driving') {
    // Pixel-art parallax star textures (behind everything else).
    // Frozen while paused or after game over.
    const texturedBackground = spaceBackground.draw(
      pixelCtx,
      ship,
      paused || gameOver ? 0 : dt
    );

    pixelCtx.save();

    if (shake > 0) {
      pixelCtx.translate(
        (Math.random() - 0.5) * shake,
        (Math.random() - 0.5) * shake
      );
    }

    // Mars appears on the space map only after the Mars star map is found.
    world.discovered = chestQuest.getState().maps;

    drawWorld(
      pixelCtx,
      world,
      ship,
      width,
      height,
      shipSprite,
      minimapOpen,
      texturedBackground
    );

    drawParticles(pixelCtx);
    pixelCtx.restore();
  } else if (gameMode === 'moon') {
    moonSurface.draw(pixelCtx, width, height);

    // Boss health bar on Mars.
    if (landedPlanet === 'mars') {
      marsMonsters.drawBossBar(pixelCtx, width, moonSurface.x, moonSurface.y);
    } else if (landedPlanet === 'europa') {
      europaMonsters.drawBossBar(pixelCtx, width, moonSurface.x, moonSurface.y);
    }

    // Red flash when a Lunar Crawler hits the player.
    if (playerHurtFlash > 0) {
      pixelCtx.fillStyle = `rgba(160, 20, 20, ${0.35 * playerHurtFlash})`;
      pixelCtx.fillRect(0, 0, width, height);
    }
  } else {
    onFoot.draw(pixelCtx, width, height);
  }

  // DRAW INVENTORY IN EVERY MODE EXCEPT MOON.
  if (
    gameMode !== 'moon' &&
    moonSurface.scraps.inventoryOpen
  ) {
    moonSurface.scraps.drawInventory(
      pixelCtx,
      width,
      height
    );
  }

  // DRAW DETECTOR AND TANK STATUS.
  drawSurvivalEquipment(pixelCtx);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  ctx.drawImage(
    pixelCanvas,
    0,
    0,
    canvas.width,
    canvas.height
  );

  updateHud(ship, hull, survival, gameMode === 'moon' ? landedPlanet : gameMode, moonSurface.scraps.credits ?? 0);
  updateEnvironmentPanel();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);