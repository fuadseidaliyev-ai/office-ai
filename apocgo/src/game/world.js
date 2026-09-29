// One run ("рейс"): simulation of the road, the truck, zombies, pickups and survival.
// No DOM access here — rendering lives in view.js — so the whole run can be
// simulated headless in tests.

import { Camera } from '../engine/camera.js';
import { Particles } from '../engine/particles.js';
import { aabbOverlap, aabbPenetration, clamp } from '../engine/math.js';
import { RNG } from '../engine/rng.js';
import {
  ART, BUFFER_W, PERSP, VIEW_W, VIEW_H, CHUNK_H, DRIVE_HALF, PIXEL, ROAD_HALF, PX_PER_METER, DOG_GUN, SURVIVAL,
  ZOMBIE, ZOMBIE_FACINGS, PICKUPS, zombieType, OBSTACLES, computeTruckStats, goalMeters,
} from './config.js';
import { maskHit } from './collide.js';
import { generateChunk } from './generator.js';
import { Truck } from './truck.js';

const TOAST_TIME = 2.2;
const SKID_LIFE = 7; // seconds tyre marks stay on the road


export class World {
  constructor({ save, seed = (Math.random() * 1e9) | 0 }) {
    this.seed = seed;
    this.rng = new RNG(seed ^ 0x5bd1e995);
    this.level = save.level;
    this.goalMeters = goalMeters(save.level);
    this.goalY = -this.goalMeters * PX_PER_METER;

    this.truck = new Truck(computeTruckStats(save.upgrades));
    this.camera = new Camera(VIEW_W, VIEW_H);
    this.relayout();
    this.camera.zoom = BUFFER_W / VIEW_W;
    this.camera.shakeScale = PIXEL;
    this.camera.snap(0, this.truck.y - VIEW_H * 0.22);
    this.particles = new Particles(900, PIXEL);

    this.obstacles = [];
    this.zombies = [];
    this.pickups = [];
    this.decals = [{ kind: 'finish', y: this.goalY }];
    this.skids = []; // tyre marks {x1, y1, x2, y2, age, a}
    this.decor = [{ kind: 'tower', x: ROAD_HALF + 420, y: this.goalY - 100 }];
    this.nextChunk = 0;

    this.startInv = { ...save.inventory };
    this.inv = { ...save.inventory };
    this.gained = { scrap: 0, food: 0, dogFood: 0 };
    this.repaired = 0; // armour restored by parts this run
    this.kills = 0;

    // the dog's shotgun (unlimited shells, fires on its own while the dog is fed)
    this.gunCooldown = 0;
    this.dogAim = 0; // firing angle, world space: 0 = straight up the road, clockwise
    this.dogDir = 0; // 0 forward, 1 right, 2 back, 3 left (relative to the truck)
    this.dogSwitch = 0;
    this.dogKills = 0;
    this.shots = []; // tracers {x1, y1, x2, y2, t}
    this.muzzle = 0;

    this.satiety = 100;
    this.dogSatiety = 100;

    this.state = 'running'; // 'running' | 'won' | 'lost'
    this.reason = '';
    this.time = 0;
    this.toasts = [];
    this.hitFlash = 0;
    this._warned = {};
    this._grabToastAt = -Infinity;

    this.ensureChunks();
  }

  /** Match the camera to the current screen orientation. */
  relayout() {
    this.camera.viewW = VIEW_W;
    this.camera.viewH = VIEW_H;
    this.camera.zoom = BUFFER_W / VIEW_W;
  }

  get distance() {
    return Math.max(0, -this.truck.y / PX_PER_METER);
  }

  get progress() {
    return clamp(this.distance / this.goalMeters, 0, 1);
  }

