// ==========================================
// ADMIN MODE (TEMPORARY - for testing only)
// Toggle with the ` key (left of 1) or the small ADMIN button.
// Remove this file + its import in main.js before release.
// ==========================================

export const adminFlags = {
  god: false,        // no damage, full fuel/oxygen/stamina/health
  skipGauges: false, // every launch / landing gauge succeeds instantly
  fast: false,       // ship + walking speed x3
  autoCollect: false // every module on a planet is collected as soon as you land
};

// Read by gaugeChallenge.js.
window.__NASA_ADMIN__ = adminFlags;

export function createAdminMode(game) {
  const button = document.createElement('button');
  button.textContent = 'ADMIN';
  button.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:300;font:11px monospace;' +
    'background:#3a1010;color:#ff8a8a;border:1px solid #ff5a5a;padding:3px 8px;cursor:pointer;opacity:.75';

  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;left:8px;bottom:36px;z-index:300;width:230px;display:none;' +
    'background:rgba(20,8,8,.94);border:1px solid #ff5a5a;color:#ffd0d0;' +
    'font:12px monospace;padding:8px;max-height:80vh;overflow:auto';

  const actions = [
    ['toggle', 'god', 'GOD MODE'],
    ['toggle', 'skipGauges', 'SKIP LAUNCH/LANDING GAUGES'],
    ['toggle', 'fast', 'FAST MOVE (x3)'],
    ['toggle', 'autoCollect', 'AUTO-COLLECT ALL MODULES'],
    ['+1000 CREDITS', () => game.addCredits(1000)],
    ['FULL RESTORE (hull/fuel/O2/HP)', () => game.restoreAll()],
    ['GIVE ALL STAR MAPS', () => game.giveAllMaps()],
    ['MAX FLASHLIGHT + WEAPON + MEDKITS', () => game.maxGear()],
    ['GO TO NEXT MODULE (on planet)', () => game.gotoNextModule()],
    ['COLLECT ALL MODULES (on planet)', () => game.collectAllModules()],
    ['GO TO CHEST (on planet)', () => game.gotoChest()],
    ['GO TO BOSS (Mars / Europa)', () => game.gotoBoss()],
    ['FLY TO EARTH', () => game.flyTo('earth')],
    ['FLY TO MOON', () => game.flyTo('moon')],
    ['FLY TO MARS', () => game.flyTo('mars')],
    ['FLY TO BELT (inner edge)', () => game.flyTo('belt')],
    ['FLY TO EUROPA', () => game.flyTo('europa')],
    ['FLY TO TITAN', () => game.flyTo('titan')],
    ['SET TIME TO 1:55 AM (sleep test)', () => game.setTime(115)]
  ];

  const status = document.createElement('div');
  status.style.cssText = 'margin-top:6px;color:#ff9a9a;min-height:14px';

  const title = document.createElement('div');
  title.textContent = 'ADMIN MODE (temporary)';
  title.style.cssText = 'color:#ff5a5a;font-weight:bold;margin-bottom:6px';
  panel.append(title);

  const toggles = [];

  for (const action of actions) {
    const row = document.createElement('button');
    row.style.cssText =
      'display:block;width:100%;margin:2px 0;text-align:left;font:11px monospace;' +
      'background:#2a0c0c;color:#ffd0d0;border:1px solid #6a2a2a;padding:4px;cursor:pointer';

    if (action[0] === 'toggle') {
      const [, flag, label] = action;
      const paint = () => { row.textContent = `[${adminFlags[flag] ? 'ON ' : 'OFF'}] ${label}`; };
      paint();
      toggles.push(paint);
      row.onclick = () => { adminFlags[flag] = !adminFlags[flag]; paint(); };
    } else {
      const [label, run] = action;
      row.textContent = label;
      row.onclick = () => {
        try { status.textContent = run() || 'DONE'; }
        catch (error) { status.textContent = 'ERROR: ' + error.message; console.error(error); }
      };
    }

    // Don't let clicks fall through to the game (gauge / attacks).
    row.addEventListener('pointerdown', event => event.stopPropagation());
    panel.append(row);
  }

  panel.append(status);
  panel.addEventListener('pointerdown', event => event.stopPropagation());
  button.addEventListener('pointerdown', event => event.stopPropagation());

  const toggle = () => { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; };
  button.onclick = toggle;

  window.addEventListener('keydown', event => {
    if (event.code === 'Backquote' && !event.repeat) {
      event.preventDefault();
      toggle();
    }
  });

  document.body.append(button, panel);
}
