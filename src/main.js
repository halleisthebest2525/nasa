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

const canvas = document.querySelector('#space');
const ctx = canvas.getContext('2d');

const ship = new Ship();
const world = new World();

const assets = await loadAssets();

const onFoot = new OnFoot(assets);
const moonSurface = new MoonSurface(assets);
const survival = new Survival();

const partsSystem = attachPartsSystem(moonSurface);
let moduleStats = partsSystem.getStats();

let hullMax = moduleStats.maxHull;

let landedOnMoon = false;
let shipSprite = assets.ship_space_common;

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
    survival.stamina > 0;
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
    launchConfirmationOpen ||
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
        TRADE RESOURCES AND MANAGE YOUR CREDITS
      </p>

      <div style="
        background:#111814;
        border:1px solid #465447;
        padding:14px;
        margin-bottom:24px;
        color:#c7d5ae;
        font-size:14px;
      ">AVAILABLE CREDITS: ${credits}</div>

      <div style="display:flex;flex-direction:column;gap:12px">
        <button id="computer-sell" class="computer-button">
          SELL SCRAPS
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
          <small>+20 FUEL · 30 CREDITS</small>
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
          <small>+20% OXYGEN · 30 CREDITS</small>
          <button
            id="buy-oxygen"
            class="computer-button"
            ${survival.shipOxygen >= 100 || credits < 30 ? 'disabled' : ''}
          >
            PURCHASE OXYGEN
          </button>
        </div>
      </div>

      <div style="
        color:#c7d5ae;
        font-size:13px;
        margin-bottom:18px;
      ">
        AVAILABLE CREDITS: ${credits}
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

  if (sellButton) {
    sellButton.addEventListener('click', () => {
      computerPage = 'sell';
      renderComputer();
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

  if (hullValue) hullValue.textContent = Math.round(hull);

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

  moonSurface.assets.ship_moon =
    assets[`ship_moon_${rarity}`] ||
    assets.ship_moon_common;

  


  updateHull();
}

window.addEventListener('nasareth:modules-changed', () => {
  updateModuleEffects();
});

updateModuleEffects(false);

// LIFE SUPPORT GAME OVER
function triggerLifeSupportFailure() {
  if (gameOver) return;

  gameOver = true;

  ship.vx = 0;
  ship.vy = 0;
  ship.boosting = false;

  closeComputer();

  gameOverScreen.querySelector('div').textContent = 'LIFE SUPPORT FAILED';
  gameOverScreen.querySelector('div').style.color = '#77b9d4';
  gameOverScreen.children[1].textContent = 'SUIT OXYGEN: 0%';
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

  updateClockDisplay();
  sleepScreen.style.display = 'none';

  gameMode = 'walking';
  onFoot.enter();

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
    <div style="color:#d5dfb4;font-size:20px;letter-spacing:3px">
      DEPART THE MOON?
    </div>
    <p style="color:#aaa;font-size:12px;line-height:1.8">
      Launch the spaceship and leave the lunar surface?
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
  if (launchConfirmationOpen || gameOver || sleeping) return;

  launchConfirmationOpen = true;
  launchSelection = 0;
  onFoot.clearKeys();

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

  ship.x = world.moon.x + world.moon.radius + 170;
  ship.y = world.moon.y;
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
    closeLaunchConfirmation();
  }
});

