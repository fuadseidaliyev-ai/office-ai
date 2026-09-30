// In-run HUD in the style of the concept art, drawn on the crisp UI layer in virtual
// UI_W x UI_H (480x270) coordinates.

import { text } from '../engine/text.js';
import { art } from './art.js';
import { PORTRAIT, PX_PER_METER, UI_W, UI_H } from './config.js';

const PANEL = 'rgba(14,12,10,0.72)';
const BORDER = 'rgba(210,200,180,0.16)';
const INK = '#e9e4d8';

/** Panel positions: the vitals sit in the top-left corner, toasts below them. */
export function hudLayout(touch) {
  return {
    vitalsY: 14,
    toastY: PORTRAIT ? 134 : touch ? 52 : 14,
  };
}

export function drawHud(ui, world, { fps = 0, debug = false, touch = false } = {}) {
  const t = world.truck;
  const blink = Math.floor(world.time * 4) % 2 === 0;
  const layout = hudLayout(touch);

  // final scene: everything but the armour bar flies off, the armour bar moves to the middle
  const fade = world.horde ? Math.min(1, world.horde.age / 0.9) : 0;
  const ease = fade * fade * (3 - 2 * fade);
  if (fade < 1) {
    ui.save();
    ui.globalAlpha = 1 - ease;
    ui.translate(0, -ease * 30);
    drawCompass(ui, world);
    drawVitals(ui, world, blink, layout.vitalsY, fade > 0);
    ui.restore();
  }
  if (world.horde) drawHordeBar(ui, world, ease, layout.vitalsY, blink);
  drawLevelBanner(ui, world);

  // toasts (top-centre)
  world.toasts.forEach((toast, i) => {
    ui.globalAlpha = Math.min(1, toast.t * 2);
    text(ui, toast.text, UI_W / 2, layout.toastY + i * 11, { size: 9, align: 'center', color: toast.color, bold: true });
    ui.globalAlpha = 1;
  });

  // critical warnings (centre)
  const warn = [];
  if (world.satiety <= 0) warn.push('ВОДИТЕЛЬ ГОЛОДЕН · СКОРОСТЬ СНИЖЕНА');
  if (world.dogSatiety <= 0) warn.push('СОБАКА ГОЛОДНА · НЕ СТРЕЛЯЕТ');
  if (warn.length && blink) {
    warn.forEach((w, i) => text(ui, w, UI_W / 2, UI_H / 2 - 40 + i * 13, { size: 12, align: 'center', color: '#ff5a45', bold: true }));
  }

  if (debug) {
    text(ui, `FPS ${fps} | ob ${world.obstacles.length} z ${world.zombies.length} pk ${world.pickups.length} | chunk ${world.nextChunk} | seed ${world.seed} | v ${Math.round(t.speed)}`,
      UI_W / 2, UI_H - 9, { size: 6, align: 'center', color: '#7fffd4' });
  }
}

function panel(ui, x, y, w, h) {
  ui.fillStyle = PANEL;
  roundRect(ui, x, y, w, h, 2.5);
  ui.fill();
  ui.strokeStyle = BORDER;
  ui.lineWidth = 0.5;
  ui.stroke();
}

function roundRect(ui, x, y, w, h, r) {
  ui.beginPath();
  ui.moveTo(x + r, y);
  ui.arcTo(x + w, y, x + w, y + h, r);
  ui.arcTo(x + w, y + h, x, y + h, r);
  ui.arcTo(x, y + h, x, y, r);
  ui.arcTo(x, y, x + w, y, r);
  ui.closePath();
}

// ------------------------------------------------------------ compass + route (top-right)

