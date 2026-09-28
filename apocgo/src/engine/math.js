// Small math helpers shared by the engine and the game. Pure — safe to import in Node tests.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Move `v` toward `target` by at most `step`. */
export function approach(v, target, step) {
  if (v < target) return Math.min(v + step, target);
  return Math.max(v - step, target);
}

/** Frame-rate independent exponential smoothing factor. */
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

/**
 * Axis-aligned boxes are stored centre-based: { x, y, w, h } where (x, y) is the centre.
 * This matches how entities are positioned and drawn.
 */
export function aabbOverlap(a, b) {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
}

/**
 * Penetration of box `a` into box `b` along each axis (positive = overlapping).
 * Returns null when they don't overlap.
 */
export function aabbPenetration(a, b) {
  const px = (a.w + b.w) / 2 - Math.abs(a.x - b.x);
  const py = (a.h + b.h) / 2 - Math.abs(a.y - b.y);
  if (px <= 0 || py <= 0) return null;
  return { x: px, y: py, sx: Math.sign(a.x - b.x) || 1, sy: Math.sign(a.y - b.y) || 1 };
}

/** Circle (cx, cy, r) vs centre-based box. */
export function circleRectOverlap(cx, cy, r, box) {
  const nx = clamp(cx, box.x - box.w / 2, box.x + box.w / 2);
  const ny = clamp(cy, box.y - box.h / 2, box.y + box.h / 2);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

export const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
