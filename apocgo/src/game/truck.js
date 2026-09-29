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
    this.invuln = 0; // brief invulnerability after a heavy hit
    this.slow = 0; // seconds of pothole slowdown
    this.throttle = 0;
    this.steer = 0; // smoothed steering wheel position, −1..1
    this.braking = false;
    this.offroad = false;
    this.hungry = false; // set by the world when the driver is starving
  }

  get maxSpeedNow() {
    let m = this.stats.maxSpeed;
    if (this.offroad) m *= this.stats.offroad;
    if (this.slow > 0) m *= 0.6;
    if (this.hungry) m *= SURVIVAL.hungrySpeed;
    return m;
  }

  update(dt, input) {
    const s = this.stats;
    this.throttle = input.down('gas') ? 1 : 0;
    this.braking = input.down('brake');
    // The wheel turns gradually instead of snapping: it ramps toward the input, and
    // returns to centre a bit faster than it turns in.
    const want = input.axis('left', 'right');
    const returning = want === 0 || Math.sign(want) !== Math.sign(this.steer);
    this.steer = approach(this.steer, want, (returning ? 7 : 3.2) * dt);
    const steer = this.steer;

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
    this.vx += (targetVx - this.vx) * damp(this.offroad ? 4.5 : 6, dt);

    this.x += this.vx * dt;
    this.y -= this.speed * dt;
    if (Math.abs(this.x) > DRIVE_HALF) {
      this.x = Math.sign(this.x) * DRIVE_HALF;
      this.vx = 0;
    }

    // The body swings noticeably into the turn (up to ~47° at full speed), following
    // the direction it actually moves in, so it straightens out again against a wall.
    const heading = clamp(Math.atan2(this.vx, Math.max(Math.abs(this.speed) * 0.6, 160)), -0.85, 0.85);
    this.tilt += (heading - this.tilt) * damp(7, dt);
  }

  /**
   * Collision shape of the (possibly rotated) body: three squares along its spine. Much
   * closer to the drawn truck than one axis-aligned box when it is turned sideways.
   */
  get hitBoxes() {
    const s = Math.sin(this.tilt);
    const c = Math.cos(this.tilt);
    const size = this.w * 0.9;
    return [-100, 0, 100].map((d) => ({ x: this.x - s * d, y: this.y + c * d, w: size, h: size }));
  }

  damage(amount) {
    this.hp = Math.max(0, this.hp - amount);
  }

  get box() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }
}
