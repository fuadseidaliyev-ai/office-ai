// Procedural pixel-art sprites, drawn once into offscreen canvases and cached.
// No image files are needed yet; later any sprite can be swapped for a PNG with the
// same name in `Sprites.get()`.

import { RNG } from '../engine/rng.js';

const cache = new Map();

function make(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const px = (col, x, y, ww = 1, hh = 1) => {
    g.fillStyle = col;
    g.fillRect(x, y, ww, hh);
  };
  draw(g, px);
  return c;
}

function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

const PAL = {
  outline: '#1e1916',
  rust: '#6e4a2e',
  rustDark: '#4f331f',
  metal: '#8a7b68',
  metalLight: '#a39480',
  glass: '#2f3d47',
  glassHi: '#566873',
  blood: '#6b1a14',
  bloodDark: '#4a100c',
};

// ---------------------------------------------------------------- truck

export function truckSprite() {
  return cached('truck', () => make(20, 38, (g, px) => {
    // wheels
    for (const [x, y] of [[0, 6], [17, 6], [0, 27], [17, 27]]) {
      px('#141211', x, y, 3, 8);
      px('#2c2825', x + (x ? 0 : 2), y + 1, 1, 6);
    }
    // body
    px(PAL.outline, 2, 0, 16, 38);
    px(PAL.metal, 3, 1, 14, 36);
    // hood
    px(PAL.metalLight, 4, 2, 12, 1);
    px('#76695a', 9, 2, 2, 7);
    px(PAL.rust, 5, 5, 2, 2);
    px(PAL.rust, 13, 3, 2, 1);
    px(PAL.rustDark, 14, 7, 1, 2);
    // bull bar + headlights
    px('#3a332d', 3, 0, 14, 1);
    px('#fff2b0', 4, 0, 2, 1);
    px('#fff2b0', 14, 0, 2, 1);
    // windshield
    px(PAL.glass, 4, 10, 12, 3);
    px(PAL.glassHi, 5, 10, 4, 1);
    // roof + light bar
    px('#7d6f5e', 4, 13, 12, 6);
    px('#2a2420', 4, 13, 12, 1);
    for (const x of [5, 8, 11, 14]) px('#ffc85a', x, 13, 1, 1);
    px(PAL.rust, 6, 16, 3, 1);
    px(PAL.glass, 5, 19, 10, 1);
    // bed
    px('#4a3f35', 4, 21, 12, 15);
    px('#3b322a', 4, 21, 12, 1);
    for (let y = 23; y < 36; y += 3) px('#433930', 4, y, 12, 1);
    // cage
    px('#2b2521', 3, 20, 1, 17);
    px('#2b2521', 16, 20, 1, 17);
    px('#2b2521', 3, 20, 14, 1);
    // dog (sitting, seen from above)
    px('#7a5230', 7, 25, 5, 8);
    px('#9a6a3a', 8, 26, 3, 6);
    px('#5c3b20', 7, 23, 5, 3); // head
    px('#2e1f12', 7, 23, 1, 2); // ears
    px('#2e1f12', 11, 23, 1, 2);
    px('#c89a64', 9, 28, 1, 3); // chest stripe
    px('#5c3b20', 12, 32, 2, 1); // tail
    // jerrycan + crate
    px('#4f6b33', 13, 23, 3, 4);
    px('#2f4220', 13, 23, 3, 1);
    px('#8a6a42', 4, 32, 3, 3);
    px('#5e4629', 4, 33, 3, 1);
    // tail lights + dirt
    px('#ff3b30', 3, 36, 2, 1);
    px('#ff3b30', 15, 36, 2, 1);
    px(PAL.blood, 3, 4, 1, 2);
    px(PAL.blood, 16, 30, 1, 3);
    px(PAL.bloodDark, 15, 2, 1, 1);
  }));
}

// ---------------------------------------------------------------- zombies

const ZOMBIE_SHIRTS = ['#5b4a3c', '#44525a', '#6b3f3a'];

