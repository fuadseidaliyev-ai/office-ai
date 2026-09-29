// Draws a World into the world buffer (1600x900, world units == concept-art pixels).
// Layer order (bottom → top): ground, road, markings, decals, holes, pickups,
// obstacles, zombies, truck, gunfire, particles, roadside decor, screen overlays.

import { BUFFER_W, BUFFER_H, DOG_GUN, OBSTACLE_ART_SCALE, PICKUPS, PIXEL, ROAD_HALF } from './config.js';
import { art } from './art.js';
import {
  bushSprite, paintSprite, pickupSprite, radioTowerSprite, tyreSprite, vignette,
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

// The obstacle just hit flashes red (outline + tint); otherwise obstacles are drawn
// exactly as in the art. Variants are rendered once and cached.
const HAZARD = {
  hit: { outline: 'rgba(255,40,30,1)', tint: 'rgba(255,40,30,0.45)' },
};
const HAZARD_PAD = 4; // outline thickness in art pixels
const hazardCache = new Map();

export function hazardImage(name, variant) {
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

/** Draw an art image centred at (x, y). `hazard: 'hit'` draws the red impact flash. */
export function drawArt(ctx, name, x, y, { flip = false, rot = 0, scale = 1, w = 0, hazard = null } = {}) {
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
export function drawPixel(ctx, img, x, y, scale = PIXEL) {
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
}

export function shadow(ctx, x, y, rx, ry, alpha = 0.35) {
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
  drawGround(ctx, world, top, bottom, left, right);
  drawSkids(ctx, world);

  for (const pk of world.pickups) drawPickup(ctx, pk, world.time);

  for (const ob of world.obstacles) {
    if (!ob.ground) drawObstacle(ctx, ob, isFlashing(world, ob) ? 'hit' : null);
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
/**
 * Everything flat on the ground between world y `top`..`bottom`: dirt, asphalt, crumbling
 * edges, markings, decals and flat obstacles. Used by the top-down view directly and by
 * the chase view (rendered into its ground buffer, then projected).
 */
function drawSkids(ctx, world) {
  ctx.lineCap = 'round';
  ctx.lineWidth = 16;
  for (const s of world.skids) {
    const fade = Math.max(0, 1 - s.age / 7);
    ctx.strokeStyle = `rgba(14,10,8,${s.a * fade})`;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
}

// Wheel positions in the truckGun art (centre-relative): [x, y, isFront].
const TRUCK_WHEELS = [[-80, -90, true], [80, -90, true], [-93, 70, false], [93, 70, false]];
const FRONT_STEER = 0.6; // rad the front wheels turn at full lock (~35°)
const TRUCK_ROLL = 6; // px the body shifts to the outside of a turn

export function drawGround(ctx, world, top, bottom, left, right) {
  const p = getPatterns(ctx);
  ctx.fillStyle = p.ground;
  ctx.fillRect(left, top, right - left, bottom - top);
  ctx.fillStyle = p.asphalt;
  ctx.fillRect(-ROAD_HALF, top, ROAD_HALF * 2, bottom - top);
  drawRoadEdges(ctx, top, bottom, p);
  drawMarkings(ctx, top, bottom);
  // ground-level decals (cracks, graffiti, blood)
  for (const d of world.decals) {
    const y = d.y ?? 0;
    if (y > top - 300 && y < bottom + 300) drawDecal(ctx, d);
  }
  // flat obstacles (road collapse) are part of the road surface
  for (const ob of world.obstacles) {
    if (ob.ground && ob.y > top - 400 && ob.y < bottom + 400) drawObstacle(ctx, ob, isFlashing(world, ob) ? 'hit' : null);
  }
}

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
  const def = PICKUPS[pk.type];
  const r = def.size ? def.size * 0.85 : 46;
  const g = ctx.createRadialGradient(pk.x, pk.y, 4, pk.x, pk.y, r);
  g.addColorStop(0, `rgba(255,214,120,${0.22 + pulse * 0.22})`);
  g.addColorStop(1, 'rgba(255,214,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(pk.x - r, pk.y - r, r * 2, r * 2);
  const bob = Math.round(pulse * 3);
  if (def.art && art[def.art]) {
    shadow(ctx, pk.x + 4, pk.y + def.size * 0.35, def.size * 0.42, def.size * 0.12);
    drawArt(ctx, def.art, pk.x, pk.y - bob, { w: def.size });
  } else {
    shadow(ctx, pk.x + 3, pk.y + 16, 18, 6);
    drawPixel(ctx, pickupSprite(pk.type), pk.x, pk.y - bob, PIXEL + 1);
  }
}

/** The obstacle the truck just hit blinks red for a moment. */
export function isFlashing(world, ob) {
  const t = world.time - (ob.hitAt ?? -99);
  return t < 0.7 && Math.floor(t * 10) % 2 === 0;
}

function drawObstacle(ctx, ob, hazard) {
  const scale = ob.scale ?? OBSTACLE_ART_SCALE;
  if (ob.ground) {
    // a patch of broken road: no outline (it has soft edges), red wash when hit
    drawArt(ctx, ob.art, ob.x, ob.y, { flip: ob.flip, scale });
    if (hazard === 'hit') {
      ctx.fillStyle = 'rgba(255,40,30,0.3)';
      ctx.beginPath();
      ctx.ellipse(ob.x, ob.y, ob.w * 0.32, ob.h * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  shadow(ctx, ob.x + 14, ob.y + 22, ob.w * 0.42, ob.h * 0.4, 0.28);
  drawArt(ctx, ob.art, ob.x, ob.y, { flip: ob.flip, scale, hazard });
}

function drawZombie(ctx, z) {
  // single-frame art, animated with a shambling bob / sway
  const bob = Math.abs(Math.sin(z.t * 5)) * 4;
  shadow(ctx, z.x + 4, z.y + 44, 26, 8);
  drawArt(ctx, z.art, z.x, z.y - bob, { flip: z.face < 0, rot: Math.sin(z.t * 2.5) * 0.06 });
}

function drawTruck(ctx, world) {
  const t = world.truck;
  const img = art.truckGun || art.truck;
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
  // Wheels stick out from under the body; the front pair steers with the wheel and the
  // body rolls a little to the outside of the turn, so in a turn the tyres show.
  const turn = t.steer; // −1..1
  const roll = -turn * TRUCK_ROLL;
  if (!blink) {
    const tyre = tyreSprite();
    const wheelAngle = turn * FRONT_STEER;
    for (const [wx, wy, front] of TRUCK_WHEELS) {
      ctx.save();
      ctx.translate(wx, wy);
      if (front) ctx.rotate(wheelAngle);
      ctx.drawImage(tyre, -tyre.width / 2, -tyre.height / 2);
      ctx.restore();
    }
  }
  if (img && !blink) ctx.drawImage(img, -img.width / 2 + roll, -img.height / 2);
  if (t.braking && img) {
    ctx.fillStyle = 'rgba(255,50,30,0.35)';
    ctx.beginPath();
    ctx.arc(-68, img.height / 2 - 46, 24, 0, Math.PI * 2);
    ctx.arc(68, img.height / 2 - 46, 24, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // the dog at the machine gun, turning toward whatever it shoots at
  const dog = art.dogGunner;
  if (dog && art.truckGun && !blink) {
    const p = world.dogPivot;
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y));
    ctx.rotate(world.dogAim);
    ctx.drawImage(dog, -dog.width / 2, -dog.height / 2);
    ctx.restore();
  }
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
    const { x, y } = world.dogPos; // the dog fires from the truck bed
    const g = ctx.createRadialGradient(x, y, 2, x, y, 70);
    g.addColorStop(0, 'rgba(255,240,180,0.9)');
    g.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 70, y - 70, 140, 140);
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
