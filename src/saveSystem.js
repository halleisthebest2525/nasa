const STORAGE_KEY = 'nasareth.saves.v1';

export function readSaves() {
  try {
    const saves = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saves) ? saves : [];
  } catch {
    return [];
  }
}

export function writeSave(name, snapshot) {
  const saves = readSaves();

  const cleanName = String(name || 'Expedition')
    .trim()
    .slice(0, 28) || 'Expedition';

  const existingIndex = saves.findIndex(
    save => save.name === cleanName
  );

  const entry = {
    id: existingIndex >= 0
      ? saves[existingIndex].id
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: cleanName,
    savedAt: new Date().toISOString(),
    snapshot
  };

  if (existingIndex >= 0) {
    saves.splice(existingIndex, 1);
  }

  saves.unshift(entry);
  saves.splice(12);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));

  return entry;
}

export function removeSave(id) {
  const saves = readSaves().filter(save => save.id !== id);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));

  return saves;
}

export function applySnapshot(save, objects) {
  if (!save || !objects) return;

  const assignKnown = (target, source) => {
    if (!target || !source || typeof source !== 'object') return;

    for (const [key, value] of Object.entries(source)) {
      if (
        key === 'assets' ||
        key === 'keys' ||
        typeof value === 'function'
      ) continue;

      if (value instanceof Set || value instanceof Map) continue;

      target[key] = value;
    }
  };

  assignKnown(objects.ship, save.ship);
  assignKnown(objects.survival, save.survival);

  if (save.moon) {
    const { scraps, ...moonState } = save.moon;

    assignKnown(objects.moonSurface, moonState);

    if (scraps && objects.moonSurface?.scraps) {
      assignKnown(objects.moonSurface.scraps, scraps);
      objects.moonSurface.scraps.inventoryOpen = false;
    }
  }

  assignKnown(objects.onFoot, save.onFoot);

  if (objects.onFoot?.clearKeys) {
    objects.onFoot.clearKeys();
  }

  if (
    Array.isArray(save.world?.asteroids) &&
    objects.world &&
    save.world.asteroids.length >= objects.world.asteroids.length
  ) {
    objects.world.asteroids = save.world.asteroids;
  }
}