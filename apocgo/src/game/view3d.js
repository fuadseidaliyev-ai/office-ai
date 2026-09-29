// Chase-camera view (behind and above the truck, road running to the horizon) — a
// pseudo-3D projection of the same 2D world the top-down view draws:
//  * the ground (road, markings, decals, road collapses) is rendered top-down into an
//    offscreen buffer, then copied to the screen one row at a time with perspective
//    ("mode 7");
//  * everything else is a sprite placed and scaled by its distance, drawn far → near.
// The simulation is untouched; only drawing differs.

import { BUFFER_W, BUFFER_H, CHUNK_H, DOG_GUN, OBSTACLE_ART_SCALE, PERSP, PICKUPS, VIEW_H } from './config.js';
import { art } from './art.js';
import { bushSprite, pickupSprite, radioTowerSprite, vignette } from './sprites.js';
import { drawGround, hazardImage, isFlashing } from './view.js';

let W = BUFFER_W;
let H = BUFFER_H;
let CX = W / 2;


/** Camera for this frame: world position of the focus point and the camera behind it. */
function makeCamera(world, hideTruck) {
  const t = world.truck;
  const fy = hideTruck ? world.camera.y + VIEW_H * 0.22 : t.y;
  const fx = hideTruck ? world.camera.x : t.x * PERSP.followX;
  const shake = world.camera;
  return {
    fx,
    camY: fy + PERSP.camBack, // the camera sits behind the focus (forward is −y)
    ox: shake.ox * 0.6,
    oy: shake.oy * 0.6,
  };
}

/** World point on the ground → screen. Returns null behind the near plane. */
function project(cam, x, y) {
  const z = cam.camY - y;
  if (z < PERSP.near) return null;
  const s = PERSP.focal / z;
  return { x: CX + (x - cam.fx) * s + cam.ox, y: PERSP.horizon + PERSP.camH * s + cam.oy, s, z };
}