function drawCompass(ui, world) {
  const cx = UI_W - 26;
  const cy = 25;
  const r = 20;
  ui.fillStyle = 'rgba(14,12,10,0.7)';
  ui.beginPath();
  ui.arc(cx, cy, r, 0, Math.PI * 2);
  ui.fill();
  ui.strokeStyle = 'rgba(210,200,180,0.35)';
  ui.lineWidth = 0.8;
  ui.stroke();
  ui.beginPath();
  ui.arc(cx, cy, r - 5, 0, Math.PI * 2);
  ui.strokeStyle = 'rgba(210,200,180,0.12)';
  ui.stroke();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const inner = i % 4 === 0 ? r - 4 : r - 2.5;
    ui.strokeStyle = 'rgba(210,200,180,0.4)';
    ui.lineWidth = 0.5;
    ui.beginPath();
    ui.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ui.lineTo(cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1));
    ui.stroke();
  }
  text(ui, 'N', cx, cy - r + 1.5, { size: 6, align: 'center', color: INK, bold: true, shadow: false });
  text(ui, 'S', cx, cy + r - 7.5, { size: 6, align: 'center', color: INK, shadow: false });
  text(ui, 'W', cx - r + 2, cy - 3, { size: 6, color: INK, shadow: false });
  text(ui, 'E', cx + r - 2, cy - 3, { size: 6, align: 'right', color: INK, shadow: false });
  // needle follows the truck's heading
  const a = world.truck.tilt - Math.PI / 2;
  ui.fillStyle = INK;
  ui.beginPath();
  ui.moveTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7);
  ui.lineTo(cx + Math.cos(a + 2.5) * 3.5, cy + Math.sin(a + 2.5) * 3.5);
  ui.lineTo(cx + Math.cos(a - 2.5) * 3.5, cy + Math.sin(a - 2.5) * 3.5);
  ui.closePath();
  ui.fill();

  // distance to the tower + speed
  const left = Math.max(0, Math.round(world.goalMeters - world.distance));
  const kmh = Math.round((Math.abs(world.truck.speed) / PX_PER_METER) * 3.6);
  text(ui, `вышка ${left} м`, cx, cy + r + 3, { size: 6, align: 'center', color: INK, bold: true });
  text(ui, `${kmh} км/ч`, cx, cy + r + 10, { size: 5.5, align: 'center', color: '#b8ab8c' });
}

// ------------------------------------------------------------ vitals (top-left)

