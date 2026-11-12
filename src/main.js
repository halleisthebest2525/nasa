import { Ship } from './ship.js';
import { World } from './world.js';
import { OnFoot } from './onFoot.js';
import { CONFIG } from './config.js';
import { drawBackground, drawWorld } from './renderer.js';
import { updateHud } from './hud.js';
import { MoonSurface } from './moonSurface.js';
import { loadAssets } from './assets.js';

const canvas = document.querySelector('#space');
const ctx = canvas.getContext('2d');

const ship = new Ship();
const world = new World();

const assets = await loadAssets();

const onFoot = new OnFoot(assets);
const moonSurface = new MoonSurface(assets);

let landedOnMoon = false;
const shipSprite = assets.ship_space;

// GAME STATE
let hull = 100;
let gameOver = false;
let gameMode = 'driving';
let minimapOpen = false;

let sleepConfirmationOpen = false;
let sleeping = false;
let sleepTimer = 0;
let forcedSleep = false;

let launchConfirmationOpen = false;
let launchSelection = 0;

// MOON INVENTORY KEY
window.addEventListener('keydown', (event) => {
  if (gameOver || sleeping || sleepConfirmationOpen || launchConfirmationOpen) return;

  if (gameMode === 'moon' && event.code === 'KeyB' && !event.repeat) {
    event.preventDefault();
    moonSurface.toggleInventory();
  } else if (
    gameMode === 'moon' &&
    event.key === 'Escape' &&
    moonSurface.scraps.inventoryOpen
  ) {
    event.preventDefault();
    moonSurface.closeInventory();
  }
});

// MAP KEY
window.addEventListener('keydown', (event) => {
  if (
    event.code !== 'KeyM' ||
    event.repeat ||
    (gameMode === 'moon' && moonSurface.scraps.inventoryOpen) ||
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

let shake = 0;
let impactFlash = 0;
let impactMessageTimer = 0;

// GAME CLOCK
let gameMinutes = 8 * 60;
let clockAccumulator = 0;

const particles = [];
const collisionCooldowns = new Map();

// RENDERING
const pixelCanvas = document.createElement('canvas');
const pixelCtx = pixelCanvas.getContext('2d');

let width = 0;
let height = 0;
let previous = 0;

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

// HULL SYSTEM
function updateHull() {
  hullDisplay.textContent = `HULL INTEGRITY: ${hull}%`;

  hullDisplay.style.color =
    hull <= 30 ? '#e45d4c' : '#d5d0c5';

  hullDisplay.style.borderColor =
    hull <= 30 ? '#a33d32' : '#555';

  const hullValue = document.querySelector('#hull-value');
  const hullMeter = document.querySelector('#hull-meter');

  if (hullValue) hullValue.textContent = hull;
  if (hullMeter) hullMeter.style.width = `${hull}%`;

  if (hull <= 0 && !gameOver) {
    hull = 0;
    gameOver = true;

    ship.vx = 0;
    ship.vy = 0;
    ship.boosting = false;

    gameOverScreen.style.display = 'flex';
  }
}

updateHull();

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

// MODE SWITCHING AND INTERACTION
window.addEventListener('keydown', (event) => {
  if (
    event.code !== 'KeyE' ||
    event.repeat ||
    gameOver ||
    sleeping ||
    sleepConfirmationOpen ||
    launchConfirmationOpen ||
    (gameMode === 'moon' && moonSurface.scraps.inventoryOpen)
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
      onFoot.enter();
      gameMode = 'walking';

      console.log('Entered spaceship from the Moon');
    }
  } else if (gameMode === 'walking') {
    // EXIT THE INTERIOR.
    if (onFoot.canExit()) {
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

// MAIN LOOP
function frame(time) {
  const dt = Math.min(
    (time - previous) / 1000 || 0,
    0.033
  );

  previous = time;

  if (!gameOver) {
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
        !sleepConfirmationOpen
      ) {
        if (gameMode === 'driving') {
          ship.update(dt);
          checkCollisions();
        } else if (gameMode === 'walking') {
          onFoot.update(dt);
        } else if (gameMode === 'moon') {
          moonSurface.update(dt);
        }
      }
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

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  ctx.drawImage(
    pixelCanvas,
    0,
    0,
    canvas.width,
    canvas.height
  );

  updateHud(ship, hull);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);