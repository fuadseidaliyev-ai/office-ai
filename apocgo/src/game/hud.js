// In-run HUD in the style of the concept art, drawn on the crisp UI layer in virtual
// UI_W x UI_H (480x270) coordinates.

import { text } from '../engine/text.js';
import { art } from './art.js';
import { PX_PER_METER, UI_W, UI_H } from './config.js';

const PANEL = 'rgba(14,12,10,0.72)';
const BORDER = 'rgba(210,200,180,0.16)';
const INK = '#e9e4d8';

/**
 * Panel positions. With on-screen driving buttons (`touch`) the vitals and weapon
 * panels move up under the objectives / compass so the bottom corners are free.
 */
export function hudLayout(touch) {
  return {
    vitalsY: touch ? 56 : UI_H - 38,
    weaponY: touch ? 68 : UI_H - 30,
    toastY: touch ? 28 : 14,
  };
}

/** Rects of the tappable food / dog-food rows (UI coords). */
export function vitalsRows(touch) {
  const { vitalsY } = hudLayout(touch);
  return { food: [4, vitalsY + 12, 92, 10], dogFood: [4, vitalsY + 22, 92, 10] };
}

export function drawHud(ui, world, { fps = 0, debug = false, touch = false } = {}) {
  const t = world.truck;
  const blink = Math.floor(world.time * 4) % 2 === 0;
  const layout = hudLayout(touch);

  drawObjectives(ui, world);
  drawCompass(ui, world);
  drawVitals(ui, world, blink, layout.vitalsY);
  drawWeapon(ui, world, layout.weaponY);

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

// ------------------------------------------------------------ objectives (top-left)

function drawObjectives(ui, world) {
  const rows = [
    ['Доехать до радиовышки', world.state === 'won'],
    [`Собрать детали (${Math.min(10, world.gained.scrap)}/10)`, world.gained.scrap >= 10],
    ['Не разбить машину', world.state === 'won', world.truck.hp < world.truck.stats.maxHp * 0.35],
  ];
  panel(ui, 4, 4, 92, 38);
  text(ui, 'ЦЕЛИ:', 8, 6, { size: 6.5, color: INK, bold: true, shadow: false });
  rows.forEach(([label, done, danger], i) => {
    const y = 15 + i * 8.5;
    ui.strokeStyle = danger ? '#ff5a45' : 'rgba(233,228,216,0.75)';
    ui.lineWidth = 0.6;
    ui.strokeRect(8.5, y + 0.8, 5, 5);
    if (done) {
      ui.strokeStyle = '#9fdc6a';
      ui.lineWidth = 1;
      ui.beginPath();
      ui.moveTo(9.3, y + 3.3);
      ui.lineTo(10.8, y + 5);
      ui.lineTo(13.6, y + 1.2);
      ui.stroke();
    }
    text(ui, label, 17, y, { size: 6.2, color: done ? '#8a8474' : danger ? '#ff8a75' : INK, shadow: false });
  });
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

// ------------------------------------------------------------ vitals (bottom-left)

function drawVitals(ui, world, blink, y) {
  const t = world.truck;
  const x = 4;
  panel(ui, x, y, 92, 34);
  const rows = [
    [iconCross, '#c8433a', t.hp / t.stats.maxHp],
    [iconFork, '#4f9a45', world.satiety / 100, world.inv.food, 'E'],
    [iconPaw, '#d9822b', world.dogSatiety / 100, world.inv.dogFood, 'Q'],
  ];
  rows.forEach(([icon, color, v, count, key], i) => {
    const ry = y + 4 + i * 10;
    icon(ui, x + 7, ry + 3.5, color);
    const f = Math.max(0, Math.min(1, v));
    ui.fillStyle = 'rgba(0,0,0,0.55)';
    ui.fillRect(x + 14, ry + 1, 56, 5);
    ui.fillStyle = f < 0.25 && blink ? '#ffffff' : color;
    ui.fillRect(x + 14, ry + 1, 56 * f, 5);
    ui.fillStyle = 'rgba(255,255,255,0.12)';
    ui.fillRect(x + 14, ry + 1, 56 * f, 1.2);
    if (count !== undefined) {
      text(ui, `${count}`, x + 76, ry - 0.5, { size: 6, color: INK, shadow: false, bold: true });
      text(ui, key, x + 88, ry, { size: 5, align: 'right', color: '#8a8474', shadow: false });
    }
  });
  text(ui, `Детали в запасе: ${world.inv.scrap}`, x + 2, y - 9, { size: 6.5, color: '#c9ced3', bold: true });
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

// ------------------------------------------------------------ shotgun (bottom-right)

/** The dog's shotgun: unlimited shells, but only while the dog is fed. */
function drawWeapon(ui, world, y) {
  const w = 64;
  const h = 26;
  const x = UI_W - w - 4;
  const fed = world.dogCanShoot;
  panel(ui, x, y, w, h);
  if (art.shotgun) {
    const s = (w - 8) / art.shotgun.width;
    ui.globalAlpha = fed ? 1 : 0.35;
    ui.drawImage(art.shotgun, x + 4, y + 3, art.shotgun.width * s, art.shotgun.height * s);
    ui.globalAlpha = 1;
  }
  iconPaw(ui, x + 8, y + 18, fed ? '#d9822b' : '#7a5a4a');
  text(ui, fed ? 'стреляет' : 'голодна', x + 14, y + 14.5, { size: 6, color: fed ? '#cbbf9f' : '#ff8a75', shadow: false, bold: !fed });
  text(ui, '∞', x + w - 4, y + 11, { size: 11, align: 'right', color: fed ? INK : '#7a5a4a', bold: true, shadow: false });
}
