import { damp } from './math.js';

// World-space camera with smooth follow and screen shake.
export class Camera {
  constructor(viewW, viewH) {
    this.viewW = viewW;
    this.viewH = viewH;
    this.x = 0;
    this.y = 0;
    this.shakeTime = 0;
    this.shakeMag = 0;
    this.ox = 0;
    this.oy = 0;
    this.shakeScale = 1; // world units per "shake pixel"
    this.zoom = 1; // buffer pixels per world unit
  }

  follow(tx, ty, dt, rate = 8) {
    const k = damp(rate, dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
  }

  snap(tx, ty) {
    this.x = tx;
    this.y = ty;
  }

  shake(magnitude, time = 0.25) {
    this.shakeMag = Math.max(this.shakeMag, magnitude * this.shakeScale);
    this.shakeTime = Math.max(this.shakeTime, time);
  }

  update(dt) {
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      this.ox = (Math.random() * 2 - 1) * this.shakeMag;
      this.oy = (Math.random() * 2 - 1) * this.shakeMag;
      if (this.shakeTime <= 0) this.shakeMag = 0;
    } else {
      this.ox = this.oy = 0;
    }
  }

  get top() {
    return this.y - this.viewH / 2;
  }
  get bottom() {
    return this.y + this.viewH / 2;
  }
  get left() {
    return this.x - this.viewW / 2;
  }
  get right() {
    return this.x + this.viewW / 2;
  }

  /** Apply the world transform to a context (pixel-snapped to avoid shimmering). */
  apply(ctx) {
    const z = this.zoom;
    ctx.setTransform(
      z, 0, 0, z,
      Math.round((this.viewW / 2 - this.x + this.ox) * z),
      Math.round((this.viewH / 2 - this.y + this.oy) * z),
    );
  }

  isVisible(x, y, margin = 32) {
    return (
      x > this.left - margin && x < this.right + margin &&
      y > this.top - margin && y < this.bottom + margin
    );
  }
}
