// Procedural road generation. Pure data (no canvas) — deterministic per (seed, chunk)
// and unit-testable in Node.
//
// A chunk is a horizontal strip of road CHUNK_H tall. Chunk i spans world y in
// [−(i+1)·CHUNK_H, −i·CHUNK_H). Each chunk is split into 3 "bands"; a band holds at
// most one big blocker, which keeps the road always passable.

import { RNG, hashSeed } from '../engine/rng.js';
import { aabbOverlap, clamp } from '../engine/math.js';
import {
  ART, CHUNK_H, DECOR, DRIVE_HALF, OBSTACLE_SCALE as S, PICKUPS, ROAD_HALF, SAFE_CHUNKS, SPAWN, ZOMBIE,
} from './config.js';

const BANDS = 3;

// Big obstacles. `solid` blocks the truck; w/h ranges in px (the hitbox).
const BLOCKERS = {
  collapse: { weight: 3 }, // провал асфальта
  barricade: { weight: 3, w: [150, 230], h: [80, 110] }, // завал из бочек и покрышек
  wreck: { weight: 3 }, // брошенная полицейская машина
  rail: { weight: 2 }, // сорванный отбойник
  tree: { weight: 2 }, // поваленное дерево
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

  // 1. One optional blocker per band.
  const bandH = CHUNK_H / BANDS;
  for (let b = 0; b < BANDS; b++) {
    if (!rng.chance(SPAWN.blockerChance(d))) continue;
    const kind = rng.weighted(Object.fromEntries(Object.entries(BLOCKERS).map(([k, v]) => [k, v.weight])));
    const ob = makeBlocker(rng, kind);
    ob.x = rng.range(-ROAD_HALF - 60 + ob.w / 2, ROAD_HALF + 60 - ob.w / 2);
    ob.y = top + b * bandH + rng.range(ob.h / 2 + 10, bandH - ob.h / 2 - 10);
    out.obstacles.push(ob);
    solids.push(ob);
  }

  // 2. Potholes (hazard, not solid) — only on asphalt.
  for (let i = rng.int(...SPAWN.potholes(d)); i > 0; i--) {
    const r = rng.range(18, 32) * S;
    const p = place(rng, top, solids, r * 2, r * 2, ROAD_HALF - r);
    if (p) out.obstacles.push({ kind: 'pothole', ...p, r, solid: false, hazard: true, seed: rng.int(0, 1e9) });
  }

  // 3. Small breakable debris: barrels and tyres.
  for (let i = rng.int(...SPAWN.smallDebris(d)); i > 0; i--) {
    const tire = rng.chance(0.35);
    const art = rng.pick(tire ? ART.tires : ART.barrels);
    const p = place(rng, top, solids, 44 * S, 44 * S, DRIVE_HALF - 30);
    if (!p) continue;
    const ob = { kind: tire ? 'tire' : 'barrel', art, ...p, solid: false, breakable: true, flip: rng.chance(0.5) };
    out.obstacles.push(ob);
    solids.push(ob);
  }

  // 4. Zombies.
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

  // 5. Pickups — half of them lure the player onto the slower shoulders.
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

function makeBlocker(rng, kind) {
  const base = { kind, solid: true, seed: rng.int(0, 1e9), flip: rng.chance(0.5) };
  switch (kind) {
    case 'wreck': {
      // police car art is 302x175, seen from the side; vertical = rotated 90°
      const horizontal = rng.chance(0.6);
      const [a, b] = [Math.round(270 * S), Math.round(140 * S)];
      return { ...base, w: horizontal ? a : b, h: horizontal ? b : a, horizontal };
    }
    case 'collapse': {
      const w = Math.round(rng.range(180, 300) * S);
      return { ...base, w, h: Math.round(w * 0.72) };
    }
    case 'rail':
      // guardrail art (drawn at a slant in the concept) rotated to lie across the road
      return { ...base, w: Math.round(300 * S), h: Math.round(56 * S) };
    case 'tree':
      // tree art (≈180 tall) lying across the road
      return { ...base, art: rng.pick(['tree1', 'tree2']), w: Math.round(180 * S), h: Math.round(70 * S) };
    case 'barricade': {
      const w = Math.round(rng.range(...BLOCKERS.barricade.w) * S);
      const h = Math.round(rng.range(...BLOCKERS.barricade.h) * S);
      const pieces = [];
      for (let i = rng.int(5, 8); i > 0; i--) {
        pieces.push({
          art: rng.pick([...ART.barrels, ...ART.tires, 'crate']),
          dx: rng.range(-w / 2 + 25 * S, w / 2 - 25 * S),
          dy: rng.range(-h / 2 + 20 * S, h / 2 - 15 * S),
          flip: rng.chance(0.5),
        });
      }
      pieces.sort((a, b) => a.dy - b.dy);
      return { ...base, w, h, pieces };
    }
    default: {
      const def = BLOCKERS[kind];
      return { ...base, w: Math.round(rng.range(...def.w)), h: Math.round(rng.range(...def.h)) };
    }
  }
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
