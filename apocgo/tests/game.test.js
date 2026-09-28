import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRIVE_HALF, ROAD_HALF, SAFE_CHUNKS, UPGRADE_KEYS, computeTruckStats, upgradeCost } from '../src/game/config.js';
import { generateChunk } from '../src/game/generator.js';
import { defaultSave, normalizeSave } from '../src/game/save.js';
import { World } from '../src/game/world.js';

/** Minimal Input stand-in: a set of held actions, optional one-shot presses. */
function fakeInput(held = [], pressed = []) {
  const p = new Set(pressed);
  return {
    down: (a) => held.includes(a),
    pressed: (a) => p.delete(a),
    axis: (neg, pos) => (held.includes(pos) ? 1 : 0) - (held.includes(neg) ? 1 : 0),
  };
}

test('chunk generation is deterministic', () => {
  assert.deepEqual(generateChunk(123, 10), generateChunk(123, 10));
  assert.notDeepEqual(generateChunk(123, 10), generateChunk(124, 10));
});

test('safe chunks have no obstacles, zombies or pickups', () => {
  for (let i = 0; i < SAFE_CHUNKS; i++) {
    const c = generateChunk(1, i);
    assert.equal(c.obstacles.length + c.zombies.length + c.pickups.length, 0);
  }
});

test('the road is always passable: every row leaves a gap wider than the truck', () => {
  const truckW = 20;
  for (let seed = 0; seed < 20; seed++) {
    for (let i = SAFE_CHUNKS; i < 80; i++) {
      const solids = generateChunk(seed, i).obstacles.filter((o) => o.solid);
      for (const ob of solids) {
        // everything in the same horizontal slice as this obstacle
        const row = solids.filter((o) => Math.abs(o.y - ob.y) * 2 < o.h + ob.h);
        const blocked = row.reduce((sum, o) => sum + o.w, 0);
        assert.ok(DRIVE_HALF * 2 - blocked > truckW * 2, `seed ${seed} chunk ${i} blocked ${blocked}`);
      }
    }
  }
});

test('blockers stay near the asphalt, pickups within drivable area', () => {
  for (let i = SAFE_CHUNKS; i < 60; i++) {
    const c = generateChunk(9, i);
    for (const o of c.obstacles.filter((o) => o.solid)) assert.ok(Math.abs(o.x) + o.w / 2 <= ROAD_HALF + 21);
    for (const p of c.pickups) assert.ok(Math.abs(p.x) <= DRIVE_HALF);
  }
});

test('upgrades improve stats and have finite costs', () => {
  const base = computeTruckStats({});
  const max = computeTruckStats(Object.fromEntries(UPGRADE_KEYS.map((k) => [k, 4])));
  assert.ok(max.maxSpeed > base.maxSpeed);
  assert.ok(max.maxHp > base.maxHp);
  assert.ok(max.ram < base.ram && max.ram > 0);
  for (const k of UPGRADE_KEYS) {
    assert.ok(upgradeCost(k, 0) > 0);
    assert.equal(upgradeCost(k, 4), null);
  }
});

test('save normalisation fills missing fields', () => {
  const s = normalizeSave({ level: 2, inventory: { scrap: 50 } });
  assert.equal(s.level, 2);
  assert.equal(s.inventory.scrap, 50);
  assert.equal(s.inventory.food, defaultSave().inventory.food);
  assert.equal(s.upgrades.engine, 0);
  assert.deepEqual(normalizeSave('garbage'), defaultSave());
});

test('headless run: truck drives forward, hunger ticks, eating works', () => {
  const save = defaultSave();
  const w = new World({ save, seed: 5 });
  const gas = fakeInput(['gas']);
  for (let i = 0; i < 60 * 3; i++) w.update(1 / 60, gas);
  assert.ok(w.distance > 10, `distance ${w.distance}`);
  assert.ok(w.satiety < 100);
  assert.ok(w.truck.fuel < w.truck.stats.maxFuel);

  const food = w.inv.food;
  w.satiety = 10;
  w.update(1 / 60, fakeInput([], ['eat']));
  assert.equal(w.inv.food, food - 1);
  assert.ok(w.satiety > 40);
});

test('a run ends in a win at the goal and in a loss when the dog starves', () => {
  const save = defaultSave();
  const w = new World({ save, seed: 5 });
  w.truck.y = w.goalY - 1;
  w.update(1 / 60, fakeInput());
  assert.equal(w.state, 'won');
  const res = w.applyResult(save);
  assert.ok(res.won);
  assert.equal(save.level, 1);

  const w2 = new World({ save, seed: 6 });
  w2.inv.dogFood = 0;
  w2.dogSatiety = 0;
  for (let i = 0; i < 60 * 16; i++) w2.update(1 / 60, fakeInput());
  assert.equal(w2.state, 'lost');
  assert.match(w2.reason, /Собака/);
});

test('losing keeps only half of the scrap found', () => {
  const save = defaultSave();
  save.inventory.scrap = 10;
  const w = new World({ save, seed: 1 });
  w.inv.scrap += 9;
  w.gained.scrap = 9;
  w.end('lost', 'test');
  w.applyResult(save);
  assert.equal(save.inventory.scrap, 14);
});

test('long autopilot simulation never throws and keeps entity counts bounded', () => {
  const save = defaultSave();
  const w = new World({ save, seed: 99 });
  const inputs = [fakeInput(['gas']), fakeInput(['gas', 'left']), fakeInput(['gas', 'right'])];
  for (let i = 0; i < 60 * 60 && w.state === 'running'; i++) {
    w.update(1 / 60, inputs[Math.floor(i / 90) % 3]);
    assert.ok(w.obstacles.length < 200 && w.zombies.length < 200);
  }
  assert.ok(Number.isFinite(w.truck.x) && Number.isFinite(w.truck.y));
});
