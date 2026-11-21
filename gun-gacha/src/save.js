// Saves progress in the browser (localStorage). Safe if storage is blocked.
// v2: new skin list (pictures) - old v1 saves had different skin ids, so they are not loaded.
const SAVE_KEY = 'gunGacha.save.v2';

export function newGame() {
  return {
    money: 0,
    totalEarned: 0,
    clicks: 0,
    rolls: { gun: 0, att: 0 },
    pity: { gun: { mythic: 0, legendary: 0 }, att: { mythic: 0, legendary: 0 } },
    guns: {},        // inventory: { "skinId|wearId": count }
    atts: {},
    equipped: null,  // key of the gun shown in the middle (null = starter gun)
    muted: false,
    lastSaved: Date.now(),
  };
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const fresh = newGame();
    return {
      ...fresh, ...data,
      rolls: { ...fresh.rolls, ...data.rolls },
      pity: { gun: { ...fresh.pity.gun, ...data.pity?.gun }, att: { ...fresh.pity.att, ...data.pity?.att } },
    };
  } catch {
    return null;
  }
}

export function saveGame(state) {
  try {
    state.lastSaved = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked (private window etc.) - the game still works, it just won't remember.
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
