// Procedural road generation. Pure data (no canvas) — deterministic per (seed, chunk)
// and unit-testable in Node.
//
// A chunk is a horizontal strip of road CHUNK_H tall. Chunk i spans world y in
// [−(i+1)·CHUNK_H, −i·CHUNK_H). Big obstacles (fallen tree, wrecked cars, road
// collapse, rock slide) come one per row, in one of three lanes: left, middle or right.
// Rows sit in even chunks (≥ ~2 chunks apart). With difficulty an odd chunk may add a
// row in the *same* lane as the previous one — no extra swerve needed — so the road
// is always passable.

import { RNG, hashSeed } from '../engine/rng.js';
import { aabbOverlap, clamp } from '../engine/math.js';
import {
  ART, CHUNK_H, DECOR, DRIVE_HALF, OBSTACLES, OBSTACLE_ART_SCALE, PICKUPS, ROAD_HALF, SAFE_CHUNKS, SPAWN, ZOMBIE,
} from './config.js';
import { MASKS } from './masks.js';

export const LANES = ['left', 'middle', 'right'];

export function difficultyFor(chunkIndex) {
  return clamp(chunkIndex / SPAWN.difficultyChunks, 0, 1);
}

/**
 * The obstacle row of a chunk, if any: { kind, lane }. Uses its own RNG stream so a
 * chunk can look up its neighbour's row without generating the whole neighbour.
 */
export function rowPlan(seed, index) {
  if (index < SAFE_CHUNKS) return null;
  const key = `${seed}:${index}`;
  if (planCache.has(key)) return planCache.get(key);
  const rng = new RNG(hashSeed(seed, index, 'row'));
  const d = difficultyFor(index);
  const weights = Object.fromEntries(Object.entries(OBSTACLES).map(([k, v]) => [k, v.weight]));
  // a row right after another one (one chunk apart) must keep its lane
  const prev = rowPlan(seed, index - 1);
  let plan = null;
  if (index % 2 === 0) {
    if (rng.chance(SPAWN.rowChance(d))) plan = { kind: rng.weighted(weights), lane: prev ? prev.lane : rng.pick(LANES) };
  } else if (prev && rng.chance(SPAWN.followChance(d))) {
    // odd chunk: optional follow-up row in the same lane as the previous one
    plan = { kind: rng.weighted(weights), lane: prev.lane };
  }
  if (planCache.size > 4000) planCache.clear();
  planCache.set(key, plan);
  return plan;
}

const planCache = new Map();

/** Build the obstacle object for a row (position, size, collision mask, mirroring). */
export function makeObstacle(kind, lane, y, rng) {
  const def = OBSTACLES[kind];
  const mask = MASKS[def.art];
  const k = OBSTACLE_ART_SCALE;
  const w = Math.round(mask.w * k);
  const h = Math.round(mask.h * k);
  const inset = def.inset ?? 20; // how far the art may poke past the asphalt edge
  const x = lane === 'left' ? -ROAD_HALF + w / 2 - inset
    : lane === 'right' ? ROAD_HALF - w / 2 + inset
      : rng.range(-40, 40);
  // art is painted for one side of the road; mirror it when placed on the other one
  const flip = lane === 'middle' ? rng.chance(0.5) : (lane === 'left') !== (def.side === 'left');
  return { kind, lane, art: def.art, mask: def.art, x, y, w, h, flip, solid: true, ground: !!def.ground };
}