export function zombieSprite(variant, frame) {
  return cached(`zombie${variant}_${frame}`, () => make(10, 14, (g, px) => {
    const skin = variant === 1 ? '#8f9b7a' : '#a7a88a';
    const shirt = ZOMBIE_SHIRTS[variant % ZOMBIE_SHIRTS.length];
    // legs (alternate per frame)
    const l = frame ? 1 : 0;
    px('#2b2a2e', 3, 9 + l, 2, 5 - l);
    px('#2b2a2e', 5, 10 - l, 2, 4 + l);
    // torso
    px(PAL.outline, 2, 4, 6, 6);
    px(shirt, 2, 4, 6, 5);
    px(PAL.blood, 3, 6, 2, 2);
    // arms reaching forward
    px(shirt, 0, 4 + l, 2, 3);
    px(shirt, 8, 5 - l, 2, 3);
    px(skin, 0, 7 + l, 2, 1);
    px(skin, 8, 8 - l, 2, 1);
    // head
    px(PAL.outline, 3, 0, 4, 4);
    px(skin, 3, 0, 4, 3);
    px('#3a2e2a', 3, 0, 4, 1); // hair
    px('#c42a1d', 4, 2, 1, 1);
    px('#c42a1d', 6, 2, 1, 1);
  }));
}

// ---------------------------------------------------------------- pickups

export function pickupSprite(type) {
  return cached(`pickup_${type}`, () => make(10, 10, (g, px) => {
    if (type === 'scrap') {
      px('#5d6166', 2, 1, 6, 8);
      px('#5d6166', 1, 2, 8, 6);
      px('#9aa0a6', 2, 2, 6, 6);
      px('#c9ced3', 3, 2, 3, 1);
      px('#3a3d40', 4, 4, 2, 2);
      px('#9aa0a6', 4, 0, 2, 1);
      px('#9aa0a6', 4, 9, 2, 1);
      px('#9aa0a6', 0, 4, 1, 2);
      px('#9aa0a6', 9, 4, 1, 2);
    } else if (type === 'food') {
      px('#5e5a55', 2, 0, 6, 10);
      px('#cfd3d6', 3, 0, 4, 2);
      px('#c0392b', 2, 2, 6, 6);
      px('#e8dcc0', 3, 4, 4, 2);
      px('#8a8f93', 3, 8, 4, 2);
    } else if (type === 'dogFood') {
      px('#7a4a17', 1, 1, 8, 9);
      px('#d38b2c', 2, 1, 6, 8);
      px('#f0b35a', 2, 1, 6, 1);
      px('#5a3514', 4, 5, 2, 2); // paw
      px('#5a3514', 3, 3, 1, 1);
      px('#5a3514', 6, 3, 1, 1);
      px('#5a3514', 4, 3, 2, 1);
    } else if (type === 'fuel') {
      px('#2f4220', 1, 1, 8, 9);
      px('#4f7a2a', 2, 2, 6, 7);
      px('#6c9a3c', 2, 2, 2, 7);
      px('#2f4220', 3, 0, 4, 2);
      px('#d6c24a', 7, 0, 2, 1);
      px('#2f4220', 3, 5, 4, 1);
    }
  }));
}

// ---------------------------------------------------------------- obstacles

export function barrelSprite() {
  return cached('barrel', () => make(9, 9, (g, px) => {
    px('#3d2515', 1, 0, 7, 9);
    px('#3d2515', 0, 1, 9, 7);
    px('#7a4b2a', 1, 1, 7, 7);
    px('#5a341c', 2, 2, 5, 5);
    px('#8f5c34', 3, 3, 3, 3);
    px('#a4703f', 2, 1, 3, 1);
  }));
}

export function tireSprite() {
  return cached('tire', () => make(9, 9, (g, px) => {
    px('#141211', 1, 0, 7, 9);
    px('#141211', 0, 1, 9, 7);
    px('#2a2623', 1, 1, 7, 7);
    px('#141211', 3, 3, 3, 3);
    px('#3a3632', 2, 1, 3, 1);
  }));
}

const WRECK_COLORS = [
  { body: '#d9d4c7', trim: '#1c1c1e', police: true },
  { body: '#7b4e30', trim: '#3b2618' },
  { body: '#4e6070', trim: '#2a333b' },
];

/** Abandoned car, drawn vertically (20x36). */
export function wreckSprite(variant) {
  return cached(`wreck${variant}`, () => make(20, 36, (g, px) => {
    const c = WRECK_COLORS[variant % WRECK_COLORS.length];
    for (const [x, y] of [[0, 5], [17, 5], [0, 26], [17, 26]]) px('#141211', x, y, 3, 7);
    px(PAL.outline, 2, 0, 16, 36);
    px(c.body, 3, 1, 14, 34);
    if (c.police) {
      px(c.trim, 3, 1, 14, 8);
      px(c.trim, 3, 27, 14, 8);
    }
    px('#1b2328', 4, 9, 12, 4); // windshield (smashed)
    px('#8fa3ad', 6, 10, 2, 1);
    px('#1b2328', 5, 22, 10, 3);
    px(c.police ? '#d9d4c7' : c.trim, 4, 13, 12, 9); // roof
    if (c.police) {
      px('#c0392b', 5, 16, 4, 2);
      px('#2e5da8', 11, 16, 4, 2);
    }
    // rust & damage
    px(PAL.rust, 5, 3, 3, 2);
    px(PAL.rust, 12, 29, 3, 3);
    px(PAL.rustDark, 14, 5, 2, 2);
    px(PAL.rustDark, 4, 31, 2, 2);
  }));
}

