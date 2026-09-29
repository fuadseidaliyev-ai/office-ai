// Draws a World into the world buffer (1600x900, world units == concept-art pixels).
// Layer order (bottom → top): ground, road, markings, decals, holes, pickups,
// obstacles, zombies, truck, gunfire, particles, roadside decor, screen overlays.

import { BUFFER_W, BUFFER_H, OBSTACLE_SCALE as S, PIXEL, ROAD_HALF } from './config.js';
import { art } from './art.js';
import {
  bushSprite, paintSprite, pickupSprite, radioTowerSprite, vignette,
} from './sprites.js';

let patterns = null;

function getPatterns(ctx) {
  if (!patterns) {
    patterns = {
      ground: art.dirt ? ctx.createPattern(art.dirt, 'repeat') : '#7a5634',
      asphalt: art.asphalt ? ctx.createPattern(art.asphalt, 'repeat') : '#3f3b37',
    };
  }
  return patterns;
}

// Cheap deterministic noise from a number (for worn markings / crumbling edges).
const noise = (n) => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

// Obstacles get a warm hazard outline + tint so they read clearly against the grey
// asphalt; the one just hit flashes red. Variants are rendered once and cached.
const HAZARD = {
  normal: { outline: 'rgba(255,138,42,0.9)', tint: 'rgba(255,120,40,0.16)' },
  hit: { outline: 'rgba(255,40,30,1)', tint: 'rgba(255,40,30,0.45)' },
};
const HAZARD_PAD = 6; // outline thickness in art pixels
const hazardCache = new Map();

function hazardImage(name, variant) {
  const key = `${name}:${variant}`;
  if (hazardCache.has(key)) return hazardCache.get(key);
  const img = art[name];
  const pad = HAZARD_PAD;
  const { outline, tint } = HAZARD[variant];
  // coloured silhouette
  const sil = document.createElement('canvas');
  sil.width = img.width;
  sil.height = img.height;
  const sg = sil.getContext('2d');
  sg.drawImage(img, 0, 0);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = outline;
  sg.fillRect(0, 0, sil.width, sil.height);
  // outline = silhouette stamped around the sprite, then the tinted sprite on top
  const c = document.createElement('canvas');
  c.width = img.width + pad * 2;
  c.height = img.height + pad * 2;
  const g = c.getContext('2d');
  for (let a = 0; a < 16; a++) {
    const t = (a / 16) * Math.PI * 2;
    g.drawImage(sil, pad + Math.cos(t) * pad, pad + Math.sin(t) * pad);
  }
  const body = document.createElement('canvas');
  body.width = img.width;
  body.height = img.height;
  const bg = body.getContext('2d');
  bg.drawImage(img, 0, 0);
  bg.globalCompositeOperation = 'source-atop';
  bg.fillStyle = tint;
  bg.fillRect(0, 0, body.width, body.height);
  g.drawImage(body, pad, pad);
  hazardCache.set(key, c);
  return c;
}