export function generateChunk(seed, index) {
  const rng = new RNG(hashSeed(seed, index));
  const top = -(index + 1) * CHUNK_H;
  const d = difficultyFor(index);
  const out = { obstacles: [], zombies: [], pickups: [], decals: [], decor: [] };
  const solids = []; // for overlap checks while placing

  addDecor(rng, top, out);
  addCracks(rng, top, out, rng.int(7, 12));
  for (let i = rng.int(0, 2); i > 0; i--) {
    out.decals.push({
      kind: 'art', art: rng.pick(ART.blood), flip: rng.chance(0.5),
      x: rng.range(-ROAD_HALF + 40, ROAD_HALF - 40), y: top + rng.range(0, CHUNK_H),
    });
  }
  if (index < SAFE_CHUNKS) return out;

  if (rng.chance(SPAWN.graffitiChance)) {
    out.decals.push({
      kind: 'art',
      art: rng.pick(ART.graffiti),
      x: rng.pick([-1, 1]) * rng.range(ROAD_HALF * 0.35, ROAD_HALF * 0.65),
      y: top + rng.range(150, CHUNK_H - 150),
    });
  }

  // 1. The obstacle row.
  const plan = rowPlan(seed, index);
  if (plan) {
    const y = top + CHUNK_H / 2 + rng.range(-SPAWN.rowJitter, SPAWN.rowJitter);
    const ob = makeObstacle(plan.kind, plan.lane, y, rng);
    out.obstacles.push(ob);
    solids.push(ob);
  }

  // 2. Zombies.
  for (let i = rng.int(...SPAWN.zombies(d)); i > 0; i--) {
    const p = place(rng, top, solids, ZOMBIE.w, ZOMBIE.h, DRIVE_HALF - 20);
    if (!p) continue;
    out.zombies.push({
      ...p,
      speed: rng.range(...ZOMBIE.speed),
      chaseSpeed: rng.range(...ZOMBIE.chaseSpeed),
      dir: rng.range(0, Math.PI * 2),
      t: rng.range(0, 10),
      art: rng.pick(ART.zombies),
      dead: false,
    });
  }

  // 3. Pickups — half of them lure the player onto the slower shoulders.
  for (const [type, chance] of Object.entries(SPAWN.pickupChance)) {
    if (!rng.chance(chance)) continue;
    const onShoulder = rng.chance(0.5);
    const p = place(rng, top, solids, 44, 44, onShoulder ? DRIVE_HALF - 30 : ROAD_HALF - 30, onShoulder ? ROAD_HALF + 40 : 0);
    if (!p) continue;
    const def = PICKUPS[type];
    const ob = { type, amount: rng.int(def.min, def.max), ...p, t: rng.range(0, 6), taken: false };
    out.pickups.push(ob);
    solids.push(ob);
  }

  return out;
}

/**
 * Find a free spot inside the chunk. `maxX` bounds |x|; `minX` (optional) forces
 * |x| ≥ minX (used to put items on the shoulders).
 */
function place(rng, top, solids, w, h, maxX, minX = 0, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const side = rng.chance(0.5) ? 1 : -1;
    const x = minX > 0 ? side * rng.range(minX, maxX) : rng.range(-maxX, maxX);
    const box = { x, y: top + rng.range(h, CHUNK_H - h), w: w + 20, h: h + 20 };
    if (!solids.some((s) => aabbOverlap(box, s))) return { x: box.x, y: box.y, w, h };
  }
  return null;
}

function addCracks(rng, top, out, n) {
  for (let i = 0; i < n; i++) {
    out.decals.push({
      kind: 'art',
      art: rng.pick(ART.cracks),
      x: rng.range(-ROAD_HALF + 60, ROAD_HALF - 60),
      y: top + rng.range(0, CHUNK_H),
      flip: rng.chance(0.5),
    });
  }
}

function addDecor(rng, top, out) {
  for (const side of [-1, 1]) {
    const weights = Object.fromEntries(
      Object.entries(DECOR).filter(([, v]) => !v.side || v.side === side).map(([k, v]) => [k, v.weight]),
    );
    // walk down the chunk so decor pieces don't pile on top of each other
    let y = top + rng.range(0, 120);
    let prev = null;
    while (y < top + CHUNK_H) {
      let kind = rng.weighted(weights);
      if (kind === prev) kind = rng.chance(0.5) ? 'bush' : 'tree1';
      prev = kind;
      const half = DECOR[kind].w / 2;
      out.decor.push({
        kind,
        x: side * (DRIVE_HALF + 40 + half + rng.range(0, 180)),
        y,
        side,
        // art is drawn for the left side; mirror it on the right unless it carries text
        flip: DECOR[kind].side ? false : side > 0 ? !rng.chance(0.2) : rng.chance(0.2),
        seed: rng.int(0, 1e9),
      });
      y += rng.range(160, 360);
    }
  }
}
