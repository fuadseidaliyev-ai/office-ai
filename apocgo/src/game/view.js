// Draws a World into the low-res buffer. Layer order (bottom → top):
// ground, road, markings, decals, holes, pickups, obstacles, zombies, truck,
// particles, tall roadside decor, screen overlays.

import { RNG } from '../engine/rng.js';
import { ROAD_HALF, VIEW_W, VIEW_H } from './config.js';
import {
  asphaltTile, barrelSprite, billboardSprite, bushSprite, deadTreeSprite, fallenTreeSprite,
  groundTile, holeSprite, pickupSprite, poleSprite, radioTowerSprite, rubbleSprite, tireSprite,
  truckSprite, vignette, wreckSprite, zombieSprite,
} from './sprites.js';

let patterns = null;

function getPatterns(ctx) {
  if (!patterns) {
    patterns = {
      ground: ctx.createPattern(groundTile(), 'repeat'),
      asphalt: ctx.createPattern(asphaltTile(), 'repeat'),
    };
  }
  return patterns;
}

// Cheap deterministic noise from a number (for worn markings / crumbling edges).
const noise = (n) => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

export function drawWorld(ctx, world, { hideTruck = false, debug = false } = {}) {
  const cam = world.camera;
  cam.apply(ctx);
  const top = Math.floor(cam.top) - 48;
  const bottom = Math.ceil(cam.bottom) + 48;
  const left = Math.floor(cam.left) - 48;
  const right = Math.ceil(cam.right) + 48;
  const p = getPatterns(ctx);

  // ground & road
  ctx.fillStyle = p.ground;
  ctx.fillRect(left, top, right - left, bottom - top);
  ctx.fillStyle = p.asphalt;
  ctx.fillRect(-ROAD_HALF, top, ROAD_HALF * 2, bottom - top);
  drawRoadEdges(ctx, top, bottom);
  drawMarkings(ctx, top, bottom);

  // ground-level decals
  for (const d of world.decals) drawDecal(ctx, d);

  // holes are part of the road surface
  for (const ob of world.obstacles) {
    if (ob.kind === 'pothole') drawSprite(ctx, holeSprite(Math.round(ob.r * 2), Math.round(ob.r * 2), ob.seed), ob.x, ob.y);
    else if (ob.kind === 'collapse') drawSprite(ctx, holeSprite(ob.w, ob.h, ob.seed), ob.x, ob.y);
  }

  for (const pk of world.pickups) drawPickup(ctx, pk, world.time);

  for (const ob of world.obstacles) {
    if (ob.kind === 'pothole' || ob.kind === 'collapse') continue;
    drawObstacle(ctx, ob);
  }

  for (const z of world.zombies) {
    if (z.dead) continue;
    shadow(ctx, z.x, z.y + 6, 8, 3);
    const frame = z.moving ? Math.floor(z.t * 6) % 2 : 0;
    drawSprite(ctx, zombieSprite(z.variant, frame), z.x, z.y);
  }

  if (!hideTruck) drawTruck(ctx, world);

  world.particles.draw(ctx);

  for (const d of world.decor) drawDecor(ctx, d);

  if (debug) drawDebug(ctx, world);

  // screen-space overlays
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(vignette(VIEW_W, VIEW_H), 0, 0);
  if (world.hitFlash > 0) {
    ctx.fillStyle = `rgba(160,20,10,${0.35 * world.hitFlash})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

function drawSprite(ctx, img, x, y) {
  ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
}

function shadow(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(Math.round(x - w / 2), Math.round(y - h / 2), w, h);
}

function drawRoadEdges(ctx, top, bottom) {
  // crumbling asphalt edge: ground-coloured notches bitten out of the road
  ctx.fillStyle = '#6b4a2e';
  for (let y = Math.floor(top / 6) * 6; y < bottom; y += 6) {
    for (const side of [-1, 1]) {
      const n = noise(y * side + 3.1);
      const depth = Math.floor(n * 5);
      if (depth > 0) ctx.fillRect(side < 0 ? -ROAD_HALF : ROAD_HALF - depth, y, depth, 6);
    }
  }
}

function dashed(ctx, x, w, dash, gap, color, top, bottom, wear = 0.12) {
  const period = dash + gap;
  ctx.fillStyle = color;
  for (let y = Math.floor(top / period) * period; y < bottom; y += period) {
    if (noise(y + x * 7.7) < wear) continue; // faded away
    ctx.fillRect(x, y, w, dash);
  }
}

function drawMarkings(ctx, top, bottom) {
  const white = 'rgba(214,208,192,0.75)';
  const yellow = 'rgba(214,168,58,0.8)';
  dashed(ctx, -ROAD_HALF + 5, 2, 20, 4, white, top, bottom, 0.15);
  dashed(ctx, ROAD_HALF - 7, 2, 20, 4, white, top, bottom, 0.15);
  dashed(ctx, -ROAD_HALF / 2, 2, 12, 18, white, top, bottom);
  dashed(ctx, ROAD_HALF / 2 - 2, 2, 12, 18, white, top, bottom);
  dashed(ctx, -3, 2, 30, 2, yellow, top, bottom, 0.1);
  dashed(ctx, 1, 2, 30, 2, yellow, top, bottom, 0.1);
}

function drawDecal(ctx, d) {
  if (d.kind === 'crack') {
    ctx.strokeStyle = '#1f1c1a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    d.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  } else if (d.kind === 'blood') {
    const rng = new RNG(d.seed);
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = rng.pick(['#5a140e', '#6b1a14', '#4a100c']);
      ctx.fillRect(Math.round(d.x + rng.range(-7, 7)), Math.round(d.y + rng.range(-5, 9)), rng.int(1, 3), rng.int(1, 2));
    }
  } else if (d.kind === 'graffiti') {
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(225,220,205,0.5)';
    ctx.fillText(d.text, d.x, d.y);
  } else if (d.kind === 'finish') {
    for (let x = -ROAD_HALF; x < ROAD_HALF; x += 6) {
      ctx.fillStyle = (x / 6) % 2 ? 'rgba(230,225,210,0.8)' : 'rgba(20,20,20,0.8)';
      ctx.fillRect(x, d.y - 3, 6, 3);
      ctx.fillStyle = (x / 6) % 2 ? 'rgba(20,20,20,0.8)' : 'rgba(230,225,210,0.8)';
      ctx.fillRect(x, d.y, 6, 3);
    }
  }
}

function drawPickup(ctx, pk, time) {
  const pulse = 0.5 + 0.5 * Math.sin((time + pk.t) * 4);
  ctx.fillStyle = `rgba(255,214,120,${0.12 + pulse * 0.18})`;
  ctx.fillRect(Math.round(pk.x - 8), Math.round(pk.y - 8), 16, 16);
  shadow(ctx, pk.x + 1, pk.y + 5, 10, 3);
  drawSprite(ctx, pickupSprite(pk.type), pk.x, pk.y - Math.round(pulse));
}

function drawObstacle(ctx, ob) {
  switch (ob.kind) {
    case 'rubble':
      drawSprite(ctx, rubbleSprite(ob.w, ob.h, ob.seed), ob.x, ob.y);
      break;
    case 'wreck': {
      shadow(ctx, ob.x + 2, ob.y + 3, ob.w, ob.h);
      const img = wreckSprite(ob.variant);
      if (ob.horizontal) {
        ctx.save();
        ctx.translate(Math.round(ob.x), Math.round(ob.y));
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        ctx.restore();
      } else {
        drawSprite(ctx, img, ob.x, ob.y);
      }
      break;
    }
    case 'pole':
      drawSprite(ctx, poleSprite(ob.w, ob.seed), ob.x, ob.y);
      break;
    case 'tree':
      drawSprite(ctx, fallenTreeSprite(ob.w, ob.h, ob.seed), ob.x, ob.y);
      break;
    case 'barrel':
    case 'tire':
      if (ob.broken) return;
      shadow(ctx, ob.x + 1, ob.y + 3, 9, 4);
      drawSprite(ctx, ob.kind === 'barrel' ? barrelSprite() : tireSprite(), ob.x, ob.y);
      break;
    default:
      break;
  }
}

function drawTruck(ctx, world) {
  const t = world.truck;
  // headlight glow
  ctx.save();
  ctx.translate(Math.round(t.x), Math.round(t.y));
  ctx.rotate(t.tilt);
  const g = ctx.createLinearGradient(0, -t.h / 2, 0, -t.h / 2 - 60);
  g.addColorStop(0, 'rgba(255,230,160,0.22)');
  g.addColorStop(1, 'rgba(255,230,160,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-7, -t.h / 2);
  ctx.lineTo(7, -t.h / 2);
  ctx.lineTo(22, -t.h / 2 - 60);
  ctx.lineTo(-22, -t.h / 2 - 60);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-t.w / 2 + 2, -t.h / 2 + 3, t.w, t.h);
  const blink = t.invuln > 0 && Math.floor(t.invuln * 20) % 2 === 0;
  if (!blink) {
    const img = truckSprite();
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
  }
  // brake lights
  if (t.braking) {
    ctx.fillStyle = 'rgba(255,60,40,0.5)';
    ctx.fillRect(-9, t.h / 2 - 1, 5, 3);
    ctx.fillRect(4, t.h / 2 - 1, 5, 3);
  }
  ctx.restore();
}

function drawDecor(ctx, d) {
  switch (d.kind) {
    case 'deadTree':
      drawSprite(ctx, deadTreeSprite(d.seed % 6), d.x, d.y);
      break;
    case 'bush':
      drawSprite(ctx, bushSprite(d.seed % 8), d.x, d.y);
      break;
    case 'wreckSide': {
      const img = wreckSprite(d.seed % 3);
      ctx.save();
      ctx.translate(Math.round(d.x), Math.round(d.y));
      ctx.rotate(d.side * (0.3 + (d.seed % 10) / 20));
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
      break;
    }
    case 'billboard':
      drawSprite(ctx, billboardSprite(), d.x, d.y);
      break;
    case 'barrels':
      drawSprite(ctx, barrelSprite(), d.x, d.y);
      drawSprite(ctx, barrelSprite(), d.x + 7, d.y + 4);
      if (d.seed % 2) drawSprite(ctx, tireSprite(), d.x - 5, d.y + 8);
      break;
    case 'tower':
      drawSprite(ctx, radioTowerSprite(), d.x, d.y);
      break;
    default:
      break;
  }
}

function drawDebug(ctx, world) {
  ctx.lineWidth = 1;
  const box = (e, color) => {
    ctx.strokeStyle = color;
    ctx.strokeRect(Math.round(e.x - e.w / 2) + 0.5, Math.round(e.y - e.h / 2) + 0.5, e.w - 1, e.h - 1);
  };
  for (const ob of world.obstacles) {
    if (ob.kind === 'pothole') {
      ctx.strokeStyle = '#ff0';
      ctx.beginPath();
      ctx.arc(ob.x, ob.y, ob.r * 0.8, 0, Math.PI * 2);
      ctx.stroke();
    } else box(ob, ob.solid ? '#f33' : '#fa0');
  }
  for (const z of world.zombies) box(z, '#0f0');
  for (const pk of world.pickups) box(pk, '#0ff');
  box(world.truck.box, '#fff');
}
