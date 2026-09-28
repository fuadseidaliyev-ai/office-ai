// All gameplay tuning lives here so balancing never requires touching logic.

// World buffer. World units == pixels of the concept art (tools/reference.png), so the
// art in assets/ is drawn at native size.
// The camera shows 1.3x the concept-art frame (zoomed out) so there is more road to read.
export const VIEW_W = 2080; // world units visible on screen
export const VIEW_H = 1170;
// The world is rendered into a buffer of this size (camera zoom = BUFFER_W / VIEW_W),
// which keeps the per-frame pixel cost independent of how far out the camera is.
export const BUFFER_W = 1600;
export const BUFFER_H = 900;
// UI layer works in its own small virtual resolution (crisp text, simple layout maths).
export const UI_W = 480;
export const UI_H = 270;
// Procedural pixel sprites (pickups, rubble…) are drawn at this scale to match the art.
export const PIXEL = 3;
// Obstacles are drawn (and collide) smaller than in the concept art, so the truck has
// room to weave between them.
export const OBSTACLE_SCALE = 0.72;

// World layout. The truck drives "north" (−y).
export const ROAD_HALF = 520; // asphalt from −520 to +520
export const DRIVE_HALF = 680; // truck can go onto the shoulders up to here
export const CHUNK_H = 900; // world is generated in horizontal strips of this height
export const PX_PER_METER = 35;
export const SAFE_CHUNKS = 2; // first chunks are obstacle-free

export function goalMeters(level) {
  return 1500 + level * 500;
}

// Base truck stats before upgrades.
export const TRUCK_BASE = {
  maxSpeed: 600, // px/s
  accel: 340,
  brake: 700,
  drag: 130,
  handling: 460, // lateral px/s at full steer
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
      s.maxSpeed += 60 * lvl;
      s.accel += 50 * lvl;
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
      s.handling += 40 * lvl;
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
  ammo: { name: 'патроны', min: 4, max: 8 },
};

export const SHOTGUN = {
  clip: 8,
  startReserve: 24,
  range: 560, // px from the truck
  cooldown: 0.5,
  reload: 1.4,
};

// Per-chunk spawn tuning. `d` is difficulty 0..1 growing with distance.
export const SPAWN = {
  difficultyChunks: 60, // chunks until difficulty reaches 1
  zombies: (d) => [Math.round(1 + d * 3), Math.round(2 + d * 6)],
  blockerChance: (d) => 0.35 + d * 0.45, // per band (3 bands per chunk)
  pickupChance: { scrap: 0.22, food: 0.08, dogFood: 0.08, fuel: 0.1, ammo: 0.1 },
  graffitiChance: 0.15,
};

export const ZOMBIE = {
  speed: [35, 70],
  chaseSpeed: [75, 115],
  sight: 450,
  killSpeed: 150, // truck speed needed to run a zombie over (~15 km/h)
  w: 44,
  h: 80,
  hitDamage: 4,
  grabDps: 6,
};

// Art-backed variants (names of files in assets/).
export const ART = {
  zombies: ['zombie1', 'zombie2', 'zombie3', 'zombie4', 'zombie5', 'zombie6'],
  barrels: ['barrel1', 'barrel2', 'barrel3', 'barrel4', 'barrelLying1', 'barrelLying2'],
  tires: ['tire1', 'tire2'],
  cracks: ['cracks1', 'cracks2', 'cracks3', 'cracks4', 'cracks5'],
  blood: ['blood1', 'blood2', 'blood3'],
  graffiti: ['graffiti1', 'graffiti2'],
};

// Roadside decor: art name -> footprint width (used to keep it off the drivable area).
// `side` pins art with lettering to the side of the road it was painted for (mirroring
// would flip the text); art without `side` is mirrored freely.
export const DECOR = {
  tree1: { w: 141, weight: 4 },
  tree2: { w: 160, weight: 3 },
  bush: { w: 48, weight: 5 },
  police: { w: 302, weight: 1, side: -1 },
  sign: { w: 280, weight: 1, side: -1 },
  bus: { w: 406, weight: 1, side: 1 },
  billboard: { w: 345, weight: 1, side: 1 },
  guardrail: { w: 316, weight: 2 },
  barrels: { w: 90, weight: 3 },
};