/** Draw an art image centred at (x, y). `hazard`: 'normal' | 'hit' adds the obstacle outline. */
function drawArt(ctx, name, x, y, { flip = false, rot = 0, scale = 1, w = 0, hazard = null } = {}) {
  let img = art[name];
  if (!img) return;
  const s = w ? w / img.width : scale;
  if (hazard) img = hazardImage(name, hazard);
  const dw = img.width * s;
  const dh = img.height * s;
  if (!flip && !rot) {
    ctx.drawImage(img, Math.round(x - dw / 2), Math.round(y - dh / 2), Math.round(dw), Math.round(dh));
    return;
  }
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (rot) ctx.rotate(rot);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

/** Draw a procedural pixel sprite at PIXEL scale, centred. */
function drawPixel(ctx, img, x, y, scale = PIXEL) {
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
}

function shadow(ctx, x, y, rx, ry, alpha = 0.35) {
  ctx.fillStyle = `rgba(10,6,3,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(Math.round(x), Math.round(y), rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawWorld(ctx, world, { hideTruck = false, debug = false } = {}) {
  const cam = world.camera;
  ctx.imageSmoothingEnabled = false;
  cam.apply(ctx);
  const top = Math.floor(cam.top) - 120;
  const bottom = Math.ceil(cam.bottom) + 120;
  const left = Math.floor(cam.left) - 120;
  const right = Math.ceil(cam.right) + 120;
  const p = getPatterns(ctx);

  // ground & road
  ctx.fillStyle = p.ground;
  ctx.fillRect(left, top, right - left, bottom - top);
  ctx.fillStyle = p.asphalt;
  ctx.fillRect(-ROAD_HALF, top, ROAD_HALF * 2, bottom - top);
  drawRoadEdges(ctx, top, bottom, p);
  drawMarkings(ctx, top, bottom);

  // ground-level decals (cracks, graffiti, blood)
  for (const d of world.decals) drawDecal(ctx, d);

  // collapses are part of the road surface: art + a hazard ring around the hole
  for (const ob of world.obstacles) {
    if (ob.kind !== 'collapse') continue;
    drawArt(ctx, 'collapse', ob.x, ob.y, { w: ob.w * 1.25, flip: ob.flip });
    const hit = isFlashing(world, ob);
    ctx.strokeStyle = hit ? 'rgba(255,40,30,0.95)' : 'rgba(255,138,42,0.8)';
    ctx.lineWidth = 5;
    ctx.setLineDash([22, 12]);
    ctx.beginPath();
    ctx.ellipse(ob.x, ob.y, ob.w * 0.5, ob.h * 0.5, 0, 0, Math.PI * 2); // == collision ellipse
    ctx.stroke();
    ctx.setLineDash([]);
    if (hit) {
      ctx.fillStyle = 'rgba(255,40,30,0.25)';
      ctx.fill();
    }
  }

  for (const pk of world.pickups) drawPickup(ctx, pk, world.time);

  for (const ob of world.obstacles) {
    if (ob.kind === 'collapse') continue;
    drawObstacle(ctx, ob, isFlashing(world, ob) ? 'hit' : 'normal');
  }

  // zombies — sorted by y so lower ones overlap upper ones
  const zs = world.zombies.filter((z) => !z.dead).sort((a, b) => a.y - b.y);
  for (const z of zs) drawZombie(ctx, z);

  if (!hideTruck) drawTruck(ctx, world);
  drawGunfire(ctx, world);

  world.particles.draw(ctx);

  for (const d of world.decor) drawDecor(ctx, d);

  if (debug) drawDebug(ctx, world);

  // screen-space overlays
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(vignette(BUFFER_W / 4, BUFFER_H / 4), 0, 0, BUFFER_W, BUFFER_H);
  if (world.hitFlash > 0) {
    ctx.fillStyle = `rgba(160,20,10,${0.3 * world.hitFlash})`;
    ctx.fillRect(0, 0, BUFFER_W, BUFFER_H);
  }
}

// Smooth 1-D value noise: broad wobble + fine jaggedness.
function edgeNoise(y, seed) {
  const smooth = (period) => {
    const f = y / period;
    const i = Math.floor(f);
    const t = f - i;
    const k = t * t * (3 - 2 * t);
    return noise(i * 1.37 + seed) * (1 - k) + noise((i + 1) * 1.37 + seed) * k;
  };
  return smooth(140) * 0.65 + smooth(22) * 0.35;
}

function drawRoadEdges(ctx, top, bottom, p) {
  // crumbling asphalt edge: dirt eats irregularly into the road, with a dark broken rim
  const step = 8;
  const y0 = Math.floor(top / step) * step;
  for (const side of [-1, 1]) {
    const edge = side * ROAD_HALF;
    const pts = [];
    for (let y = y0; y <= bottom + step; y += step) {
      const n = edgeNoise(y, side > 0 ? 11 : 3);
      pts.push([edge - side * (n * n * 70 - 6), y]);
    }
    ctx.beginPath();
    ctx.moveTo(edge + side * 40, y0);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(edge + side * 40, bottom + step);
    ctx.closePath();
    ctx.fillStyle = p.ground;
    ctx.fill();
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = 'rgba(18,12,8,0.55)';
    ctx.lineWidth = 4;
    ctx.stroke();
    // loose chunks of asphalt scattered on the dirt
    for (let y = Math.floor(top / 40) * 40; y < bottom; y += 40) {
      const n = noise(y * 0.7 + side * 5.3);
      if (n < 0.55) continue;
      ctx.fillStyle = n > 0.8 ? '#4a4540' : '#35312d';
      ctx.fillRect(Math.round(edge + side * (8 + n * 50)), y + Math.round(n * 30), 9 + Math.round(n * 6), 6 + Math.round(n * 4));
    }
  }
}

function paintLine(ctx, x, w, dash, gap, color, top, bottom, wear = 0.12) {
  const period = dash + gap;
  for (let y = Math.floor(top / period) * period; y < bottom; y += period) {
    const n = noise(y + x * 7.7);
    if (n < wear) continue; // faded away completely
    ctx.drawImage(paintSprite(color, w, dash, Math.floor(n * 6)), x, y);
  }
}

function drawMarkings(ctx, top, bottom) {
  const white = '#cfc8b6';
  const yellow = '#c99a2e';
  paintLine(ctx, -ROAD_HALF + 36, 12, 90, 16, white, top, bottom, 0.15);
  paintLine(ctx, ROAD_HALF - 48, 12, 90, 16, white, top, bottom, 0.15);
  paintLine(ctx, -ROAD_HALF / 2, 9, 60, 90, white, top, bottom);
  paintLine(ctx, ROAD_HALF / 2 - 9, 9, 60, 90, white, top, bottom);
  paintLine(ctx, -16, 8, 120, 6, yellow, top, bottom, 0.08);
  paintLine(ctx, 6, 8, 120, 6, yellow, top, bottom, 0.08);
}

function drawDecal(ctx, d) {
  if (d.kind === 'art') {
    drawArt(ctx, d.art, d.x, d.y, { flip: d.flip });
  } else if (d.kind === 'finish') {
    const s = 24;
    for (let x = -ROAD_HALF; x < ROAD_HALF; x += s) {
      const odd = (x / s) % 2 !== 0;
      ctx.fillStyle = odd ? 'rgba(220,214,198,0.85)' : 'rgba(20,18,16,0.85)';
      ctx.fillRect(x, d.y - s, s, s);
      ctx.fillStyle = odd ? 'rgba(20,18,16,0.85)' : 'rgba(220,214,198,0.85)';
      ctx.fillRect(x, d.y, s, s);
    }
  }
}

function drawPickup(ctx, pk, time) {
  const pulse = 0.5 + 0.5 * Math.sin((time + pk.t) * 4);
  const g = ctx.createRadialGradient(pk.x, pk.y, 4, pk.x, pk.y, 46);
  g.addColorStop(0, `rgba(255,214,120,${0.25 + pulse * 0.25})`);
  g.addColorStop(1, 'rgba(255,214,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(pk.x - 46, pk.y - 46, 92, 92);
  shadow(ctx, pk.x + 3, pk.y + 16, 18, 6);
  const bob = Math.round(pulse * 3);
  if (pk.type === 'scrap' && art.crate) drawArt(ctx, 'crate', pk.x, pk.y - bob, { scale: 0.7 });
  else drawPixel(ctx, pickupSprite(pk.type), pk.x, pk.y - bob, PIXEL + 1);
}

/** The obstacle the truck just hit blinks red for a moment. */
function isFlashing(world, ob) {
  const t = world.time - (ob.hitAt ?? -99);
  return t < 0.7 && Math.floor(t * 10) % 2 === 0;
}

function drawObstacle(ctx, ob, hazard) {
  switch (ob.kind) {
    case 'barricade':
      shadow(ctx, ob.x + 6, ob.y + 12, ob.w * 0.55, ob.h * 0.55, 0.3);
      for (const p of ob.pieces) drawArt(ctx, p.art, ob.x + p.dx, ob.y + p.dy, { flip: p.flip, scale: S, hazard });
      break;
    case 'wreck':
      shadow(ctx, ob.x + 8, ob.y + 14, ob.w * 0.55, ob.h * 0.5, 0.3);
      // never mirrored: the art has "POLICE" lettering
      if (ob.horizontal) drawArt(ctx, 'police', ob.x, ob.y, { scale: S, hazard });
      else drawArt(ctx, 'police', ob.x, ob.y, { rot: ob.flip ? Math.PI / 2 : -Math.PI / 2, scale: S, hazard });
      break;
    case 'rail':
      shadow(ctx, ob.x + 6, ob.y + 14, ob.w * 0.5, 16, 0.3);
      drawArt(ctx, 'guardrail', ob.x, ob.y, { flip: ob.flip, rot: ob.flip ? -0.43 : 0.43, scale: S, hazard });
      break;
    case 'tree':
      drawArt(ctx, ob.art, ob.x, ob.y, { rot: ob.flip ? Math.PI / 2 : -Math.PI / 2, scale: S, hazard });
      break;
    default:
      break;
  }
}

function drawZombie(ctx, z) {
  // single-frame art, animated with a shambling bob / sway
  const bob = Math.abs(Math.sin(z.t * 5)) * 4;
  shadow(ctx, z.x + 4, z.y + 44, 26, 8);
  drawArt(ctx, z.art, z.x, z.y - bob, { flip: z.face < 0, rot: Math.sin(z.t * 2.5) * 0.06 });
}

function drawTruck(ctx, world) {
  const t = world.truck;
  const img = art.truck;
  ctx.save();
  ctx.translate(Math.round(t.x), Math.round(t.y));
  ctx.rotate(t.tilt);

  // headlight beams from the roof light bar
  const front = -(img ? img.height : t.h) / 2;
  const g = ctx.createLinearGradient(0, front, 0, front - 360);
  g.addColorStop(0, 'rgba(255,226,150,0.20)');
  g.addColorStop(1, 'rgba(255,226,150,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-60, front + 10);
  ctx.lineTo(60, front + 10);
  ctx.lineTo(170, front - 360);
  ctx.lineTo(-170, front - 360);
  ctx.closePath();
  ctx.fill();

  shadow(ctx, 10, 18, 104, 165, 0.4);
  const blink = t.invuln > 0 && Math.floor(t.invuln * 20) % 2 === 0;
  if (img && !blink) ctx.drawImage(img, -img.width / 2, -img.height / 2);
  if (t.braking && img) {
    ctx.fillStyle = 'rgba(255,50,30,0.35)';
    ctx.beginPath();
    ctx.arc(-78, img.height / 2 - 70, 26, 0, Math.PI * 2);
    ctx.arc(78, img.height / 2 - 70, 26, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawGunfire(ctx, world) {
  for (const s of world.shots) {
    ctx.strokeStyle = `rgba(255,230,160,${Math.min(1, s.t * 10)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  if (world.muzzle > 0) {
    const t = world.truck;
    const g = ctx.createRadialGradient(t.x, t.y - 30, 2, t.x, t.y - 30, 70);
    g.addColorStop(0, 'rgba(255,240,180,0.9)');
    g.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(t.x - 70, t.y - 100, 140, 140);
  }
}

function drawDecor(ctx, d) {
  switch (d.kind) {
    case 'bush':
      drawPixel(ctx, bushSprite(d.seed % 8), d.x, d.y);
      break;
    case 'barrels':
      drawArt(ctx, 'barrel1', d.x, d.y);
      drawArt(ctx, 'barrelLying1', d.x + 30 * (d.flip ? -1 : 1), d.y + 50, { flip: d.flip });
      if (d.seed % 2) drawArt(ctx, 'tire2', d.x - 20, d.y + 100);
      break;
    case 'tower':
      drawPixel(ctx, radioTowerSprite(), d.x, d.y, PIXEL + 1);
      break;
    default:
      drawArt(ctx, d.kind, d.x, d.y, { flip: d.flip });
      break;
  }
}

function drawDebug(ctx, world) {
  ctx.lineWidth = 2;
  const box = (e, color) => {
    ctx.strokeStyle = color;
    ctx.strokeRect(Math.round(e.x - e.w / 2), Math.round(e.y - e.h / 2), e.w, e.h);
  };
  for (const ob of world.obstacles) {
    box(ob, ob.solid ? '#f33' : '#fa0');
  }
  for (const z of world.zombies) box(z, '#0f0');
  for (const pk of world.pickups) box(pk, '#0ff');
  box(world.truck.box, '#fff');
}
