import { approach, clamp, damp } from '../engine/math.js';
import { DRIVE_HALF, ROAD_HALF, SURVIVAL } from './config.js';

// The player's pickup truck (with the dog in the bed). Arcade model: forward speed
// along −y plus a lateral velocity from steering.
export class Truck {
  constructor(stats) {
    this.stats = stats;
    this.x = 0;
    this.y = 0;
    this.w = 150; // hitbox; the art is 195x325
    this.h = 300;
    this.speed = 0;
    this.vx = 0;
    this.tilt = 0;
    this.hp = stats.maxHp;
    this.fuel = stats.maxFuel;
    this.invuln = 0; // brief invulnerability after a heavy hit
    this.slow = 0; // seconds of pothole slowdown
    this.throttle = 0;
    this.braking = false;
    this.offroad = false;
  }

  get maxSpeedNow() {
    let m = this.stats.maxSpeed;
    if (this.offroad) m *= this.stats.offroad;
    if (this.slow > 0) m *= 0.6;
    return m;
  }

  update(dt, input) {
    const s = this.stats;
    this.throttle = input.down('gas') && this.fuel > 0 ? 1 : 0;
    this.braking = input.down('brake');
    const steer = input.axis('left', 'right');

    this.offroad = Math.abs(this.x) > ROAD_HALF;
    this.invuln = Math.max(0, this.invuln - dt);
    this.slow = Math.max(0, this.slow - dt);

    // Longitudinal.
    if (this.throttle) this.speed += s.accel * dt;
    else this.speed = approach(this.speed, 0, s.drag * dt);
    if (this.braking) this.speed -= s.brake * dt;
    const max = this.maxSpeedNow;
    if (this.speed > max) this.speed = approach(this.speed, max, 550 * dt);
    this.speed = clamp(this.speed, -130, s.maxSpeed * 1.2);

    // Lateral: steering authority grows with speed, never zero so you can wiggle free.
    const authority = clamp(Math.abs(this.speed) / 200, 0.25, 1);
    const targetVx = steer * s.handling * authority;
    this.vx += (targetVx - this.vx) * damp(this.offroad ? 6 : 10, dt);

    this.x += this.vx * dt;
    this.y -= this.speed * dt;
    if (Math.abs(this.x) > DRIVE_HALF) {
      this.x = Math.sign(this.x) * DRIVE_HALF;
      this.vx = 0;
    }

    this.tilt += ((this.vx / s.handling) * 0.18 - this.tilt) * damp(12, dt);

    // Fuel.
    const load = this.throttle * clamp(this.speed / s.maxSpeed, 0.3, 1);
    this.fuel = Math.max(0, this.fuel - (SURVIVAL.fuelIdle + SURVIVAL.fuelThrottle * load) * dt);
  }

  damage(amount) {
    this.hp = Math.max(0, this.hp - amount);
  }

  get box() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }
}
