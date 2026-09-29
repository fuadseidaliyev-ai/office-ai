import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRIVE_HALF, ROAD_HALF, SAFE_CHUNKS, UPGRADE_KEYS, computeTruckStats, upgradeCost } from '../src/game/config.js';
import { generateChunk } from '../src/game/generator.js';
import { defaultSave, normalizeSave } from '../src/game/save.js';
import { Truck } from '../src/game/truck.js';
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

test('obstacles are always dodgeable: enough time and room to swerve between rows', () => {
  const truckHalfW = 75;
  const truckHalfH = 150;
  const stats = computeTruckStats({});

  // lateral distance the base truck covers (from driving straight) in `t` seconds at top speed
  const swerveIn = (t) => {
    const truck = new Truck(stats);
    truck.speed = stats.maxSpeed;
    const hardRight = { down: (a) => a === 'gas' || a === 'right', axis: () => 1 };
    for (let i = Math.round(t * 60); i > 0; i--) truck.update(1 / 60, hardRight);
    return truck.x;
  };

  // free x-intervals for the truck's centre alongside one obstacle (bounding box = conservative)
  const freeIntervals = (o) => [[-DRIVE_HALF, o.x - o.w / 2 - truckHalfW], [o.x + o.w / 2 + truckHalfW, DRIVE_HALF]]
    .filter(([a, b]) => b - a > 10);
  const dist = (x, free) => Math.min(...free.map(([a, b]) => (x < a ? a - x : x > b ? x - b : 0)));

  for (let seed = 0; seed < 40; seed++) {
    const rows = [];
    for (let i = SAFE_CHUNKS; i < 90; i++) {
      const obs = generateChunk(seed, i).obstacles;
      assert.ok(obs.length <= 1, 'one obstacle per chunk');
      if (obs.length) rows.push(obs[0]);
    }
    assert.ok(rows.length > 20, `seed ${seed}: the road should not be empty`);
    for (let k = 1; k < rows.length; k++) {
      const prev = rows[k - 1]; // nearer (larger y)
      const cur = rows[k];
      assert.ok(freeIntervals(cur).length > 0, `seed ${seed}: row fully blocked`);
      if (cur.lane === prev.lane) continue; // same lane: stay where you are
      // time from clearing the previous obstacle to reaching the next one
      const edgeGap = (prev.y - prev.h / 2 - truckHalfH) - (cur.y + cur.h / 2 + truckHalfH);
      const budget = swerveIn(Math.max(0, edgeGap) / stats.maxSpeed) * 0.85;
      for (const [a, b] of freeIntervals(prev)) {
        for (let x = a; x <= b; x += 10) {
          const need = dist(x, freeIntervals(cur));
          assert.ok(need <= budget, `seed ${seed}: ${prev.lane}->${cur.lane} needs ${Math.round(need)} px, can do ${Math.round(budget)}`);
        }
      }
    }
  }
});

test('obstacle collisions follow the drawn shape, not the bounding box', async () => {
  const { maskHit } = await import('../src/game/collide.js');
  const { makeObstacle } = await import('../src/game/generator.js');
  const tree = makeObstacle('tree', 'middle', 0, { range: () => 0, chance: () => false });
  // the fallen tree runs diagonally: its bounding-box corner at bottom-left is empty ground…
  const corner = { x: tree.x - tree.w / 2 + 30, y: tree.y - tree.h / 2 + 30, w: 40, h: 40 };
  assert.equal(maskHit(corner, tree), null);
  // …while the trunk near the middle is solid
  const trunk = { x: tree.x + tree.w * 0.15, y: tree.y + tree.h * 0.1, w: 80, h: 80 };
  assert.ok(maskHit(trunk, tree));
});

test('car parts repair the truck; the leftover goes to the garage stock', () => {
  const w = new World({ save: defaultSave(), seed: 4 });
  const part = (amount) => ({ type: 'scrap', amount, x: w.truck.x, y: w.truck.y, w: 30, h: 30, t: 0, taken: false });
  const scrap0 = w.inv.scrap;
  w.truck.hp = 70; // needs 30 armour = 4 parts at 8 each
  w.pickups = [part(3)];
  w.update(1 / 60, fakeInput());
  assert.equal(w.truck.hp, 94);
  assert.equal(w.inv.scrap, scrap0);
  w.pickups = [part(5)]; // one part fills the last 6, four go to the stock
  w.update(1 / 60, fakeInput());
  assert.equal(w.truck.hp, w.truck.stats.maxHp);
  assert.equal(w.inv.scrap, scrap0 + 4);
});

