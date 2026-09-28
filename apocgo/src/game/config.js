// All gameplay tuning lives here so balancing never requires touching logic.

export const VIEW_W = 480;
export const VIEW_H = 270;

// World layout (world units = pixels of the low-res buffer). The truck drives "north" (−y).
export const ROAD_HALF = 96; // asphalt from −96 to +96
export const DRIVE_HALF = 214; // truck can go onto the shoulders up to here
export const CHUNK_H = 270; // world is generated in horizontal strips of this height
export const PX_PER_METER = 10;
export const SAFE_CHUNKS = 2; // first chunks are obstacle-free

export function goalMeters(level) {
  return 1500 + level * 500;
}

// Base truck stats before upgrades.
export const TRUCK_BASE = {
  maxSpeed: 150, // px/s
  accel: 85,
  brake: 190,
  drag: 35,
  handling: 110, // lateral px/s at full steer
  offroad: 0.55, // max-speed multiplier on the shoulders
  maxHp: 100,
  maxFuel: 100,
  ram: 1, // damage multiplier when hitting zombies / small debris
};

// Upgrades cost scrap ("запчасти"). Each entry: per-level bonus + cost per level.
export const UPGRADES = {
  engine: {
    name: 'Двигатель',
    desc: '+скорость и разгон',
    costs: [20, 40, 70, 110],
    apply: (s, lvl) => {
      s.maxSpeed += 18 * lvl;
      s.accel += 15 * lvl;
    },
  },
  armor: {
    name: 'Броня',
    desc: '+прочность корпуса',
    costs: [15, 35, 60, 100],
    apply: (s, lvl) => {
      s.maxHp += 25 * lvl;
    },
  },
  tires: {
    name: 'Шины',
    desc: '+управляемость и бездорожье',
    costs: [15, 30, 55, 90],
    apply: (s, lvl) => {
      s.handling += 12 * lvl;
      s.offroad += 0.08 * lvl;
    },
  },
  ram: {
    name: 'Таран',
    desc: '−урон от зомби и мусора',
    costs: [20, 45, 75, 120],
    apply: (s, lvl) => {
      s.ram *= 1 - 0.18 * lvl;
    },
  },
  tank: {
    name: 'Бак',
    desc: '+запас топлива',
    costs: [10, 25, 45, 80],
    apply: (s, lvl) => {
      s.maxFuel += 25 * lvl;
    },
  },
};

export const UPGRADE_KEYS = Object.keys(UPGRADES);

export function computeTruckStats(upgrades = {}) {
  const s = { ...TRUCK_BASE };
  for (const key of UPGRADE_KEYS) UPGRADES[key].apply(s, upgrades[key] || 0);
  return s;
}

export function upgradeCost(key, level) {
  const costs = UPGRADES[key].costs;
  return level < costs.length ? costs[level] : null; // null = maxed out
}

// Survival.
export const SURVIVAL = {
  hungerRate: 1.5, // satiety points lost per second (driver)
  dogHungerRate: 1.3, // (dog)
  mealValue: 40,
  starveLimit: 15, // seconds at 0 satiety before death
  fuelIdle: 0.25, // fuel/s while the engine runs
  fuelThrottle: 0.95, // extra fuel/s at full throttle & top speed
  noFuelLimit: 4, // seconds stalled with an empty tank before the run ends
};

// Pickups: the three core resources + fuel.
export const PICKUPS = {
  scrap: { name: 'запчасти', min: 2, max: 5 },
  food: { name: 'еда', min: 1, max: 1 },
  dogFood: { name: 'корм', min: 1, max: 1 },
  fuel: { name: 'топливо', min: 25, max: 35 },
};

// Per-chunk spawn tuning. `d` is difficulty 0..1 growing with distance.
export const SPAWN = {
  difficultyChunks: 60, // chunks until difficulty reaches 1
  zombies: (d) => [Math.round(1 + d * 3), Math.round(2 + d * 6)],
  potholes: (d) => [1, Math.round(2 + d * 3)],
  smallDebris: (d) => [0, Math.round(1 + d * 3)],
  blockerChance: (d) => 0.35 + d * 0.45, // per band (3 bands per chunk)
  pickupChance: { scrap: 0.22, food: 0.08, dogFood: 0.08, fuel: 0.1 },
  graffitiChance: 0.08,
};

export const ZOMBIE = {
  speed: [10, 22],
  chaseSpeed: [22, 34],
  sight: 130,
  killSpeed: 45, // truck speed needed to run a zombie over
  hitDamage: 4,
  grabDps: 6,
};

export const GRAFFITI = ['ЕЩЁ ЕДЕШЬ?', 'МЕРТВЕЦЫ ВПЕРЕДИ', 'НЕ ОСТАНАВЛИВАЙСЯ', 'SOS', 'ПОМОГИТЕ', 'НА СЕВЕР'];
