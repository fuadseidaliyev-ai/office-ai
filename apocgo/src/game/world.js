// One run ("рейс"): simulation of the road, the truck, zombies, pickups and survival.
// No DOM access here — rendering lives in view.js — so the whole run can be
// simulated headless in tests.

import { Camera } from '../engine/camera.js';
import { Particles } from '../engine/particles.js';
import { aabbOverlap, aabbPenetration, circleRectOverlap, clamp } from '../engine/math.js';
import { RNG } from '../engine/rng.js';
import {
  VIEW_W, VIEW_H, CHUNK_H, DRIVE_HALF, ROAD_HALF, PX_PER_METER, SURVIVAL, ZOMBIE, PICKUPS,
  computeTruckStats, goalMeters,
} from './config.js';
import { generateChunk } from './generator.js';
import { Truck } from './truck.js';

const TOAST_TIME = 2.2;

export class World {
  constructor({ save, seed = (Math.random() * 1e9) | 0 }) {
    this.seed = seed;
    this.rng = new RNG(seed ^ 0x5bd1e995);
    this.level = save.level;
    this.goalMeters = goalMeters(save.level);
    this.goalY = -this.goalMeters * PX_PER_METER;

    this.truck = new Truck(computeTruckStats(save.upgrades));
    this.camera = new Camera(VIEW_W, VIEW_H);
    this.camera.snap(0, this.truck.y - VIEW_H * 0.2);
    this.particles = new Particles();

    this.obstacles = [];
    this.zombies = [];
    this.pickups = [];
    this.decals = [{ kind: 'finish', y: this.goalY }];
    this.decor = [{ kind: 'tower', x: ROAD_HALF + 70, y: this.goalY - 30 }];
    this.nextChunk = 0;

    this.startInv = { ...save.inventory };
    this.inv = { ...save.inventory };
    this.gained = { scrap: 0, food: 0, dogFood: 0, fuel: 0 };
    this.kills = 0;

    this.satiety = 100;
    this.dogSatiety = 100;
    this.starve = 0;
    this.dogStarve = 0;
    this.stall = 0;

    this.state = 'running'; // 'running' | 'won' | 'lost'
    this.reason = '';
    this.time = 0;
    this.toasts = [];
    this.hitFlash = 0;
    this._warned = {};
    this._grabToastAt = -Infinity;

    this.ensureChunks();
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
    while (-this.nextChunk * CHUNK_H > this.camera.top - CHUNK_H) {
      const c = generateChunk(this.seed, this.nextChunk++);
      // nothing spawns past the finish line
      const beforeGoal = (e) => e.y > this.goalY + 40;
      this.obstacles.push(...c.obstacles.filter(beforeGoal));
      this.zombies.push(...c.zombies.filter(beforeGoal));
      this.pickups.push(...c.pickups.filter(beforeGoal));
      this.decals.push(...c.decals);
      this.decor.push(...c.decor);
    }
  }

  cull() {
    const limit = this.camera.bottom + 80;
    const keep = (e) => e.y < limit;
    this.obstacles = this.obstacles.filter(keep);
    this.zombies = this.zombies.filter((z) => !z.dead && z.y < limit + 60);
    this.pickups = this.pickups.filter((p) => !p.taken && keep(p));
    this.decals = this.decals.filter((d) => (d.points ? d.points[0][1] : d.y) < limit + 40);
    this.decor = this.decor.filter((d) => d.y < limit + 40);
  }

  // ------------------------------------------------------------ main update

  /** Attract mode for the title screen: the camera drifts up the road by itself. */
  ambient(dt, speed = 45) {
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
    if (this.state !== 'running') return;

    this.time += dt;
    const truck = this.truck;
    truck.update(dt, input);

    this.updateSurvival(dt, input);
    this.updateZombies(dt);
    this.collideObstacles();
    this.collectPickups();

    if (truck.offroad && Math.abs(truck.speed) > 30 && this.rng.chance(0.5)) {
      this.particles.emit(truck.x + this.rng.range(-8, 8), truck.y + 18, {
        count: 1, colors: ['#8a6a48', '#7a5a3a'], speed: 20, angle: Math.PI / 2, spread: 1, life: 0.5,
      });
    }

    const lookAhead = clamp(truck.speed, 0, 400) * 0.18;
    this.camera.follow(truck.x * 0.35, truck.y - VIEW_H * 0.2 - lookAhead, dt, 6);
    this.ensureChunks();
    this.cull();
    this.checkEnd(dt);
  }

