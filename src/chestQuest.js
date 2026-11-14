// ==========================================
// CHEST QUEST (Moon)
// 1. Collect all the modules lying on the Moon -> get the CHEST DETECTOR.
// 2. A chest appears at a random spot. The detector (Q) shows its distance.
// 3. Open the chest (walk onto it) -> MARS STAR MAP.
// Mars itself is not built yet; marsMap just records that it is unlocked.
// ==========================================

const SURFACE_RADIUS = 4800;
const CHEST_MIN_DISTANCE = 1200; // from the player when it appears
const OPEN_DISTANCE = 50;

// game = { partsSystem, moonSurface, showTransmission(text, color) }
export function createChestQuest(game) {
  const state = {
    chestDetector: false,
    chest: null,      // { x, y } while waiting to be found
    marsMap: false
  };

  function spawnChest() {
    const px = game.moonSurface.x;
    const py = game.moonSurface.y;
    let x = 0;
    let y = 0;

    for (let tries = 0; tries < 300; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * SURFACE_RADIUS * 0.85;

      x = Math.cos(angle) * distance;
      y = Math.sin(angle) * distance;

      if (Math.hypot(x - px, y - py) >= CHEST_MIN_DISTANCE) break;
    }

    state.chest = { x: Math.round(x), y: Math.round(y) };
  }

  // Called whenever a module is picked up (and after loading a save).
  function checkModules() {
    if (state.chestDetector) return;

    const items = game.partsSystem.getParts().items;
    const allFound = items.length > 0 && items.every(part => part.collected);

    if (!allFound) return;

    state.chestDetector = true;
    spawnChest();

    game.showTransmission(
      'ALL MODULES RECOVERED\n' +
      'CHEST DETECTOR ACQUIRED\n' +
      'PRESS Q TO TRACK THE SIGNAL',
      '#e0c78e'
    );
  }

  // Opens the chest when the player walks onto it.
  function update() {
    if (!state.chest) return;

    const distance = Math.hypot(
      state.chest.x - game.moonSurface.x,
      state.chest.y - game.moonSurface.y
    );

    if (distance > OPEN_DISTANCE) return;

    state.chest = null;
    state.marsMap = true;

    game.showTransmission(
      'CHEST OPENED\n' +
      'MARS STAR MAP ACQUIRED\n' +
      'ROUTE TO MARS UNLOCKED',
      '#ef9c66'
    );
  }

  // Distance from the player to the chest, or null (no detector / no chest).
  function getChestDistance() {
    if (!state.chestDetector || !state.chest) return null;

    return Math.hypot(
      state.chest.x - game.moonSurface.x,
      state.chest.y - game.moonSurface.y
    );
  }

  // Small pixel-art chest, drawn in world space (hidden by the darkness).
  function draw(ctx, cameraX, cameraY, width, height) {
    if (!state.chest) return;

    const x = Math.round(cameraX + state.chest.x);
    const y = Math.round(cameraY + state.chest.y);

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
    if (!data || typeof data !== 'object') return;

    state.chestDetector = Boolean(data.chestDetector);
    state.marsMap = Boolean(data.marsMap);
    state.chest =
      data.chest && Number.isFinite(data.chest.x) && Number.isFinite(data.chest.y)
        ? { x: data.chest.x, y: data.chest.y }
        : null;

    // Had the detector but no chest and no map (should not happen): new chest.
    if (state.chestDetector && !state.chest && !state.marsMap) spawnChest();
  }

  return {
    checkModules,
    update,
    getChestDistance,
    draw,
    save,
    load,
    getState: () => state
  };
}