export function drawWorld3D(ctx, world, { hideTruck = false } = {}) {
  W = BUFFER_W;
  H = BUFFER_H;
  CX = W / 2;
  const cam = makeCamera(world, hideTruck);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;

  drawSky(ctx, cam);
  drawGroundRows(ctx, world, cam);
  drawHaze(ctx);

  // ------------------------------------------------ sprites, far → near
  const items = [];
  const add = (y, draw) => items.push({ y, draw });

  for (const d of world.decor) add(d.y, () => drawDecor(ctx, cam, d));
  for (const ob of world.obstacles) {
    if (!ob.ground) add(ob.y, () => drawObstacle(ctx, cam, world, ob));
    else if (isFlashing(world, ob)) add(ob.y, () => flatEllipse(ctx, cam, ob.x, ob.y, ob.w * 0.32, ob.h * 0.3, 'rgba(255,40,30,0.35)'));
  }
  for (const pk of world.pickups) add(pk.y, () => drawPickup(ctx, cam, world, pk));
  for (const z of world.zombies) if (!z.dead) add(z.y, () => drawZombie(ctx, cam, z));
  if (!hideTruck) add(world.truck.y, () => drawTruck(ctx, cam, world));
  items.sort((a, b) => a.y - b.y); // smaller y = further ahead = drawn first
  for (const it of items) it.draw();

  drawGunfire(ctx, cam, world);
  drawParticles(ctx, cam, world);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(vignette(W / 4, H / 4), 0, 0, W, H);
  if (world.hitFlash > 0) {
    ctx.fillStyle = `rgba(160,20,10,${0.3 * world.hitFlash})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ------------------------------------------------------------ sky & ground

function drawSky(ctx, cam) {
  const g = ctx.createLinearGradient(0, 0, 0, PERSP.horizon + 40);
  g.addColorStop(0, '#4a3a2e');
  g.addColorStop(0.7, '#9a7652');
  g.addColorStop(1, '#c49b6c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, PERSP.horizon + 60);
  // distant ridges, drifting slightly as the truck moves sideways
  const shift = -cam.fx * 0.03;
  for (const [amp, base, color, freq] of [[34, 30, '#6d5642', 0.004], [22, 12, '#5a4636', 0.009]]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, PERSP.horizon + 2);
    for (let x = 0; x <= W; x += 16) {
      const n = Math.sin((x + shift) * freq) * 0.6 + Math.sin((x + shift) * freq * 2.7 + 1.3) * 0.4;
      ctx.lineTo(x, PERSP.horizon - base - (n * 0.5 + 0.5) * amp);
    }
    ctx.lineTo(W, PERSP.horizon + 2);
    ctx.closePath();
    ctx.fill();
  }
}

// The ground is cached as top-down tiles, one per world chunk, rendered once and only
// redrawn when something on them changes (e.g. a new blood splat). Each frame just
// copies one source row per screen row.
const tiles = new Map(); // chunk index -> { canvas, sig }

function groundSignature(world, top, bottom) {
  let n = 0;
  for (const d of world.decals) {
    const y = d.y ?? 0;
    if (y > top - 300 && y < bottom + 300) n++;
  }
  for (const ob of world.obstacles) if (ob.ground && ob.y > top - 400 && ob.y < bottom + 400) n += 1000;
  return n;
}

function groundTile(world, i) {
  const gs = PERSP.groundScale;
  const halfW = PERSP.groundHalfW;
  const top = -(i + 1) * CHUNK_H;
  const bottom = top + CHUNK_H;
  const sig = groundSignature(world, top, bottom);
  let t = tiles.get(i);
  if (t && t.sig === sig) return t.canvas;
  if (!t) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(halfW * 2 * gs);
    canvas.height = Math.ceil(CHUNK_H * gs);
    t = { canvas, sig };
    tiles.set(i, t);
  }
  t.sig = sig;
  const g = t.canvas.getContext('2d');
  g.setTransform(gs, 0, 0, gs, halfW * gs, -top * gs);
  g.imageSmoothingEnabled = true;
  drawGround(g, world, top, bottom, -halfW, halfW);
  return t.canvas;
}

function drawGroundRows(ctx, world, cam) {
  const gs = PERSP.groundScale;
  const halfW = PERSP.groundHalfW;
  const bw = Math.ceil(halfW * 2 * gs);

  // background beyond the tiles' sides: plain dirt
  ctx.fillStyle = '#6f4d31';
  ctx.fillRect(0, PERSP.horizon, W, H - PERSP.horizon);

  const { camH, focal, horizon, far } = PERSP;
  const used = new Set();
  for (let sy = horizon + 1; sy < H; sy++) {
    const z = (camH * focal) / (sy - horizon - cam.oy);
    if (z > far || z <= 0) continue;
    const yw = cam.camY - z;
    const ti = Math.floor(-yw / CHUNK_H);
    if (ti < 0) continue;
    const tile = groundTile(world, ti);
    used.add(ti);
    const by = (yw + (ti + 1) * CHUNK_H) * gs;
    const perPx = z / focal; // world units per screen pixel on this row
    const xL = cam.fx + (0 - CX - cam.ox) * perPx;
    const srcX = (xL + halfW) * gs;
    const srcW = W * perPx * gs;
    // clip the source to the tile and shrink the destination accordingly
    const a = Math.max(0, srcX);
    const b = Math.min(bw, srcX + srcW);
    if (b <= a) continue;
    const dx = ((a - srcX) / srcW) * W;
    const dw = ((b - a) / srcW) * W;
    ctx.drawImage(tile, a, Math.min(by, tile.height - 1), b - a, 1, dx, sy, dw, 1);
  }
  // drop tiles that scrolled out of view
  for (const k of tiles.keys()) if (!used.has(k)) tiles.delete(k);
}

function drawHaze(ctx) {
  const g = ctx.createLinearGradient(0, PERSP.horizon - 10, 0, PERSP.horizon + 260);
  g.addColorStop(0, 'rgba(196,155,108,1)');
  g.addColorStop(0.25, 'rgba(196,155,108,0.55)');
  g.addColorStop(1, 'rgba(196,155,108,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, PERSP.horizon - 10, W, 270);
}

// ------------------------------------------------------------ sprite helpers

/**
 * Draw an image lying flat on the ground at (x, y): scaled by distance and foreshortened
 * vertically. `lift` (0..1) makes tall things (rocks, wrecks) less flat than decals.
 */
function drawFlat(ctx, cam, img, x, y, { scale = 1, rot = 0, flip = false, lift = 0 } = {}) {
  const p = project(cam, x, y);
  if (!p || !img) return null;
  const squash = Math.min(1, PERSP.camH / p.z + lift);
  ctx.save();
  ctx.setTransform(p.s * scale, 0, 0, p.s * scale * squash, p.x, p.y);
  if (rot) ctx.rotate(rot);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
  return p;
}

/** Draw an image standing upright on the ground point (x, y) (feet at that point). */
function drawUpright(ctx, cam, img, x, y, { scale = 1, flip = false, rot = 0, lift = 0 } = {}) {
  const p = project(cam, x, y);
  if (!p || !img) return null;
  ctx.save();
  ctx.setTransform(p.s * scale, 0, 0, p.s * scale, p.x, p.y - lift * p.s);
  if (rot) ctx.rotate(rot);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -img.width / 2, -img.height);
  ctx.restore();
  return p;
}

function flatShadow(ctx, cam, x, y, rx, ry, alpha = 0.35) {
  flatEllipse(ctx, cam, x, y, rx, ry, `rgba(10,6,3,${alpha})`);
}

function flatEllipse(ctx, cam, x, y, rx, ry, color) {
  const p = project(cam, x, y);
  if (!p) return;
  const squash = Math.min(1, PERSP.camH / p.z);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rx * p.s, ry * p.s * squash, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ------------------------------------------------------------ world objects

function drawDecor(ctx, cam, d) {
  switch (d.kind) {
    case 'bush': {
      const img = bushSprite(d.seed % 8);
      drawUpright(ctx, cam, img, d.x, d.y, { scale: 3 });
      break;
    }
    case 'barrels':
      drawUpright(ctx, cam, art.barrel1, d.x, d.y);
      drawUpright(ctx, cam, art.barrelLying1, d.x + 30 * (d.flip ? -1 : 1), d.y + 50, { flip: d.flip });
      break;
    case 'guardrail':
      drawFlat(ctx, cam, art.guardrail, d.x, d.y, { flip: d.flip, lift: 0.3 });
      break;
    case 'tower':
      drawUpright(ctx, cam, radioTowerSprite(), d.x, d.y, { scale: 8 });
      break;
    default: {
      const img = art[d.kind];
      if (img) drawUpright(ctx, cam, img, d.x, d.y + img.height * 0.35, { flip: d.flip });
    }
  }
}

function drawObstacle(ctx, cam, world, ob) {
  const hit = isFlashing(world, ob);
  const img = hit ? hazardImage(ob.art, 'hit') : art[ob.art];
  drawFlat(ctx, cam, img, ob.x, ob.y, { scale: ob.scale ?? OBSTACLE_ART_SCALE, flip: ob.flip, lift: 0.3 });
}

function drawPickup(ctx, cam, world, pk) {
  const def = PICKUPS[pk.type];
  const bob = Math.sin((world.time + pk.t) * 4) * 6 + 10;
  const p = project(cam, pk.x, pk.y);
  if (!p) return;
  // warm glow on the ground so resources stand out from far away
  const r = (def.size || 60) * 0.9 * p.s;
  const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, r);
  g.addColorStop(0, 'rgba(255,214,120,0.45)');
  g.addColorStop(1, 'rgba(255,214,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  const img = def.art ? art[def.art] : pickupSprite(pk.type);
  if (!img) return;
  const scale = def.size ? def.size / img.width : 4;
  drawUpright(ctx, cam, img, pk.x, pk.y, { scale, lift: bob });
}

function drawZombie(ctx, cam, z) {
  const img = art[z.art];
  if (!img) return;
  flatShadow(ctx, cam, z.x, z.y + 40, 26, 10);
  const bob = Math.abs(Math.sin(z.t * 5)) * 4;
  drawUpright(ctx, cam, img, z.x, z.y + 40, { flip: z.face < 0, rot: Math.sin(z.t * 2.5) * 0.05, lift: bob });
}

function drawTruck(ctx, cam, world) {
  const t = world.truck;
  const img = art.truckGun || art.truck;
  // headlight beams on the road ahead
  const a = project(cam, t.x - 60, t.y - 160);
  const b = project(cam, t.x + 60, t.y - 160);
  const c = project(cam, t.x + 190, t.y - 560);
  const d = project(cam, t.x - 190, t.y - 560);
  if (a && b && c && d) {
    const g = ctx.createLinearGradient(0, a.y, 0, c.y);
    g.addColorStop(0, 'rgba(255,226,150,0.22)');
    g.addColorStop(1, 'rgba(255,226,150,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }
  flatShadow(ctx, cam, t.x + 10, t.y + 18, 104, 165, 0.4);
  const blink = t.invuln > 0 && Math.floor(t.invuln * 20) % 2 === 0;
  if (!blink) drawFlat(ctx, cam, img, t.x, t.y, { rot: t.tilt, lift: 0.15 });
  if (t.braking && !blink) {
    for (const sx of [-68, 68]) {
      const p = project(cam, t.x + sx, t.y + 150);
      if (!p) continue;
      ctx.fillStyle = 'rgba(255,50,30,0.4)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 24 * p.s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // the dog at the machine gun, in the pose for the side it is firing to
  if (art.dogGunner && art.truckGun && !blink) {
    const pose = DOG_GUN.poses[world.dogDir];
    const p = world.fromTruckLocal(pose.at);
    const img = pose.art ? art[pose.art] : art.dogGunner;
    drawFlat(ctx, cam, img, p.x, p.y, { rot: world.truck.tilt, flip: pose.flip, scale: pose.scale ?? 1, lift: 0.25 });
  }
}

function drawGunfire(ctx, cam, world) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const s of world.shots) {
    const a = project(cam, s.x1, s.y1);
    const b = project(cam, s.x2, s.y2);
    if (!a || !b) continue;
    ctx.strokeStyle = `rgba(255,230,160,${Math.min(1, s.t * 10)})`;
    ctx.lineWidth = 3 * a.s;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - 30 * a.s);
    ctx.lineTo(b.x, b.y - 60 * b.s);
    ctx.stroke();
  }
  if (world.muzzle > 0) {
    const m = world.dogPos;
    const p = project(cam, m.x, m.y);
    if (p) {
      const r = 70 * p.s;
      const g = ctx.createRadialGradient(p.x, p.y - 30 * p.s, 1, p.x, p.y - 30 * p.s, r);
      g.addColorStop(0, 'rgba(255,240,180,0.9)');
      g.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - r, p.y - 30 * p.s - r, r * 2, r * 2);
    }
  }
}

function drawParticles(ctx, cam, world) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const pt of world.particles.list) {
    const p = project(cam, pt.x, pt.y);
    if (!p) continue;
    ctx.globalAlpha = Math.min(1, pt.life / (pt.maxLife * 0.5));
    ctx.fillStyle = pt.color;
    const sz = Math.max(1, pt.size * p.s);
    ctx.fillRect(p.x, p.y - 20 * p.s, sz, sz);
  }
  ctx.globalAlpha = 1;
}