  updateSurvival(dt, input) {
    this.satiety = Math.max(0, this.satiety - SURVIVAL.hungerRate * dt);
    this.dogSatiety = Math.max(0, this.dogSatiety - SURVIVAL.dogHungerRate * dt);

    if (input.pressed('eat')) this.eat();
    if (input.pressed('feedDog')) this.feedDog();

    this.starve = this.satiety <= 0 ? this.starve + dt : 0;
    this.dogStarve = this.dogSatiety <= 0 ? this.dogStarve + dt : 0;

    this.warnOnce('hunger', this.satiety < 25, 'Водитель голоден — [E] поесть', '#9fdc6a');
    this.warnOnce('dog', this.dogSatiety < 25, 'Собака голодна — [Q] покормить', '#f0a24a');
    this.warnOnce('fuel', isFuelLow(this.truck), 'Мало топлива!', '#ffcf4a');
  }

  warnOnce(key, cond, text, color) {
    if (cond && !this._warned[key]) this.toast(text, color);
    this._warned[key] = cond;
  }

  eat() {
    if (this.inv.food <= 0) return this.toast('Нет еды', '#c9745a');
    if (this.satiety > 95) return this.toast('Водитель сыт');
    this.inv.food--;
    this.satiety = Math.min(100, this.satiety + SURVIVAL.mealValue);
    this.toast('Водитель поел', '#9fdc6a');
  }

