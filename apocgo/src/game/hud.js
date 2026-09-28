// In-run HUD, drawn on the crisp UI layer in virtual 480x270 coordinates.

import { bar, panel, text } from '../engine/text.js';
import { VIEW_W, VIEW_H, PX_PER_METER, SURVIVAL } from './config.js';

export function drawHud(ui, world, { fps = 0, debug = false } = {}) {
  const t = world.truck;
  const blink = Math.floor(world.time * 4) % 2 === 0;

  // Objectives (top-left)
  panel(ui, 6, 6, 160, 50);
  text(ui, 'ЦЕЛИ:', 11, 8, { size: 10, color: '#d8c9a3' });
  objective(ui, 11, 20, `Радиовышка: ${Math.round(world.distance)}/${world.goalMeters} м`, world.state === 'won');
  objective(ui, 11, 31, `Собрать запчасти (${world.gained.scrap})`, world.gained.scrap >= 10);
  objective(ui, 11, 42, 'Сохранить собаку', world.state === 'won', world.dogStarve > 0);

  // Route progress (top-right)
  panel(ui, VIEW_W - 106, 6, 100, 26);
  text(ui, `${Math.round(world.distance)} м`, VIEW_W - 102, 8, { size: 10 });
  text(ui, `${Math.round((Math.abs(t.speed) / PX_PER_METER) * 3.6)} км/ч`, VIEW_W - 10, 8, { size: 10, align: 'right', color: '#b8ab8c' });
  bar(ui, VIEW_W - 102, 22, 92, 4, world.progress, '#d6a83a');

  // Vitals (bottom-left)
  panel(ui, 6, VIEW_H - 58, 124, 52);
  vital(ui, 10, VIEW_H - 55, 'БРОНЯ', t.hp / t.stats.maxHp, '#c8433a', blink);
  vital(ui, 10, VIEW_H - 43, 'ТОПЛИВО', t.fuel / t.stats.maxFuel, '#d6a83a', blink);
  vital(ui, 10, VIEW_H - 31, 'ВОДИТЕЛЬ', world.satiety / 100, '#6fae4a', blink);
  vital(ui, 10, VIEW_H - 19, 'СОБАКА', world.dogSatiety / 100, '#d9822b', blink);

  // Inventory (bottom-right)
  panel(ui, VIEW_W - 112, VIEW_H - 46, 106, 40);
  text(ui, `Запчасти: ${world.inv.scrap}`, VIEW_W - 107, VIEW_H - 44, { size: 10, color: '#b9c3cc' });
  text(ui, `Еда: ${world.inv.food}`, VIEW_W - 107, VIEW_H - 32, { size: 10, color: '#9fdc6a' });
  text(ui, '[E]', VIEW_W - 12, VIEW_H - 32, { size: 10, align: 'right', color: '#8a7d62' });
  text(ui, `Корм: ${world.inv.dogFood}`, VIEW_W - 107, VIEW_H - 20, { size: 10, color: '#f0a24a' });
  text(ui, '[Q]', VIEW_W - 12, VIEW_H - 20, { size: 10, align: 'right', color: '#8a7d62' });

  // Toasts (top-centre)
  world.toasts.forEach((toast, i) => {
    ui.globalAlpha = Math.min(1, toast.t * 2);
    text(ui, toast.text, VIEW_W / 2, 40 + i * 12, { size: 11, align: 'center', color: toast.color });
    ui.globalAlpha = 1;
  });

  // Critical warnings (centre)
  const warn = [];
  if (world.starve > 0) warn.push(`ВОДИТЕЛЬ ГОЛОДАЕТ ${Math.ceil(SURVIVAL.starveLimit - world.starve)}`);
  if (world.dogStarve > 0) warn.push(`СОБАКА ГОЛОДАЕТ ${Math.ceil(SURVIVAL.starveLimit - world.dogStarve)}`);
  if (world.stall > 0) warn.push('НЕТ ТОПЛИВА');
  if (warn.length && blink) {
    warn.forEach((w, i) => text(ui, w, VIEW_W / 2, VIEW_H / 2 - 30 + i * 14, { size: 14, align: 'center', color: '#ff5a45' }));
  }

  if (debug) {
    text(ui, `FPS ${fps} | ob ${world.obstacles.length} z ${world.zombies.length} pk ${world.pickups.length} | chunk ${world.nextChunk} | seed ${world.seed}`,
      VIEW_W / 2, VIEW_H - 10, { size: 8, align: 'center', color: '#7fffd4' });
  }
}

function objective(ui, x, y, label, done, danger = false) {
  ui.strokeStyle = danger ? '#ff5a45' : '#b8ab8c';
  ui.lineWidth = 0.7;
  ui.strokeRect(x + 0.5, y + 2.5, 6, 6);
  if (done) text(ui, '✓', x + 0.5, y - 1, { size: 10, color: '#9fdc6a', shadow: false });
  text(ui, label, x + 10, y, { size: 9, color: done ? '#8a7d62' : danger ? '#ff8a75' : '#e8dcc0' });
}

function vital(ui, x, y, label, value, color, blink) {
  const low = value < 0.25;
  text(ui, label, x, y - 1, { size: 9, color: low ? '#ff8a75' : '#cbbf9f' });
  bar(ui, x + 44, y + 1, 72, 6, value, color, { flash: low && blink });
}
