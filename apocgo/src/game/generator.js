// Procedural road generation. Pure data (no canvas) — deterministic per (seed, chunk)
// and unit-testable in Node.
//
// A chunk is a horizontal strip of road CHUNK_H tall. Chunk i spans world y in
// [−(i+1)·CHUNK_H, −i·CHUNK_H). Each chunk is split into 3 "bands"; a band holds at
// most one big blocker, which keeps the road always passable.

import { RNG, hashSeed } from '../engine/rng.js';
import { aabbOverlap, clamp } from '../engine/math.js';
import {
  CHUNK_H, ROAD_HALF, DRIVE_HALF, SAFE_CHUNKS, SPAWN, ZOMBIE, PICKUPS, GRAFFITI,
} from './config.js';

const BANDS = 3;

// Big obstacles. `solid` blocks the truck; w/h ranges in px.
const BLOCKERS = {
  collapse: { weight: 3, w: [48, 104], h: [26, 44] }, // провал / обвал асфальта
  rubble: { weight: 3, w: [28, 58], h: [18, 30] }, // обломки, камни
  wreck: { weight: 3 }, // брошенная машина
  pole: { weight: 2, w: [60, 110], h: [6, 6] }, // упавший столб
  tree: { weight: 2, w: [50, 84], h: [10, 12] }, // поваленное дерево
};

export function difficultyFor(chunkIndex) {
  return clamp(chunkIndex / SPAWN.difficultyChunks, 0, 1);
}

export function generateChunk(seed, index) {
  const rng = new RNG(hashSeed(seed, index));
  const top = -(index + 1) * CHUNK_H;
  const d = difficultyFor(index);
  const out = { obstacles: [], zombies: [], pickups: [], decals: [], decor: [] };
  const solids = []; // for overlap checks while placing

  addDecor(rng, top, out);
  addCracks(rng, top, out, 3 + rng.int(0, 3));
  if (index < SAFE_CHUNKS) return out;

  if (rng.chance(SPAWN.graffitiChance)) {
    out.decals.push({
      kind: 'graffiti',
      text: rng.pick(GRAFFITI),
      x: rng.pick([-ROAD_HALF / 2, ROAD_HALF / 2]),
      y: top + rng.range(40, CHUNK_H - 40),
    });
  }

  // 1. One optional blocker per band.
  const bandH = CHUNK_H / BANDS;
  for (let b = 0; b < BANDS; b++) {
    if (!rng.chance(SPAWN.blockerChance(d))) continue;
    const kind = rng.weighted(Object.fromEntries(Object.entries(BLOCKERS).map(([k, v]) => [k, v.weight])));
    const ob = makeBlocker(rng, kind);
    ob.x = rng.range(-ROAD_HALF - 20 + ob.w / 2, ROAD_HALF + 20 - ob.w / 2);
    ob.y = top + b * bandH + rng.range(ob.h / 2 + 4, bandH - ob.h / 2 - 4);
    out.obstacles.push(ob);
    solids.push(ob);
  }

  // 2. Potholes (hazard, not solid) — only on asphalt.
  for (let i = rng.int(...SPAWN.potholes(d)); i > 0; i--) {
    const r = rng.range(5, 10);
    const p = place(rng, top, solids, r * 2, r * 2, ROAD_HALF - r);
    if (p) out.obstacles.push({ kind: 'pothole', ...p, r, solid: false, hazard: true, seed: rng.int(0, 1e9) });
  }

  // 3. Small breakable debris: barrels and tyres.
  for (let i = rng.int(...SPAWN.smallDebris(d)); i > 0; i--) {
    const kind = rng.chance(0.6) ? 'barrel' : 'tire';
    const p = place(rng, top, solids, 9, 9, DRIVE_HALF - 8);
    if (!p) continue;
    const ob = { kind, ...p, solid: false, breakable: true, seed: rng.int(0, 1e9) };
    out.obstacles.push(ob);
    solids.push(ob);
  }

  // 4. Zombies.
  for (let i = rng.int(...SPAWN.zombies(d)); i > 0; i--) {
    const p = place(rng, top, solids, 10, 12, DRIVE_HALF - 6);
    if (!p) continue;
    out.zombies.push({
      ...p,
      speed: rng.range(...ZOMBIE.speed),
      chaseSpeed: rng.range(...ZOMBIE.chaseSpeed),
      dir: rng.range(0, Math.PI * 2),
      t: rng.range(0, 10),
      variant: rng.int(0, 2),
      dead: false,
    });
  }

  // 5. Pickups — half of them lure the player onto the slower shoulders.
  for (const [type, chance] of Object.entries(SPAWN.pickupChance)) {
    if (!rng.chance(chance)) continue;
    const onShoulder = rng.chance(0.5);
    const p = place(rng, top, solids, 12, 12, onShoulder ? DRIVE_HALF - 8 : ROAD_HALF - 8, onShoulder ? ROAD_HALF + 10 : 0);
    if (!p) continue;
    const def = PICKUPS[type];
    const ob = { type, amount: rng.int(def.min, def.max), ...p, t: rng.range(0, 6), taken: false };
    out.pickups.push(ob);
    solids.push(ob);
  }

  return out;
}

function makeBlocker(rng, kind) {
  const base = { kind, solid: true, seed: rng.int(0, 1e9) };
  if (kind === 'wreck') {
    const horizontal = rng.chance(0.5);
    return { ...base, w: horizontal ? 36 : 20, h: horizontal ? 20 : 36, horizontal, variant: rng.int(0, 2) };
  }
  const def = BLOCKERS[kind];
  return { ...base, w: Math.round(rng.range(...def.w)), h: Math.round(rng.range(...def.h)) };
}

/**
 * Find a free spot inside the chunk. `maxX` bounds |x|; `minX` (optional) forces
 * |x| ≥ minX (used to put items on the shoulders).
 */
function place(rng, top, solids, w, h, maxX, minX = 0, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const side = rng.chance(0.5) ? 1 : -1;
    const x = minX > 0 ? side * rng.range(minX, maxX) : rng.range(-maxX, maxX);
    const box = { x, y: top + rng.range(h, CHUNK_H - h), w: w + 6, h: h + 6 };
    if (!solids.some((s) => aabbOverlap(box, s))) return { x: box.x, y: box.y, w, h };
  }
  return null;
}

function addCracks(rng, top, out, n) {
  for (let i = 0; i < n; i++) {
    let x = rng.range(-ROAD_HALF + 6, ROAD_HALF - 6);
    let y = top + rng.range(0, CHUNK_H);
    const pts = [[x, y]];
    let a = rng.range(0, Math.PI * 2);
    for (let s = rng.int(3, 7); s > 0; s--) {
      a += rng.range(-0.9, 0.9);
      const len = rng.range(5, 14);
      x = clamp(x + Math.cos(a) * len, -ROAD_HALF + 2, ROAD_HALF - 2);
      y += Math.sin(a) * len;
      pts.push([x, y]);
    }
    out.decals.push({ kind: 'crack', points: pts });
  }
}

function addDecor(rng, top, out) {
  for (const side of [-1, 1]) {
    for (let i = rng.int(1, 3); i > 0; i--) {
      out.decor.push({
        kind: rng.weighted({ deadTree: 4, bush: 4, wreckSide: 1, billboard: 1, barrels: 2 }),
        x: side * rng.range(DRIVE_HALF + 8, DRIVE_HALF + 40),
        y: top + rng.range(0, CHUNK_H),
        side,
        seed: rng.int(0, 1e9),
      });
    }
  }
}