  feedDog() {
    if (this.inv.dogFood <= 0) return this.toast('Нет корма', '#c9745a');
    if (this.dogSatiety > 95) return this.toast('Собака сыта');
    this.inv.dogFood--;
    this.dogSatiety = Math.min(100, this.dogSatiety + SURVIVAL.mealValue);
    this.toast('Гав! Собака поела', '#f0a24a');
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
      z.x = clamp(z.x, -DRIVE_HALF - 10, DRIVE_HALF + 10);
      // zombies don't walk through blockers
      for (const ob of this.obstacles) {
        if (ob.solid && aabbOverlap(z, ob)) {
          z.x = ox;
          z.y = oy;
          z.dir += Math.PI / 2;
          break;
        }
      }

      if (!aabbOverlap(z, tb)) continue;
      if (Math.abs(truck.speed) >= ZOMBIE.killSpeed) {
        this.killZombie(z);
        truck.damage(ZOMBIE.hitDamage * truck.stats.ram);
        truck.speed *= 0.9;
        this.camera.shake(2, 0.15);
      } else {
        // grabbed onto the truck: keep chewing while it's slow
        truck.damage(ZOMBIE.grabDps * truck.stats.ram * dt);
        const pen = aabbPenetration(z, tb);
        if (pen) {
          if (pen.x < pen.y) z.x += pen.x * pen.sx;
          else z.y += pen.y * pen.sy;
        }
        this.hitFlash = Math.max(this.hitFlash, 0.25);
        if (this.time - this._grabToastAt > 4) {
          this._grabToastAt = this.time;
          this.toast('Зомби цепляются! Газуй!', '#ff6a55');
        }
      }
    }
  }

  killZombie(z) {
    z.dead = true;
    this.kills++;
    this.particles.emit(z.x, z.y, {
      count: 14, colors: ['#8b1e14', '#6b1a14', '#a7a88a'], speed: 90,
      angle: -Math.PI / 2, spread: 2.5, life: 0.5,
    });
    this.decals.push({ kind: 'blood', x: z.x, y: z.y, seed: this.rng.int(0, 1e9) });
  }

  collideObstacles() {
    const truck = this.truck;
    const tb = truck.box;
    for (const ob of this.obstacles) {
      if (ob.kind === 'pothole') {
        if (ob.hit || !circleRectOverlap(ob.x, ob.y, ob.r * 0.8, tb)) continue;
        ob.hit = true;
        truck.damage(2 + Math.abs(truck.speed) / 40);
        truck.speed *= 0.75;
        truck.slow = 0.8;
        this.camera.shake(2.5, 0.2);
        this.dust(ob.x, ob.y, 8);
        continue;
      }
      if (ob.breakable) {
        if (ob.broken || !aabbOverlap(ob, tb)) continue;
        ob.broken = true;
        truck.damage(3 * truck.stats.ram);
        truck.speed *= 0.85;
        this.camera.shake(1.5, 0.15);
        this.particles.emit(ob.x, ob.y, {
          count: 10, colors: ob.kind === 'barrel' ? ['#7a4b2a', '#5a341c', '#a4703f'] : ['#1d1b1a', '#3a3632'],
          speed: 80, angle: -Math.PI / 2, spread: 2, life: 0.6,
        });
        continue;
      }
      if (!ob.solid) continue;
      const pen = aabbPenetration(truck.box, ob);
      if (!pen) continue;
      if (pen.y <= pen.x) {
        // head-on (or reversing into it)
        truck.y += pen.y * pen.sy;
        const impact = Math.abs(truck.speed);
        if (impact > 20 && truck.invuln <= 0) {
          const dmg = impact * (ob.kind === 'collapse' ? 0.16 : 0.12);
          truck.damage(dmg);
          truck.invuln = 0.5;
          this.hitFlash = 1;
          this.camera.shake(Math.min(7, impact / 22), 0.3);
          this.particles.emit(truck.x, truck.y - truck.h / 2 * pen.sy, {
            count: 16, colors: ['#ffd36b', '#ff9d3a', '#6f6861'], speed: 110,
            angle: pen.sy > 0 ? -Math.PI / 2 : Math.PI / 2, spread: 2.2, life: 0.4,
          });
          if (dmg > 10) this.toast(`Удар! −${Math.round(dmg)} брони`, '#ff6a55');
        }
        truck.speed = pen.sy > 0 ? -Math.max(0, truck.speed) * 0.25 : Math.max(0, truck.speed);
      } else {
        // side scrape
        truck.x += pen.x * pen.sx;
        truck.vx = 0;
        truck.speed *= 0.98;
        if (Math.abs(truck.speed) > 40 && this.rng.chance(0.3)) {
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
      if (p.type === 'fuel') {
        this.truck.fuel = Math.min(this.truck.stats.maxFuel, this.truck.fuel + p.amount);
        this.toast(`+${p.amount} ${name}`, '#ffcf4a');
      } else {
        this.inv[p.type] += p.amount;
        this.toast(`+${p.amount} ${name}`, p.type === 'scrap' ? '#b9c3cc' : p.type === 'food' ? '#9fdc6a' : '#f0a24a');
      }
      this.gained[p.type] += p.amount;
      this.particles.emit(p.x, p.y, { count: 10, colors: ['#fff2b0', '#ffd36b'], speed: 50, life: 0.5 });
    }
  }

  dust(x, y, count) {
    this.particles.emit(x, y, { count, colors: ['#5c5650', '#7a6a58', '#3a3530'], speed: 60, life: 0.5 });
  }

  checkEnd(dt) {
    const t = this.truck;
    if (t.y <= this.goalY) return this.end('won', 'Вы добрались до радиовышки!');
    if (t.hp <= 0) return this.end('lost', 'Машина разбита');
    if (this.dogStarve > SURVIVAL.starveLimit) return this.end('lost', 'Собака погибла от голода');
    if (this.starve > SURVIVAL.starveLimit) return this.end('lost', 'Водитель умер от голода');
    this.stall = t.fuel <= 0 && Math.abs(t.speed) < 5 ? this.stall + dt : 0;
    if (this.stall > SURVIVAL.noFuelLimit) return this.end('lost', 'Кончилось топливо');
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

function isFuelLow(truck) {
  return truck.fuel < truck.stats.maxFuel * 0.2;
}