/** The armour bar alone at the top centre, and the time left to hold out. */
function drawHordeBar(ui, world, ease, vitalsY, blink) {
  const t = world.truck;
  // slides up from its place in the vitals panel and a bit toward the middle (clear of
  // the pause button), growing a little
  const w = 92 + ease * 12;
  const x = 4 + Math.min(12, UI_W / 2 - 18 - w - 4) * ease;
  const y = vitalsY + (4 - vitalsY) * ease;
  const f = Math.max(0, Math.min(1, t.hp / t.stats.maxHp));
  panel(ui, x, y, w, 14);
  iconCross(ui, x + 7, y + 7, '#c8433a');
  ui.fillStyle = 'rgba(0,0,0,0.55)';
  ui.fillRect(x + 14, y + 4, w - 20, 6);
  ui.fillStyle = f < 0.25 && blink ? '#ffffff' : '#c8433a';
  ui.fillRect(x + 14, y + 4, (w - 20) * f, 6);
  ui.fillStyle = 'rgba(255,255,255,0.14)';
  ui.fillRect(x + 14, y + 4, (w - 20) * f, 1.5);
  if (ease > 0.5) {
    const s = Math.ceil(world.horde.t);
    ui.globalAlpha = (ease - 0.5) * 2;
    text(ui, `ОРДА · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, x + w / 2, y + 16, {
      size: 7.5, align: 'center', color: s <= 10 ? '#9fdc6a' : '#ff8a75', bold: true,
    });
    ui.globalAlpha = 1;
  }
}

function drawVitals(ui, world, blink, y, noArmour = false) {
  const t = world.truck;
  const x = 4;
  panel(ui, x, y, 92, 54);
  // the next truck level needs both bars full: energy (kills) and spare parts
  const next = world.nextLvl;
  const rows = [
    noArmour ? null : [iconCross, '#c8433a', t.hp / t.stats.maxHp],
    [iconFork, '#4f9a45', world.satiety / 100],
    [iconPaw, '#d9822b', world.dogSatiety / 100],
    [iconBolt, '#5ec8ff', next ? world.energy / next.energy : 1, next ? `УР ${world.truckLevel}` : 'МАКС'],
    [iconGear, '#c9ced3', next ? world.levelParts / next.parts : 1, next ? `${world.levelParts}/${next.parts}` : ''],
  ];
  rows.forEach((row, i) => {
    if (!row) return;
    const [icon, color, v, label] = row;
    const ry = y + 4 + i * 10;
    icon(ui, x + 7, ry + 3.5, color);
    const f = Math.max(0, Math.min(1, v));
    ui.fillStyle = 'rgba(0,0,0,0.55)';
    ui.fillRect(x + 14, ry + 1, 56, 5);
    ui.fillStyle = f < 0.25 && blink && label === undefined ? '#ffffff' : color;
    ui.fillRect(x + 14, ry + 1, 56 * f, 5);
    ui.fillStyle = 'rgba(255,255,255,0.12)';
    ui.fillRect(x + 14, ry + 1, 56 * f, 1.2);
    if (label !== undefined && label !== '') text(ui, label, x + 88, ry - 0.3, { size: 5.5, align: 'right', color: '#bfe6ff', shadow: false, bold: true });
  });
  text(ui, `Детали в запасе: ${world.inv.scrap}`, x + 2, y - 9, { size: 6.5, color: '#c9ced3', bold: true });
}

function iconGear(ui, x, y, c) {
  ui.fillStyle = c;
  ui.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ui.rect(x + Math.cos(a) * 2.8 - 0.8, y + Math.sin(a) * 2.8 - 0.8, 1.6, 1.6);
  }
  ui.fill();
  ui.beginPath();
  ui.arc(x, y, 2.6, 0, Math.PI * 2);
  ui.fill();
  ui.fillStyle = '#1a1714';
  ui.beginPath();
  ui.arc(x, y, 1, 0, Math.PI * 2);
  ui.fill();
}

function iconBolt(ui, x, y, c) {
  ui.fillStyle = c;
  ui.beginPath();
  ui.moveTo(x + 1, y - 4);
  ui.lineTo(x - 2.5, y + 0.6);
  ui.lineTo(x - 0.2, y + 0.6);
  ui.lineTo(x - 1, y + 4);
  ui.lineTo(x + 2.5, y - 0.8);
  ui.lineTo(x + 0.2, y - 0.8);
  ui.closePath();
  ui.fill();
}

/** "УРОВЕНЬ N" plate (art from the level renders) while the truck upgrades. */
function drawLevelBanner(ui, world) {
  const b = world.levelBanner;
  const img = b && art[`bannerL${b.level}`];
  if (!img) return;
  const w = Math.min(UI_W - 16, 300);
  const h = (img.height / img.width) * w;
  const age = 3 - b.t;
  ui.save();
  ui.globalAlpha = Math.min(1, age * 4, b.t * 2);
  const k = 1 + Math.max(0, 0.25 - age) * 0.8; // pops in
  const y = PORTRAIT ? 64 : 48;
  ui.translate(UI_W / 2, y + h / 2);
  ui.scale(k, k);
  ui.drawImage(img, -w / 2, -h / 2, w, h);
  ui.restore();
}

function iconCross(ui, x, y, c) {
  ui.fillStyle = c;
  ui.fillRect(x - 1.2, y - 3.5, 2.4, 7);
  ui.fillRect(x - 3.5, y - 1.2, 7, 2.4);
}

function iconFork(ui, x, y) {
  ui.strokeStyle = '#d8d2c2';
  ui.lineWidth = 0.8;
  ui.beginPath();
  ui.moveTo(x - 1.8, y - 3.5);
  ui.lineTo(x - 1.8, y + 3.8);
  ui.moveTo(x - 2.8, y - 3.5);
  ui.lineTo(x - 2.8, y - 1);
  ui.moveTo(x - 0.8, y - 3.5);
  ui.lineTo(x - 0.8, y - 1);
  ui.moveTo(x + 2, y - 3.5);
  ui.lineTo(x + 2, y + 3.8);
  ui.stroke();
  ui.fillStyle = '#d8d2c2';
  ui.fillRect(x + 2, y - 3.5, 1.2, 3.5);
}

function iconPaw(ui, x, y, c) {
  ui.fillStyle = c;
  ui.beginPath();
  ui.ellipse(x, y + 1.5, 2.2, 1.8, 0, 0, Math.PI * 2);
  for (const [dx, dy] of [[-2.6, -1.2], [-0.9, -2.8], [0.9, -2.8], [2.6, -1.2]]) {
    ui.moveTo(x + dx + 0.9, y + dy);
    ui.arc(x + dx, y + dy, 0.9, 0, Math.PI * 2);
  }
  ui.fill();
}