/** Jagged hole in the asphalt (pothole or collapse). */
export function holeSprite(w, h, seed) {
  return cached(`hole_${w}_${h}_${seed}`, () => make(w + 4, h + 4, (g) => {
    const rng = new RNG(seed);
    const cx = (w + 4) / 2;
    const cy = (h + 4) / 2;
    const n = 14;
    const radii = Array.from({ length: n }, () => rng.range(0.72, 1));
    const poly = (scale, color) => {
      g.fillStyle = color;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = cx + Math.cos(a) * (w / 2) * radii[i] * scale;
        const y = cy + Math.sin(a) * (h / 2) * radii[i] * scale;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.closePath();
      g.fill();
    };
    poly(1.05, '#57504a'); // broken rim
    poly(0.92, '#2a2420');
    poly(0.78, '#15110f');
    poly(0.55, '#070605');
    // loose chunks on the rim
    for (let i = 0; i < Math.max(2, (w * h) / 180); i++) {
      const a = rng.range(0, Math.PI * 2);
      g.fillStyle = rng.pick(['#4a4540', '#625a52', '#3a3530']);
      g.fillRect(
        Math.round(cx + Math.cos(a) * (w / 2) * 0.95),
        Math.round(cy + Math.sin(a) * (h / 2) * 0.95),
        rng.int(1, 2), rng.int(1, 2),
      );
    }
  }));
}

export function rubbleSprite(w, h, seed) {
  return cached(`rubble_${w}_${h}_${seed}`, () => make(w, h, (g) => {
    const rng = new RNG(seed);
    const cols = ['#5c5650', '#6f6861', '#4a4540', '#7a6a58', '#3a3530', '#8b8279'];
    const n = Math.round((w * h) / 22);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const r = rng.range(1.5, 4.5) * (1 - t * 0.5);
      // pile is denser in the middle
      const x = w / 2 + (rng.next() - 0.5) * (w - r * 2) * (0.5 + t * 0.5);
      const y = h / 2 + (rng.next() - 0.5) * (h - r * 2) * (0.5 + t * 0.5);
      g.fillStyle = '#1e1916';
      g.fillRect(Math.round(x - r), Math.round(y - r + 1), Math.round(r * 2), Math.round(r * 2));
      g.fillStyle = rng.pick(cols);
      g.fillRect(Math.round(x - r), Math.round(y - r), Math.round(r * 2), Math.round(r * 2));
    }
    // a bit of rebar
    g.fillStyle = '#6e4a2e';
    for (let i = 0; i < 3; i++) g.fillRect(rng.int(2, w - 8), rng.int(2, h - 3), rng.int(4, 8), 1);
  }));
}

export function poleSprite(w, seed) {
  return cached(`pole_${w}_${seed}`, () => make(w, 10, (g, px) => {
    const rng = new RNG(seed);
    px(PAL.outline, 0, 3, w, 4);
    px('#5b5047', 0, 3, w, 3);
    px('#766a5f', 0, 3, w, 1);
    const bar = rng.int(4, 10);
    px('#3a332d', bar, 0, 2, 10);
    // snapped wires
    g.strokeStyle = '#1a1614';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(bar, 1);
    g.quadraticCurveTo(w * 0.5, rng.range(-2, 12), w - 2, rng.range(0, 9));
    g.stroke();
  }));
}

export function fallenTreeSprite(w, h, seed) {
  return cached(`ftree_${w}_${h}_${seed}`, () => make(w, h + 8, (g, px) => {
    const rng = new RNG(seed);
    const mid = Math.round((h + 8) / 2);
    px('#2a1c12', 0, mid - 3, w, 6);
    px('#4a3322', 0, mid - 2, w, 4);
    px('#5e422b', 0, mid - 2, w, 1);
    px('#6e5a44', 0, mid - 3, 3, 6); // cut/snap end
    g.strokeStyle = '#3a2819';
    g.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const x = rng.range(w * 0.3, w - 4);
      const dir = rng.chance(0.5) ? -1 : 1;
      g.beginPath();
      g.moveTo(x, mid);
      g.lineTo(x + rng.range(3, 8), mid + dir * rng.range(3, 6));
      g.stroke();
    }
  }));
}