  toast(text, color = '#e8dcc0') {
    const same = this.toasts.find((t) => t.text === text);
    if (same) {
      same.t = TOAST_TIME; // refresh instead of stacking duplicates
      return;
    }
    this.toasts.push({ text, color, t: TOAST_TIME });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  // ------------------------------------------------------------ chunks

  ensureChunks() {
    // generate up to the top of the top-down view or the chase camera's horizon
    const ahead = Math.min(this.camera.top, this.camera.y + VIEW_H * 0.22 - PERSP.far);
    while (-this.nextChunk * CHUNK_H > ahead - CHUNK_H) {
      const c = generateChunk(this.seed, this.nextChunk++);
      // nothing spawns past the finish line
      const beforeGoal = (e) => e.y > this.goalY + 150;
      this.obstacles.push(...c.obstacles.filter(beforeGoal));
      this.zombies.push(...c.zombies.filter(beforeGoal));
      this.pickups.push(...c.pickups.filter(beforeGoal));
      this.decals.push(...c.decals);
      this.decor.push(...c.decor);
    }
  }

  cull() {
    const limit = this.camera.bottom + 300;
    const keep = (e) => e.y < limit;
    this.obstacles = this.obstacles.filter(keep);
    this.zombies = this.zombies.filter((z) => !z.dead && z.y < limit + 60);
    this.pickups = this.pickups.filter((p) => !p.taken && keep(p));
    this.decals = this.decals.filter((d) => (d.points ? d.points[0][1] : d.y) < limit + 40);
    this.decor = this.decor.filter((d) => d.y < limit + 40);
    this.skids = this.skids.filter((s) => s.y1 < limit && s.age < SKID_LIFE);
  }

  /** Rear tyres leave black marks on the asphalt while the truck turns hard. */
  updateSkids(dt) {
    const t = this.truck;
    for (const s of this.skids) s.age += dt;
    const turning = Math.abs(t.tilt) > 0.22 && Math.abs(t.speed) > 200;
    const sn = Math.sin(t.tilt);
    const cs = Math.cos(t.tilt);
    const wheels = [-62, 62].map((lx) => ({ x: t.x + lx * cs - 118 * sn, y: t.y + lx * sn + 118 * cs }));
    if (turning && this._lastWheels) {
      const strength = Math.min(1, (Math.abs(t.tilt) - 0.22) / 0.3);
      wheels.forEach((w, i) => {
        const p = this._lastWheels[i];
        this.skids.push({ x1: p.x, y1: p.y, x2: w.x, y2: w.y, age: 0, a: 0.35 + strength * 0.35 });
      });
    }
    this._lastWheels = turning ? wheels : null;
    if (this.skids.length > 600) this.skids.splice(0, this.skids.length - 600);
  }

  // ------------------------------------------------------------ main update

  /** Attract mode for the title screen: the camera drifts up the road by itself. */
  ambient(dt, speed = 160) {
    this.camera.y -= speed * dt;
    this.camera.update(dt);
    this.particles.update(dt);
    this.updateZombies(dt);
    this.ensureChunks();
    this.cull();
  }

  update(dt, input) {
    this.particles.update(dt);
    this.camera.update(dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    for (const t of this.toasts) t.t -= dt;
    this.toasts = this.toasts.filter((t) => t.t > 0);
    for (const s of this.shots) s.t -= dt;
    this.shots = this.shots.filter((s) => s.t > 0);
    this.muzzle = Math.max(0, this.muzzle - dt);
    if (this.state !== 'running') return;

    this.time += dt;
    const truck = this.truck;
    truck.update(dt, input);
    this.updateSkids(dt);

    this.updateSurvival(dt, input);
    this.updateDog(dt);
    this.updateZombies(dt);
    this.collideObstacles();
    this.collectPickups();

    if (truck.offroad && Math.abs(truck.speed) > 100 && this.rng.chance(0.6)) {
      this.particles.emit(truck.x + this.rng.range(-70, 70), truck.y + 150, {
        count: 1, colors: ['#8a6a48', '#7a5a3a'], speed: 20, angle: Math.PI / 2, spread: 1, life: 0.5,
      });
    }

    const lookAhead = clamp(truck.speed, 0, 900) * 0.3;
    // keep the truck in the lower part of the screen so the road ahead is visible early
    this.camera.follow(truck.x * 0.3, truck.y - VIEW_H * 0.22 - lookAhead, dt, 5);
    this.ensureChunks();
    this.cull();
    this.checkEnd(dt);
  }

  updateSurvival(dt, input) {
    this.satiety = Math.max(0, this.satiety - SURVIVAL.hungerRate * dt);
    this.dogSatiety = Math.max(0, this.dogSatiety - SURVIVAL.dogHungerRate * dt);

    // there is no food stock: the bars only rise when food is picked up on the road

    this.truck.hungry = this.satiety <= 0;

    this.warnOnce('hunger', this.satiety <= 0, 'Водитель голоден — машина едет медленнее. Ищи еду!', '#9fdc6a');
    this.warnOnce('dog', this.dogSatiety <= 0, 'Собака голодна и не стреляет. Ищи корм!', '#f0a24a');
    this.warnOnce('armor', this.truck.hp < this.truck.stats.maxHp * 0.35, 'Машина разбита на треть — собирай детали', '#ff8a75');
  }

  get dogCanShoot() {
    return this.dogSatiety > 0;
  }

  warnOnce(key, cond, text, color) {
    if (cond && !this._warned[key]) this.toast(text, color);
    this._warned[key] = cond;
  }

  updateZombies(dt) {
    const truck = this.truck;
    const tb = truck.box;
    for (const z of this.zombies) {
      if (z.dead) continue;
      z.t += dt;
      const dx = truck.x - z.x;
      const dy = truck.y - z.y;
      const d = Math.hypot(dx, dy) || 1;
      const ox = z.x;
      const oy = z.y;
      if (d < ZOMBIE.sight) {
        z.x += (dx / d) * z.chaseSpeed * dt;
        z.y += (dy / d) * z.chaseSpeed * dt;
        z.moving = true;
      } else {
        z.dir += (this.rng.next() - 0.5) * dt * 2;
        z.x += Math.cos(z.dir) * z.speed * 0.5 * dt;
        z.y += Math.sin(z.dir) * z.speed * 0.5 * dt;
        z.moving = true;
      }
      z.x = clamp(z.x, -DRIVE_HALF - 30, DRIVE_HALF + 30);
      z.facing = facingOf(z, z.x - ox, z.y - oy);
      // zombies don't walk through blockers
      for (const ob of this.obstacles) {
        if (ob.solid && maskHit(z, ob)) {
          z.x = ox;
          z.y = oy;
          z.dir += Math.PI / 2;
          break;
        }
      }

      if (!aabbOverlap(z, tb)) continue;
      if (Math.abs(truck.speed) >= ZOMBIE.killSpeed) {
        // running zombies over just jolts — only the heavy one dents the armour a bit
        const def = zombieType(z);
        this.killZombie(z);
        truck.speed *= def.crash ? 0.8 : 0.9;
        if (def.crash) {
          truck.damage(def.crash * truck.stats.ram);
          this.camera.shake(5, 0.25);
        } else {
          this.camera.shake(2, 0.15);
        }
      } else {
        // grabbed onto the truck: they drag it down (no armour loss) until you speed up
        truck.speed = Math.max(0, truck.speed - ZOMBIE.grabDrag * dt);
        const pen = aabbPenetration(z, tb);
        if (pen) {
          if (pen.x < pen.y) z.x += pen.x * pen.sx;
          else z.y += pen.y * pen.sy;
        }
        if (this.time - this._grabToastAt > 4) {
          this._grabToastAt = this.time;
          this.toast('Зомби цепляются! Газуй!', '#ff6a55');
        }
      }
    }
  }

  killZombie(z, angle = -Math.PI / 2) {
    z.dead = true;
    this.kills++;
    this.particles.emit(z.x, z.y, {
      count: 18, colors: ['#8b1e14', '#6b1a14', '#4a100c', '#9a8a70'], speed: 90,
      angle, spread: 2.2, life: 0.55,
    });
    this.decals.push({ kind: 'art', art: this.rng.pick(ART.blood), x: z.x, y: z.y + 20, flip: this.rng.chance(0.5) });
  }

  // ------------------------------------------------------------ the dog's shotgun

  updateDog(dt) {
    this.gunCooldown = Math.max(0, this.gunCooldown - dt);
    this.dogSwitch = Math.max(0, this.dogSwitch - dt);
    const hit = this.dogCanShoot ? this.target() : null;
    const dir = hit ? hit.dir : 0; // idle: facing forward
    if (dir !== this.dogDir) {
      this.dogDir = dir;
      this.dogSwitch = DOG_GUN.switchTime; // turning to the new side
    }
    this.dogAim = this.truck.tilt + (this.dogDir * Math.PI) / 2;
    if (hit && this.gunCooldown <= 0 && this.dogSwitch <= 0) this.dogShoot(hit.z, hit.along);
  }

  /** Truck-local coordinates of a world point (x right, y back; forward is −y). */
  toTruckLocal(x, y) {
    const t = this.truck;
    const c = Math.cos(t.tilt);
    const s = Math.sin(t.tilt);
    const dx = x - t.x;
    const dy = y - t.y;
    return { x: dx * c + dy * s, y: -dx * s + dy * c };
  }

  /** Truck-local offset → world point. */
  fromTruckLocal({ x, y }) {
    const t = this.truck;
    const c = Math.cos(t.tilt);
    const s = Math.sin(t.tilt);
    return { x: t.x + x * c - y * s, y: t.y + x * s + y * c };
  }

  /**
   * Nearest living zombie inside one of the 4 firing corridors:
   * { z, dir (0 fwd, 1 right, 2 back, 3 left), along (distance along the firing line) }.
   */
  target() {
    let best = null;
    for (const z of this.zombies) {
      if (z.dead) continue;
      const l = this.toTruckLocal(z.x, z.y);
      // [along, across] for forward, right, back, left
      const axes = [[-l.y, l.x], [l.x, l.y], [l.y, l.x], [-l.x, l.y]];
      axes.forEach(([along, across], dir) => {
        if (along <= 0 || along > DOG_GUN.range || Math.abs(across) > DOG_GUN.corridor) return;
        if (!best || along < best.along) best = { z, dir, along };
      });
    }
    return best;
  }

  /** The forward pose's pivot in world space (rides with the truck). */
  get dogPivot() {
    return this.fromTruckLocal(DOG_GUN.pivot);
  }

  /** The muzzle of the current pose, in world space. */
  get dogPos() {
    return this.fromTruckLocal(DOG_GUN.poses[this.dogDir].muzzle);
  }

  dogShoot(z, along) {
    const { x: ox, y: oy } = this.dogPos;
    // bullets fly straight along the firing line, up to the zombie
    const angle = this.dogAim - Math.PI / 2;
    const len = Math.max(40, along - 60);
    this.gunCooldown = DOG_GUN.cooldown;
    this.muzzle = 0.08;
    this.shots.push({ x1: ox, y1: oy, x2: ox + Math.cos(angle) * len, y2: oy + Math.sin(angle) * len, t: 0.12 });
    this.camera.shake(1.2, 0.08);
    this.particles.emit(ox + Math.cos(angle) * 40, oy + Math.sin(angle) * 40, {
      count: 8, colors: ['#fff2b0', '#ffd36b', '#ff9d3a'], speed: 120, angle, spread: 0.6, life: 0.2,
    });
    // the heavy one takes several bullets
    z.hp = (z.hp ?? zombieType(z).hp) - 1;
    if (z.hp > 0) {
      z.hitAt = this.time;
      this.particles.emit(z.x, z.y, { count: 6, colors: ['#8b1e14', '#6b1a14'], speed: 70, angle, spread: 1.2, life: 0.35 });
      return;
    }
    this.killZombie(z, angle);
    this.dogKills++;
  }

  collideObstacles() {
    const truck = this.truck;
    for (const ob of this.obstacles) {
      if (!ob.solid) continue;
      // only the part of the obstacle that is actually drawn hurts (art mask), and only
      // where the turned truck body actually is
      let pen = null;
      for (const box of truck.hitBoxes) {
        const hit = maskHit(box, ob);
        pen = hit && aabbPenetration(box, hit);
        if (pen) break;
      }
      if (!pen) continue;
      if (pen.y <= pen.x) {
        // head-on (or reversing into it)
        truck.y += pen.y * pen.sy;
        const impact = Math.abs(truck.speed);
        if (impact > 70 && truck.invuln <= 0) {
          const dmg = impact * (ob.kind === 'hole' ? 0.048 : 0.036);
          truck.damage(dmg * truck.stats.ram);
          truck.invuln = 0.5;
          this.hitFlash = 1;
          ob.hitAt = this.time; // the view flashes the obstacle that was hit
          this.camera.shake(Math.min(7, impact / 70), 0.3);
          this.particles.emit(truck.x, truck.y - truck.h / 2 * pen.sy, {
            count: 16, colors: ['#ffd36b', '#ff9d3a', '#6f6861'], speed: 110,
            angle: pen.sy > 0 ? -Math.PI / 2 : Math.PI / 2, spread: 2.2, life: 0.4,
          });
          this.toast(`Удар: ${OBSTACLES[ob.kind]?.name || 'препятствие'} −${Math.max(1, Math.round(dmg))} брони`, '#ff6a55');
        }
        truck.speed = pen.sy > 0 ? -Math.max(0, truck.speed) * 0.25 : Math.max(0, truck.speed);
      } else {
        // side scrape
        truck.x += pen.x * pen.sx;
        truck.vx = 0;
        truck.speed *= 0.98;
        if (Math.abs(truck.speed) > 130 && this.rng.chance(0.3)) {
          this.particles.emit(truck.x - (truck.w / 2) * pen.sx, truck.y, {
            count: 2, colors: ['#ffd36b', '#ff9d3a'], speed: 50, life: 0.25,
          });
        }
      }
    }
  }

  collectPickups() {
    const tb = this.truck.box;
    for (const p of this.pickups) {
      if (p.taken || !aabbOverlap(p, tb)) continue;
      p.taken = true;
      const name = PICKUPS[p.type].name;
      if (p.type === 'scrap') {
        this.useParts(p.amount);
      } else {
        this.takeFood(p.type, p.amount);
      }
      this.gained[p.type] += p.amount;
      this.particles.emit(p.x, p.y, { count: 10, colors: ['#fff2b0', '#ffd36b'], speed: 50, life: 0.5 });
    }
  }

  /** Food is eaten on the spot: the bar rises the moment it's picked up (nothing is stored). */
  takeFood(type, amount) {
    const key = type === 'food' ? 'satiety' : 'dogSatiety';
    const who = type === 'food' ? 'Водитель поел' : 'Гав! Собака поела';
    const color = type === 'food' ? '#9fdc6a' : '#f0a24a';
    const before = this[key];
    this[key] = Math.min(100, this[key] + SURVIVAL.mealValue * amount);
    this.toast(`${who}: +${Math.round(this[key] - before)}`, color);
  }


  /** Parts fix the truck first; whatever isn't needed goes to the garage stock. */
  useParts(amount) {
    const t = this.truck;
    const missing = t.stats.maxHp - t.hp;
    const used = Math.min(amount, Math.ceil(missing / SURVIVAL.partRepair));
    if (used > 0) {
      const before = t.hp;
      t.hp = Math.min(t.stats.maxHp, t.hp + used * SURVIVAL.partRepair);
      this.repaired += t.hp - before;
      this.toast(`Ремонт: +${Math.round(t.hp - before)} брони`, '#7fe07a');
      this.particles.emit(t.x, t.y, { count: 14, colors: ['#7fe07a', '#d8f5c0'], speed: 70, life: 0.6 });
    }
    const left = amount - used;
    if (left > 0) {
      this.inv.scrap += left;
      this.toast(`+${left} ${PICKUPS.scrap.name} в запас`, '#b9c3cc');
    }
  }

  dust(x, y, count) {
    this.particles.emit(x, y, { count, colors: ['#5c5650', '#7a6a58', '#3a3530'], speed: 60, life: 0.5 });
  }

  checkEnd(dt) {
    const t = this.truck;
    if (t.y <= this.goalY) return this.end('won', 'Вы добрались до радиовышки!');
    if (t.hp <= 0) return this.end('lost', 'Машина разбита');
  }

  end(state, reason) {
    this.state = state;
    this.reason = reason;
    if (state === 'lost') {
      this.camera.shake(5, 0.5);
      this.particles.emit(this.truck.x, this.truck.y, {
        count: 30, colors: ['#3a3530', '#5c5650', '#ff9d3a'], speed: 100, life: 1,
      });
    }
  }

  /**
   * Write the run's outcome into the save. On a win everything collected is kept and
   * the next level unlocks; on a loss only half the scrap found this run survives.
   */
  applyResult(save) {
    const inv = { ...this.inv };
    if (this.state !== 'won') inv.scrap = this.startInv.scrap + Math.floor(this.gained.scrap / 2);
    save.inventory = inv;
    save.runs++;
    save.bestDistance = Math.max(save.bestDistance, Math.round(this.distance));
    if (this.state === 'won') save.level++;
    return {
      won: this.state === 'won',
      reason: this.reason,
      distance: Math.round(this.distance),
      goal: this.goalMeters,
      kills: this.kills,
      gained: { ...this.gained },
      keptScrap: inv.scrap - this.startInv.scrap,
    };
  }
}

/** Facing art name for a movement step (dx, dy): 4 or 8 directions depending on the kind. */
function facingOf(z, dx, dy) {
  if (Math.abs(dx) + Math.abs(dy) < 0.01) return z.facing;
  const names = ZOMBIE_FACINGS[zombieType(z).dirs];
  const n = names.length;
  const i = Math.round((Math.atan2(dy, dx) / (Math.PI * 2)) * n);
  return names[((i % n) + n) % n];
}
