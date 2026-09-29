// Persistent progress (localStorage). Everything is optional-chained so the game
// still works in private mode / when storage is blocked.

const KEY = 'apocgo.save.v1';

export function defaultSave() {
  return {
    version: 1,
    level: 0,
    runs: 0,
    bestDistance: 0,
    inventory: { scrap: 0, food: 3, dogFood: 3, ammo: 24 },
    upgrades: { engine: 0, armor: 0, tires: 0, ram: 0 },
  };
}

/** Merge a (possibly old or partial) save onto defaults. */
export function normalizeSave(raw) {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  return {
    ...d,
    ...raw,
    inventory: { ...d.inventory, ...(raw.inventory || {}) },
    upgrades: { ...d.upgrades, ...(raw.upgrades || {}) },
  };
}

export function loadSave(storage = globalThis.localStorage) {
  try {
    const s = storage?.getItem(KEY);
    return normalizeSave(s ? JSON.parse(s) : null);
  } catch {
    return defaultSave();
  }
}

export function writeSave(data, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable — progress stays in memory only */
  }
}

export function resetSave(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return defaultSave();
}
