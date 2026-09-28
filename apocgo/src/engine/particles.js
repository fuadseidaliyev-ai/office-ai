// Lightweight top-down particle system (dust, blood, sparks, debris).

export class Particles {
  constructor(max = 600) {
    this.max = max;
    this.list = [];
  }

  emit(x, y, {
    count = 8, colors = ['#fff'], speed = 60, spread = Math.PI * 2, angle = 0,
    life = 0.6, size = 1, friction = 4,
  } = {}) {
    for (let i = 0; i < count; i++) {
      if (this.list.length >= this.max) this.list.shift();
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.list.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.4),
        maxLife: life,
        size: size + (Math.random() < 0.3 ? 1 : 0),
        color: colors[(Math.random() * colors.length) | 0],
        friction,
      });
    }
  }

  update(dt) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) {
        l.splice(i, 1);
        continue;
      }
      const f = Math.exp(-p.friction * dt);
      p.vx *= f;
      p.vy *= f;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx) {
    for (const p of this.list) {
      ctx.globalAlpha = Math.min(1, p.life / (p.maxLife * 0.5));
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
}