test('steering ramps in smoothly instead of snapping', () => {
  const w = new World({ save: defaultSave(), seed: 4 });
  const right = fakeInput(['gas', 'right']);
  w.update(1 / 60, right);
  const early = w.truck.vx;
  for (let i = 0; i < 60; i++) w.update(1 / 60, right);
  assert.ok(early > 0 && early < w.truck.vx * 0.1, `first-frame lateral speed ${early} vs ${w.truck.vx}`);
});

test('blockers stay near the asphalt, pickups within drivable area', () => {
  for (let i = SAFE_CHUNKS; i < 60; i++) {
    const c = generateChunk(9, i);
    for (const o of c.obstacles.filter((o) => o.solid)) assert.ok(Math.abs(o.x) + o.w / 2 <= ROAD_HALF + 61);
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

  const food = w.inv.food;
  w.satiety = 10;
  w.update(1 / 60, fakeInput([], ['eat']));
  assert.equal(w.inv.food, food - 1);
  assert.ok(w.satiety > 40);
});

test('a run ends in a win at the goal and in a loss when the truck is wrecked', () => {
  const save = defaultSave();
  const w = new World({ save, seed: 5 });
  w.truck.y = w.goalY - 1;
  w.update(1 / 60, fakeInput());
  assert.equal(w.state, 'won');
  const res = w.applyResult(save);
  assert.ok(res.won);
  assert.equal(save.level, 1);

  const w2 = new World({ save, seed: 6 });
  w2.truck.hp = 0;
  w2.update(1 / 60, fakeInput());
  assert.equal(w2.state, 'lost');
  assert.match(w2.reason, /Машина/);
});

test('hunger never ends the run: a starving driver is slow, a hungry dog stops shooting', () => {
  const w = new World({ save: defaultSave(), seed: 6 });
  w.obstacles = [];
  w.inv.food = 0;
  w.inv.dogFood = 0;
  w.satiety = 0;
  w.dogSatiety = 0;
  for (let i = 0; i < 60 * 30; i++) {
    w.pickups = []; // no food on the way
    w.update(1 / 60, fakeInput(['gas']));
  }
  assert.equal(w.state, 'running');
  assert.ok(w.truck.speed <= w.truck.stats.maxSpeed * 0.6 + 1, `speed ${w.truck.speed}`);
  // a zombie right next to the truck is ignored by the hungry dog…
  assert.equal(w.dogKills, 0);
  w.truck.speed = 0;
  w.zombies = [{ x: w.truck.x + 300, y: w.truck.y + 30, w: 44, h: 80, speed: 0, chaseSpeed: 0, dir: 0, t: 0, dead: false }];
  w.update(1 / 60, fakeInput());
  assert.equal(w.dogKills, 0);
  // …until it finds food: it eats it and starts shooting again
  w.pickups = [{ type: 'dogFood', amount: 1, x: w.truck.x, y: w.truck.y, w: 30, h: 30, t: 0, taken: false }];
  for (let i = 0; i < 20; i++) w.update(1 / 60, fakeInput());
  assert.ok(w.dogSatiety > 0);
  assert.equal(w.dogKills, 1);
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

test('the dog shoots zombies by itself with unlimited shells', () => {
  const w = new World({ save: defaultSave(), seed: 3 });
  const z = (x, y) => ({ x, y, w: 44, h: 80, speed: 0, chaseSpeed: 0, dir: 0, t: 0, dead: false });
  for (let n = 1; n <= 20; n++) {
    w.zombies = [z(w.truck.x + 60, w.truck.y - 400)];
    for (let i = 0; i < 60; i++) w.update(1 / 60, fakeInput());
    assert.equal(w.kills, n);
  }
  // out of range: no shot
  w.zombies = [z(w.truck.x, w.truck.y - 2000)];
  for (let i = 0; i < 60; i++) w.update(1 / 60, fakeInput());
  assert.equal(w.kills, 20);
});

test('armour is lost only in obstacle collisions — zombies never cost armour', () => {
  const w = new World({ save: defaultSave(), seed: 8 });
  w.obstacles = [];
  const t = w.truck;
  const zombie = (x, y) => ({ x, y, w: 44, h: 80, speed: 0, chaseSpeed: 0, dir: 0, t: 0, art: 'zombie1', dead: false });
  // running one over at speed
  t.speed = t.stats.maxSpeed;
  w.zombies = [zombie(t.x, t.y - 170)];
  w.update(1 / 60, fakeInput(['gas']));
  assert.equal(w.kills, 1);
  assert.equal(t.hp, t.stats.maxHp);
  // several clinging on while standing still: slows, but no damage
  t.speed = 0;
  w.zombies = [zombie(t.x - 90, t.y), zombie(t.x + 90, t.y), zombie(t.x, t.y + 160)];
  for (let i = 0; i < 120; i++) w.update(1 / 60, fakeInput());
  assert.equal(t.hp, t.stats.maxHp);
});

test('the dog fires strictly in 4 directions, switching pose before the first shot', () => {
  const w = new World({ save: defaultSave(), seed: 12 });
  w.obstacles = [];
  w.pickups = [];
  const t = w.truck;
  const zombie = (x, y) => ({ x, y, w: 44, h: 80, speed: 0, chaseSpeed: 0, dir: 0, t: 0, dead: false });
  // forward, right, back, left of the truck
  const spots = [[0, -400], [350, 30], [0, 400], [-350, 30]];
  spots.forEach(([dx, dy], dir) => {
    w.zombies = [zombie(t.x + dx, t.y + dy)];
    const kills = w.dogKills;
    w.update(1 / 60, fakeInput());
    if (dir !== 0) assert.equal(w.dogKills, kills, 'no shot before turning to the new side');
    for (let i = 0; i < 60 && w.dogKills === kills; i++) w.update(1 / 60, fakeInput());
    assert.equal(w.dogKills, kills + 1, `direction ${dir}`);
    assert.equal(w.dogDir, dir);
    assert.ok(Math.abs(w.dogAim - (t.tilt + (dir * Math.PI) / 2)) < 1e-9);
  });
  // a diagonal zombie is outside every corridor: the dog does not shoot at it
  w.zombies = [zombie(t.x + 300, t.y - 300)];
  const kills = w.dogKills;
  for (let i = 0; i < 60; i++) w.update(1 / 60, fakeInput());
  assert.equal(w.dogKills, kills);
});

test('the truck cannot leave the road and all resources lie on the road', () => {
  const w = new World({ save: defaultSave(), seed: 2 });
  w.obstacles = [];
  for (let i = 0; i < 60 * 4; i++) w.update(1 / 60, fakeInput(['gas', 'left']));
  assert.ok(w.truck.x - w.truck.w / 2 >= -ROAD_HALF, `truck left edge ${w.truck.x - w.truck.w / 2}`);
  for (let i = 0; i < 60 * 4; i++) w.update(1 / 60, fakeInput(['gas', 'right']));
  assert.ok(w.truck.x + w.truck.w / 2 <= ROAD_HALF);
  for (let seed = 0; seed < 10; seed++) {
    for (let i = SAFE_CHUNKS; i < 60; i++) {
      for (const p of generateChunk(seed, i).pickups) assert.ok(Math.abs(p.x) + p.w / 2 <= ROAD_HALF);
    }
  }
});

test('picked-up food raises the bar at once; standing still, steering only turns the wheels', () => {
  const w = new World({ save: defaultSave(), seed: 9 });
  w.obstacles = [];
  w.zombies = [];
  w.satiety = 30;
  w.dogSatiety = 30;
  const food0 = w.inv.food;
  const at = (type) => ({ type, amount: 1, x: w.truck.x, y: w.truck.y, w: 30, h: 30, t: 0, taken: false });
  w.pickups = [at('food'), at('dogFood')];
  w.update(1 / 60, fakeInput());
  assert.ok(w.satiety > 70 && w.dogSatiety > 70, `${w.satiety} ${w.dogSatiety}`);
  assert.equal(w.inv.food, food0); // eaten, not stored

  w.pickups = [];
  w.truck.speed = 0;
  const x0 = w.truck.x;
  for (let i = 0; i < 120; i++) w.update(1 / 60, fakeInput(['right']));
  assert.equal(w.truck.x, x0);
  assert.ok(w.truck.steer > 0.9);
});
