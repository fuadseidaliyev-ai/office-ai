// All gameplay tuning lives here so balancing never requires touching logic.

// World buffer. World units == pixels of the concept art (tools/reference.png), so the
// art in assets/ is drawn at native size.
// The camera shows 1.56x the concept-art frame (zoomed out) so obstacles show up early.
export let VIEW_W = 2496; // world units visible on screen
export let VIEW_H = 1404;
// The world is rendered into a buffer of this size (camera zoom = BUFFER_W / VIEW_W),
// which keeps the per-frame pixel cost independent of how far out the camera is.
export let BUFFER_W = 1600;
export let BUFFER_H = 900;
// Chase camera (view3d.js): behind and above the truck, the road runs to the horizon.
export const PERSP = {
  camH: 768, // camera height above the road (world units)
  camBack: 700, // how far behind the truck the camera sits
  focal: 592, // projection focal length (buffer px)
  horizon: 40, // horizon line on the 1600x900 buffer (near the top, like a chase cam)
  near: 480, // nothing closer than this is drawn
  far: 4600, // draw distance (haze covers the rest)
  groundScale: 0.5, // ground tile px per world unit
  groundHalfW: 1500, // ground tiles cover x = ±this
  followX: 0.55, // how much the camera follows the truck sideways
};

// UI layer works in its own small virtual resolution (crisp text, simple layout maths).
export let UI_W = 480;
export let UI_H = 270;

// Screen orientation. Portrait (phone held upright) swaps the view: the whole road fits
// the width and much more of it is visible ahead. Same camera zoom in both.
export let PORTRAIT = false;

export function setOrientation(portrait) {
  PORTRAIT = portrait;
  [VIEW_W, VIEW_H] = portrait ? [1404, 2496] : [2496, 1404];
  [BUFFER_W, BUFFER_H] = portrait ? [900, 1600] : [1600, 900];
  [UI_W, UI_H] = portrait ? [270, 480] : [480, 270];
}
// Procedural pixel sprites (pickups, rubble…) are drawn at this scale to match the art.
export const PIXEL = 3;
// Big road obstacles, cut from the road references in tools/obstacles/. World units per
// art pixel for them (the references are drawn at a slightly larger scale than the truck).
export const OBSTACLE_ART_SCALE = 0.665;
// `side`: which side of the road the art was painted on (it is mirrored for the other).
// `ground`: flat on the road (drawn under pickups and zombies).
// `scale`: per-obstacle override of OBSTACLE_ART_SCALE.
export const OBSTACLES = {
  tree: { art: 'obstTree', name: 'поваленное дерево', side: 'right', weight: 3 },
  cars: { art: 'obstCars', name: 'разбитые машины', side: 'left', weight: 3, scale: 0.46 },
  hole: { art: 'obstHole', name: 'провал', side: 'right', weight: 3, ground: true, inset: -40 },
  rocks: { art: 'obstRocks', name: 'каменный завал', side: 'right', weight: 3 },
};

// World layout. The truck drives "north" (−y).
export const ROAD_HALF = 520; // asphalt from −520 to +520
export const DRIVE_HALF = 440; // truck centre limit: the whole truck (150 wide) stays on the asphalt
export const CHUNK_H = 900; // world is generated in horizontal strips of this height
export const PX_PER_METER = 35;
export const SAFE_CHUNKS = 2; // first chunks are obstacle-free

export function goalMeters(level) {
  return 1500 + level * 500;
}

// Base truck stats before upgrades.
export const TRUCK_BASE = {
  maxSpeed: 720, // px/s
  accel: 408,
  brake: 700,
  drag: 130,
  handling: 460, // lateral px/s at full steer
  offroad: 0.55, // max-speed multiplier on the shoulders
  maxHp: 100,
  ram: 1, // collision damage multiplier (the ram upgrade lowers it)
};

// Upgrades cost scrap ("запчасти"). Each entry: per-level bonus + cost per level.
export const UPGRADES = {
  engine: {
    name: 'Двигатель',
    desc: '+скорость и разгон',
    costs: [20, 40, 70, 110],
    apply: (s, lvl) => {
      s.maxSpeed += 72 * lvl;
      s.accel += 60 * lvl;
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
    desc: '+управляемость',
    costs: [15, 30, 55, 90],
    apply: (s, lvl) => {
      s.handling += 40 * lvl;
      s.offroad += 0.08 * lvl;
    },
  },
  ram: {
    name: 'Таран',
    desc: '−урон от столкновений',
    costs: [20, 45, 75, 120],
    apply: (s, lvl) => {
      s.ram *= 1 - 0.18 * lvl;
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
  dogHungerRate: 1.6, // (dog — it works hard: it's the one shooting)
  mealValue: 45,
  autoEatBelow: 20, // driver / dog eat from the stock by themselves below this satiety
  hungrySpeed: 0.6, // top-speed multiplier while the driver is starving
  partRepair: 8, // armour restored by one car part
};

// Pickups: the three core resources. `art` = image in assets/, `size` = drawn width.
//  scrap   — car parts: repair the truck on the spot, the rest goes to the garage
//  food    — the driver's food: starving makes the truck slow
//  dogFood — the dog's food: a hungry dog stops shooting
export const PICKUPS = {
  scrap: { name: 'детали', min: 2, max: 5, art: 'pickScrap', size: 135 },
  food: { name: 'еда', min: 1, max: 1, art: 'pickFood', size: 105 },
  dogFood: { name: 'корм', min: 1, max: 1, art: 'pickDogFood', size: 97 },
};

// The dog rides in the bed with a shotgun: unlimited shells, shoots zombies on its own
// while it is fed.
export const DOG_GUN = {
  range: 640, // px from the truck
  cooldown: 0.45,
  turnSpeed: 7, // rad/s the dog swings the gun around
  aimTolerance: 0.18, // rad: fires once the barrel points this close to the target
  pivot: { x: 0.5, y: 10 }, // turret pivot relative to the truck centre (truckGun art)
  barrel: 105, // pivot → muzzle distance
};

// Per-chunk spawn tuning. `d` is difficulty 0..1 growing with distance.
export const SPAWN = {
  difficultyChunks: 60, // chunks until difficulty reaches 1
  zombies: (d) => [Math.round(1 + d * 3), Math.round(2 + d * 6)],
  rowChance: (d) => 0.85 + d * 0.15, // chance an even chunk has an obstacle row
  followChance: (d) => d * 0.45, // chance an odd chunk repeats the previous row's lane
  rowJitter: 80, // rows sit at chunk middle ± this
  pickupChance: { scrap: 0.3, food: 0.12, dogFood: 0.12 },
  graffitiChance: 0.15,
};

export const ZOMBIE = {
  speed: [35, 70],
  chaseSpeed: [75, 115],
  sight: 450,
  killSpeed: 150, // truck speed needed to run a zombie over (~15 km/h)
  w: 44,
  h: 80,
  grabDrag: 120, // px/s² a clinging zombie slows the truck (zombies never cost armour)
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