// GLOBAL INVENTORY KEY
window.addEventListener('keydown', (event) => {
  if (
    gameOver ||
    sleeping ||
    sleepConfirmationOpen ||
    launchConfirmationOpen ||
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
    gameMode !== 'moon' ||
    gameOver ||
    sleeping ||
    computerOpen ||
    moonSurface.scraps.inventoryOpen ||
    launchConfirmationOpen ||
    sleepConfirmationOpen
  ) return;

  survival.detectorOn = !survival.detectorOn;
  survival.detectorFlash = 0;
  survival.detectorLit = false;
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
    moonSurface.scraps.inventoryOpen ||
    computerOpen ||
    gameOver ||
    sleeping ||
    launchConfirmationOpen ||
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

// MODE SWITCHING AND INTERACTION
window.addEventListener('keydown', (event) => {
  if (
    event.code !== 'KeyE' ||
    event.repeat ||
    gameOver ||
    sleeping ||
    sleepConfirmationOpen ||
    launchConfirmationOpen ||
    computerOpen ||
    moonSurface.scraps.inventoryOpen
  ) return;

  event.preventDefault();

  if (gameMode === 'driving') {
    const moonDistance = Math.hypot(
      world.moon.x - ship.x,
      world.moon.y - ship.y
    );

    if (moonDistance <= world.moon.radius + 125) {
      // LAND ON THE MOON.
      ship.x = world.moon.x;
      ship.y = world.moon.y;
      ship.vx = 0;
      ship.vy = 0;
      ship.boosting = false;

      landedOnMoon = true;
      minimapOpen = false;
      gameMode = 'moon';
      moonSurface.enter();

      console.log('Landed on the Moon');
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

// SURVIVAL EQUIPMENT DISPLAY
function drawSurvivalEquipment(context) {
  // METAL DETECTOR
  if (gameMode === 'moon' && survival.detectorOn) {
    const nearest = moonSurface.scraps.getNearestUncollected(
      moonSurface.x,
      moonSurface.y
    );

    context.save();

    context.fillStyle = 'rgba(0,0,0,.8)';
    context.fillRect(18, 18, 190, 52);

    context.strokeStyle = '#62665b';
    context.strokeRect(18, 18, 190, 52);

    context.fillStyle = '#c5c9b8';
    context.font = 'bold 11px monospace';
    context.textAlign = 'left';
    context.fillText('METAL DETECTOR [Q]', 30, 37);

    context.beginPath();
    context.arc(39, 53, 5, 0, Math.PI * 2);
    context.fillStyle = survival.detectorLit ? '#ff3028' : '#54201d';
    context.shadowColor = '#ff3028';
    context.shadowBlur = survival.detectorLit ? 12 : 0;
    context.fill();

    context.shadowBlur = 0;
    context.fillStyle = '#a8ad9d';
    context.font = '10px monospace';
    context.fillText(
      nearest ? `${Math.round(nearest.distance)}m · SIGNAL` : 'NO SIGNAL',
      53,
      57
    );

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

    drawTank(width - 148, tankY + 55, 'OXYGEN TANK', survival.shipOxygen, '#77b9d4');

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

// COLLISION DETECTION
function checkCollisions() {
  for (const asteroid of world.asteroids) {
    const dx = (
      (asteroid.x - ship.x + CONFIG.worldSize / 2) %
      CONFIG.worldSize + CONFIG.worldSize
    ) % CONFIG.worldSize - CONFIG.worldSize / 2;

    const dy = (
      (asteroid.y - ship.y + CONFIG.worldSize / 2) %
      CONFIG.worldSize + CONFIG.worldSize
    ) % CONFIG.worldSize - CONFIG.worldSize / 2;

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
    gameMode,
    gameMinutes,
    hull,
    landedOnMoon,

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
      detectorOn: survival.detectorOn,
      detectorFlash: survival.detectorFlash,
      detectorLit: survival.detectorLit
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
        credits: moonSurface.scraps.credits
      },

      parts: structuredClone(partsSystem.getParts())
    },

    onFoot: saveOnFoot,

    world: {
      asteroids: structuredClone(world.asteroids)
    }
  };
}

function saveCurrentGame(name = 'Expedition') {
  const snapshot = createSnapshot();
  const saved = writeSave(name, snapshot);

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

    // Keep the parts-system reference alive after loading a save.
    if (save.moon?.parts) {
      const liveParts = partsSystem.getParts();

      Object.assign(liveParts, save.moon.parts);

      moonSurface.parts = liveParts;
    }

    gameMode = ['driving', 'walking', 'moon'].includes(save.gameMode)
      ? save.gameMode
      : 'driving';

    gameMinutes = Number.isFinite(save.gameMinutes)
      ? save.gameMinutes
      : 480;

    hull = Number.isFinite(save.hull)
      ? save.hull
      : 100;

    landedOnMoon = Boolean(save.landedOnMoon);

    if (gameMode === 'walking') onFoot.clearKeys();
    if (gameMode === 'moon') moonSurface.clearKeys();

    // Recalculate module stats and sprites without adding hull twice.
    updateModuleEffects(false);

    updateClockDisplay();
    updateHull();

    localStorage.removeItem('nasareth.pending-load');
  } catch (error) {
    console.error('Could not load save:', error);
    localStorage.removeItem('nasareth.pending-load');
  }
}

loadPendingSave();

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
      launchConfirmationOpen ||
      moonSurface.scraps.inventoryOpen
    ) return false;

    paused = true;
    return true;
  },

  resume() {
    paused = false;
    previous = 0;
  },

  isPaused() {
    return paused;
  }
};

window.dispatchEvent(new CustomEvent('nasareth:game-ready'));

// PAUSE MENU SHORTCUT
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.repeat) return;

  if (
    gameOver ||
    computerOpen ||
    sleeping ||
    sleepConfirmationOpen ||
    launchConfirmationOpen ||
    moonSurface.scraps.inventoryOpen
  ) return;

  event.preventDefault();

  paused = !paused;

  window.dispatchEvent(new CustomEvent(
    paused ? 'nasareth:pause' : 'nasareth:resume'
  ));
});

// MAIN LOOP
function frame(time) {
  const dt = Math.min(
    (time - previous) / 1000 || 0,
    0.033
  );

  previous = time;

  if (!gameOver && !paused) {
    if (sleeping) {
      sleepTimer -= dt;

      if (sleepTimer <= 0) finishSleep();
    } else {
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

          ship.update(
            dt,
            survival.fuel > 0,
            moduleStats
          );

          checkCollisions();
        } else if (gameMode === 'walking') {
          onFoot.update(dt);
          survival.updateStamina(dt, isRunning());
        } else if (gameMode === 'moon') {
          moonSurface.update(dt);

          survival.updateMoon(dt, isRunning());

          const nearest = moonSurface.scraps.getNearestUncollected(
            moonSurface.x,
            moonSurface.y
          );

          survival.updateDetector(
            dt,
            nearest ? nearest.distance : null
          );

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
  drawBackground(pixelCtx, width, height);

  if (gameMode === 'driving') {
    pixelCtx.save();

    if (shake > 0) {
      pixelCtx.translate(
        (Math.random() - 0.5) * shake,
        (Math.random() - 0.5) * shake
      );
    }

    drawWorld(
      pixelCtx,
      world,
      ship,
      width,
      height,
      shipSprite,
      minimapOpen
    );

    drawParticles(pixelCtx);
    pixelCtx.restore();
  } else if (gameMode === 'moon') {
    moonSurface.draw(pixelCtx, width, height);
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

  updateHud(ship, hull, survival, gameMode);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);