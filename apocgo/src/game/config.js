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
  barricade: { art: 'obstBarricade', name: 'деревянная баррикада', side: 'right', weight: 2, scale: 0.55 },
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
// It fires strictly in 4 directions relative to the truck (forward / right / back /
// left), at zombies inside that direction's corridor, each with its own pose art.
export const DOG_GUN = {
  range: 640, // px along the firing line
  corridor: 120, // half-width of the strip along each firing line that gets hit
  cooldown: 0.45,
  switchTime: 0.15, // s to turn to another direction before the first shot
  pivot: { x: 0.5, y: 10 }, // forward pose pivot relative to the truck centre
  // per direction (truck-local, 0 = forward, clockwise): pose sprite (null = the forward
  // turret art), where it sits and where the muzzle is, relative to the truck centre
  poses: [
    { art: null, at: { x: 0.5, y: 10 }, muzzle: { x: 0.5, y: -95 } },
    { art: 'dogRight', flip: false, scale: 1.22, at: { x: 6, y: 40 }, muzzle: { x: 90, y: 38 } },
    { art: 'dogBack', flip: false, scale: 1.22, at: { x: -2, y: 23 }, muzzle: { x: 8, y: 86 } },
    { art: 'dogRight', flip: true, scale: 1.22, at: { x: -6, y: 40 }, muzzle: { x: -90, y: 38 } },
  ],
};

// Truck levels. The truck turns into the next level for the rest of the run (art from
// tools/levels/) once BOTH bars are full: energy (charged by killing zombies) up to that
// level's `energy`, and car parts (what's left after repairs) up to its `parts`. Both bars
// start over after an upgrade (the parts are built into the truck). Per level:
//  art / turret — body sprite and the forward dog + machine gun drawn on it (null: the
//                 level-1 turret art); turretAt — turret centre from the truck centre
//  dy / front   — art centre offset and nose distance (bigger trucks stick out forward,
//                 the rear stays put); muzzle / bed — forward muzzle, side poses' offset
//  ram          — collision damage multiplier (the reinforced bumper)
//  smash        — obstacle kinds the truck ploughs through instead of crashing
//  gun          — the dog's machine gun: seconds between shots, damage per bullet, range
export const TRUCK_LEVELS = [
  { level: 1, energy: 0, art: 'truckGun', turret: null, dy: 0, ram: 1, smash: [],
    gun: { cooldown: 0.45, damage: 1, range: 640 } },
  { level: 2, energy: 12, parts: 10, art: 'truckL2', dy: -15, front: 192, brakeLights: [62, 137],
    turret: 'turretL2', turretAt: { x: -2, y: 10 }, muzzle: { x: -2, y: -83 }, bed: { x: 0, y: 18 },
    ram: 0.6, smash: [], banner: 'bannerL2', gun: { cooldown: 0.32, damage: 1, range: 700 } },
  { level: 3, energy: 18, parts: 15, art: 'truckL3', dy: -42, front: 246, brakeLights: [75, 159],
    turret: 'turretL3', turretAt: { x: 2, y: -23.5 }, muzzle: { x: 2, y: -116 }, bed: { x: 0, y: -16 },
    ram: 0.5, smash: ['tree', 'barricade'], banner: 'bannerL3', gun: { cooldown: 0.24, damage: 2, range: 760 } },
  { level: 4, energy: 25, parts: 20, art: 'truckL4', dy: -59, front: 280, brakeLights: [80, 171],
    turret: 'turretL4', turretAt: { x: 1, y: -20 }, muzzle: { x: 1, y: -146 }, bed: { x: 0, y: 16 },
    ram: 0.4, smash: ['tree', 'barricade', 'rocks', 'cars'], banner: 'bannerL4', gun: { cooldown: 0.16, damage: 3, range: 820 } },
];

// Final scene: at the tower the horde attacks from behind. Survive `time` seconds while it
// chases the truck. Distances are shares of the screen height (VIEW_H).
export const HORDE = {
  time: 60,
  speed: 520, // px/s the pack runs (the truck's top speed is 720, hungry 432)
  size: 140, // zombies in the pack (killed ones are replaced at the back)
  stragglers: 12, // of them running ahead of the pack toward the truck
  stragglerEvery: 0.9, // s between new stragglers breaking away (replacing killed ones)
  gap: 0.33, // pack front line below the truck, at most
  depth: 0.4, // pack depth behind its front line
  ahead: 0.22, // stragglers start up to this far ahead of the line
  creep: [15, 50], // px/s stragglers gain on the pack
  contactDps: 2, // armour per second each zombie hanging on the truck takes (at most 4 count)
  packDps: 12, // armour per second more when the pack itself catches the truck
  kinds: { walker: 6, runner: 2, heavy: 2 },
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
  sight: 450,
  killSpeed: 150, // truck speed needed to run a zombie over (~15 km/h)
  grabDrag: 120, // px/s² a clinging zombie slows the truck
};

// Zombie kinds (art from tools/zombies/). `art` + a facing name = file in assets/
// (z1Down, z2UpRight…); `dirs` = 4 or 8 facings. `energy` = truck energy per kill.
// `hp` = damage to kill (a level-1 bullet does 1);
// `crash` = armour the truck loses running it over (only the heavy one hurts).
export const ZOMBIE_TYPES = {
  walker: { name: 'бродяга', art: 'z1', dirs: 4, weight: 5, hp: 1, crash: 0, energy: 0.1, w: 44, h: 80, speed: [35, 70], chaseSpeed: [75, 115] },
  runner: { name: 'бегун', art: 'z2', dirs: 8, weight: 3, hp: 1, crash: 0, energy: 0.2, w: 44, h: 80, speed: [80, 120], chaseSpeed: [200, 250] },
  heavy: { name: 'тяжёлый', art: 'z3', dirs: 4, weight: 2, hp: 5, crash: 6, energy: 0.4, w: 70, h: 100, speed: [25, 45], chaseSpeed: [55, 75] },
};
/** A zombie's kind definition (zombies without a `type` are walkers). */
export function zombieType(z) {
  return ZOMBIE_TYPES[z.type] || ZOMBIE_TYPES.walker;
}

export const ZOMBIE_FACINGS = {
  4: ['Right', 'Down', 'Left', 'Up'],
  8: ['Right', 'DownRight', 'Down', 'DownLeft', 'Left', 'UpLeft', 'Up', 'UpRight'],
};

// Art-backed variants (names of files in assets/).
export const ART = {
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
