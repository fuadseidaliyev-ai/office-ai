// Procedural pixel-art sprites for things the concept art doesn't contain (pickup
// icons, bushes, the radio tower…). Drawn once into offscreen canvases, cached, and
// rendered at PIXEL scale so their chunky pixels match the art in assets/.

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
    } else if (type === 'repair') {
      // red toolbox with a wrench on the lid
      px('#3a1410', 0, 3, 10, 7);
      px('#c0392b', 1, 4, 8, 5);
      px('#e05a48', 1, 4, 8, 1);
      px('#3a1410', 3, 1, 4, 1); // handle
      px('#3a1410', 3, 1, 1, 3);
      px('#3a1410', 6, 1, 1, 3);
      px('#e8e4da', 2, 7, 1, 1); // wrench
      px('#e8e4da', 3, 6, 1, 1);
      px('#e8e4da', 4, 5, 3, 1);
      px('#e8e4da', 7, 4, 1, 3);
    } else if (type === 'ammo') {
      px('#3a2a1a', 0, 2, 10, 7);
      px('#6b4a2a', 1, 3, 8, 5);
      for (const x of [2, 4, 6]) {
        px('#b8322a', x, 1, 2, 5);
        px('#d8b25a', x, 6, 2, 2);
      }

    }
  }));
}

// ---------------------------------------------------------------- obstacles

// ---------------------------------------------------------------- decor

export function bushSprite(seed) {
  return cached(`bush_${seed}`, () => make(16, 12, (g) => {
    const rng = new RNG(seed);
    for (let i = 0; i < 28; i++) {
      g.fillStyle = rng.pick(['#6b5a33', '#5a4a2a', '#7d6a3e', '#4a3d22']);
      g.fillRect(rng.int(1, 14), rng.int(1, 10), 1, rng.int(1, 3));
    }
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

/** A worn painted road line segment (w x h), several random variants per colour. */
export function paintSprite(color, w, h, variant) {
  return cached(`paint_${color}_${w}_${h}_${variant}`, () => make(w, h, (g, px) => {
    const rng = new RNG(variant * 7919 + w * 31 + h);
    px(color, 0, 0, w, h);
    // erosion: bite out chunks so the paint looks old and cracked
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < (w * h) / 30; i++) {
      g.globalAlpha = rng.range(0.4, 1);
      px('#000', rng.int(0, w - 1), rng.int(0, h - 1), rng.int(1, 4), rng.int(1, 6));
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }));
}

export function vignette(w, h) {
  return cached(`vignette_${w}_${h}`, () => make(w, h, (g) => {
    const grd = g.createRadialGradient(w / 2, h * 0.55, h * 0.25, w / 2, h / 2, w * 0.62);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(20,8,0,0.6)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(140,80,20,0.06)';
    g.fillRect(0, 0, w, h);
  }));
}

/** Top-down tyre (width x length in world px): black rubber, tread blocks, rim edge. */
export function tyreSprite(w = 30, h = 60) {
  return cached(`tyre_${w}_${h}`, () => make(w, h, (g) => {
    g.fillStyle = '#0d0b0a';
    g.beginPath();
    g.roundRect(0, 0, w, h, 7);
    g.fill();
    g.fillStyle = '#242020';
    g.fillRect(3, 4, w - 6, h - 8);
    // tread blocks
    g.fillStyle = '#0a0808';
    for (let y = 6; y < h - 6; y += 7) {
      g.fillRect(3, y, w * 0.38, 3);
      g.fillRect(w * 0.62 - 3, y + 3, w * 0.38, 3);
    }
    // worn highlight along the shoulder
    g.fillStyle = 'rgba(120,110,100,0.35)';
    g.fillRect(2, 5, 2, h - 10);
    g.fillRect(w - 4, 5, 2, h - 10);
  }));
}
