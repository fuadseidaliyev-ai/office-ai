// Collision against the big obstacles using their coarse art masks (src/game/masks.js),
// so a hit happens where the obstacle is actually drawn — not anywhere in its bounding box.

import { aabbOverlap } from '../engine/math.js';
import { OBSTACLE_ART_SCALE } from './config.js';
import { MASKS } from './masks.js';

/**
 * Solid mask cells of obstacle `ob` touched by the centre-based box `b`, merged into one
 * centre-based box (for push-out), or null when nothing solid is touched.
 */
export function maskHit(b, ob) {
  if (!aabbOverlap(b, ob)) return null;
  const mask = MASKS[ob.mask];
  if (!mask) return ob; // no mask: the bounding box is the shape
  const cs = mask.cell * OBSTACLE_ART_SCALE;
  const cols = mask.rows[0].length;
  const rows = mask.rows.length;
  const ox = ob.x - ob.w / 2;
  const oy = ob.y - ob.h / 2;
  const c0 = Math.max(0, Math.floor((b.x - b.w / 2 - ox) / cs));
  const c1 = Math.min(cols - 1, Math.floor((b.x + b.w / 2 - ox) / cs));
  const r0 = Math.max(0, Math.floor((b.y - b.h / 2 - oy) / cs));
  const r1 = Math.min(rows - 1, Math.floor((b.y + b.h / 2 - oy) / cs));
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let r = r0; r <= r1; r++) {
    const row = mask.rows[r];
    for (let c = c0; c <= c1; c++) {
      const src = ob.flip ? cols - 1 - c : c;
      if (row[src] !== '#') continue;
      x0 = Math.min(x0, ox + c * cs);
      x1 = Math.max(x1, ox + (c + 1) * cs);
      y0 = Math.min(y0, oy + r * cs);
      y1 = Math.max(y1, oy + (r + 1) * cs);
    }
  }
  if (x0 === Infinity) return null;
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}