// ---------------------------------------------------------------- decor

export function deadTreeSprite(seed) {
  return cached(`dtree_${seed}`, () => make(40, 40, (g) => {
    const rng = new RNG(seed);
    g.strokeStyle = '#2b2019';
    const branch = (x, y, a, len, width, depth) => {
      if (depth === 0 || len < 2) return;
      const x2 = x + Math.cos(a) * len;
      const y2 = y + Math.sin(a) * len;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x2, y2);
      g.stroke();
      const n = rng.int(2, 3);
      for (let i = 0; i < n; i++) branch(x2, y2, a + rng.range(-0.9, 0.9), len * 0.68, Math.max(1, width - 1), depth - 1);
    };
    // top-down tree: branches radiate from the trunk
    for (let i = 0; i < 5; i++) branch(20, 20, rng.range(0, Math.PI * 2), rng.range(6, 10), 2, 4);
    g.fillStyle = '#1e1611';
    g.fillRect(18, 18, 4, 4);
  }));
}

export function bushSprite(seed) {
  return cached(`bush_${seed}`, () => make(16, 12, (g) => {
    const rng = new RNG(seed);
    for (let i = 0; i < 28; i++) {
      g.fillStyle = rng.pick(['#6b5a33', '#5a4a2a', '#7d6a3e', '#4a3d22']);
      g.fillRect(rng.int(1, 14), rng.int(1, 10), 1, rng.int(1, 3));
    }
  }));
}

export function billboardSprite() {
  return cached('billboard', () => make(34, 18, (g, px) => {
    px('#1e1916', 0, 0, 34, 14);
    px('#3c4a4f', 1, 1, 32, 12);
    px('#56666b', 1, 1, 32, 2);
    px('#2e3a3e', 20, 4, 3, 8); // skyline silhouette
    px('#2e3a3e', 24, 2, 3, 10);
    px('#2e3a3e', 28, 6, 3, 6);
    px('#b8a98a', 3, 5, 14, 1);
    px('#b8a98a', 3, 8, 11, 1);
    px(PAL.rust, 12, 10, 6, 2);
    px('#3a2e24', 6, 14, 2, 4); // posts
    px('#3a2e24', 26, 14, 2, 4);
  }));
}

export function radioTowerSprite() {
  return cached('tower', () => make(40, 90, (g, px) => {
    g.strokeStyle = '#3a3230';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(8, 88);
    g.lineTo(20, 4);
    g.lineTo(32, 88);
    for (let y = 12; y < 88; y += 8) {
      const t = (y - 4) / 84;
      g.moveTo(20 - 12 * t, y);
      g.lineTo(20 + 12 * t, y + 8);
      g.moveTo(20 + 12 * t, y);
      g.lineTo(20 - 12 * t, y + 8);
    }
    g.stroke();
    px('#ff3b30', 19, 2, 3, 3);
  }));
}

// ---------------------------------------------------------------- ground

export function groundTile() {
  return cached('ground', () => make(64, 64, (g, px) => {
    const rng = new RNG(1337);
    px('#6b4a2e', 0, 0, 64, 64);
    for (let i = 0; i < 380; i++) {
      px(rng.pick(['#5e4028', '#7a5636', '#634430', '#735033']), rng.int(0, 63), rng.int(0, 63), 1, 1);
    }
    for (let i = 0; i < 12; i++) {
      const x = rng.int(0, 60);
      const y = rng.int(0, 60);
      px('#4f3a22', x, y, 1, 3);
      px('#5a4428', x + 1, y + 1, 1, 2);
    }
  }));
}

export function asphaltTile() {
  return cached('asphalt', () => make(64, 64, (g, px) => {
    const rng = new RNG(4242);
    px('#3b3835', 0, 0, 64, 64);
    for (let i = 0; i < 420; i++) {
      px(rng.pick(['#34312e', '#44403c', '#393633', '#2f2c2a']), rng.int(0, 63), rng.int(0, 63), 1, 1);
    }
  }));
}

export function vignette(w, h) {
  return cached(`vignette_${w}_${h}`, () => make(w, h, (g) => {
    const grd = g.createRadialGradient(w / 2, h * 0.55, h * 0.25, w / 2, h / 2, w * 0.62);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(20,8,0,0.6)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(140,80,20,0.07)';
    g.fillRect(0, 0, w, h);
  }));
}
