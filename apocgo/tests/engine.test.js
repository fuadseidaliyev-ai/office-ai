import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aabbOverlap, aabbPenetration, approach, circleRectOverlap, clamp } from '../src/engine/math.js';
import { RNG, hashSeed } from '../src/engine/rng.js';

test('clamp / approach', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(approach(0, 10, 3), 3);
  assert.equal(approach(9, 10, 3), 10);
  assert.equal(approach(10, 0, 4), 6);
});

test('AABB overlap and penetration (centre-based boxes)', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  assert.ok(aabbOverlap(a, { x: 9, y: 0, w: 10, h: 10 }));
  assert.ok(!aabbOverlap(a, { x: 10, y: 0, w: 10, h: 10 }));
  const pen = aabbPenetration(a, { x: 8, y: 1, w: 10, h: 10 });
  assert.deepEqual([pen.x, pen.y, pen.sx, pen.sy], [2, 9, -1, -1]);
  assert.equal(aabbPenetration(a, { x: 20, y: 0, w: 4, h: 4 }), null);
});

test('circle vs rect', () => {
  const box = { x: 0, y: 0, w: 10, h: 10 };
  assert.ok(circleRectOverlap(7, 0, 3, box));
  assert.ok(!circleRectOverlap(9, 0, 3, box));
});

test('RNG is deterministic and in range', () => {
  const a = new RNG(hashSeed('seed', 1));
  const b = new RNG(hashSeed('seed', 1));
  for (let i = 0; i < 100; i++) {
    const v = a.next();
    assert.equal(v, b.next());
    assert.ok(v >= 0 && v < 1);
  }
  const r = new RNG(42);
  for (let i = 0; i < 100; i++) {
    const n = r.int(2, 5);
    assert.ok(n >= 2 && n <= 5 && Number.isInteger(n));
  }
  assert.notEqual(hashSeed('seed', 1), hashSeed('seed', 2));
});
