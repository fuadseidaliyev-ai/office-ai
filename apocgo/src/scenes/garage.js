import { bar, panel, text } from '../engine/text.js';
import { UI_W, UI_H, BUFFER_W, BUFFER_H, PORTRAIT, UPGRADES, UPGRADE_KEYS, computeTruckStats, goalMeters, upgradeCost } from '../game/config.js';
import { art } from '../game/art.js';

// Spend scrap on truck upgrades between runs.
export class GarageScene {
  constructor(game) {
    this.game = game;
    this.msg = '';
    this.msgT = 0;
  }

  update(dt) {
    const { input, save } = this.game;
    this.msgT = Math.max(0, this.msgT - dt);
    let tappedRow = false;
    UPGRADE_KEYS.forEach((key, i) => {
      const tapped = input.tapIn(12, 58 + i * 30, rowW(), 26);
      tappedRow ||= tapped;
      if (!input.pressed(`opt${i + 1}`) && !tapped) return;
      const lvl = save.upgrades[key];
      const cost = upgradeCost(key, lvl);
      if (cost === null) return this.say('Уже максимум');
      if (save.inventory.scrap < cost) return this.say('Не хватает запчастей');
      save.inventory.scrap -= cost;
      save.upgrades[key]++;
      this.game.persist();
      this.say(`${UPGRADES[key].name}: уровень ${lvl + 1}`);
    });
    if (tappedRow) return;
    if (input.pressed('confirm')) this.game.go('play');
    else if (input.pressed('back')) this.game.go('menu');
  }

  say(msg) {
    this.msg = msg;
    this.msgT = 2;
  }

  render(ctx) {
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(0, 0, BUFFER_W, BUFFER_H);
    ctx.fillStyle = '#231b15';
    for (let y = 0; y < BUFFER_H; y += 54) ctx.fillRect(0, y, BUFFER_W, 3);
    // truck on the lift, under a work lamp
    // landscape: beside the list; portrait: below it
    const cx = PORTRAIT ? BUFFER_W * 0.5 : BUFFER_W * 0.81;
    const cy = PORTRAIT ? BUFFER_H * 0.8 : BUFFER_H * 0.53;
    const g = ctx.createRadialGradient(cx, cy, 40, cx, cy, 540);
    g.addColorStop(0, 'rgba(255,210,140,0.18)');
    g.addColorStop(1, 'rgba(255,210,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 540, cy - 540, 1080, 1080);
    const img = art.truck;
    const k = 1.5;
    if (img) ctx.drawImage(img, cx - (img.width * k) / 2, cy - (img.height * k) / 2, img.width * k, img.height * k);
  }

  renderUI(ui) {
    const { save } = this.game;
    text(ui, 'ГАРАЖ', 16, 10, { size: 24, color: '#e0b25a' });
    text(ui, `Детали: ${save.inventory.scrap}`, 16, 38, { size: 11, color: '#b9c3cc' });

    UPGRADE_KEYS.forEach((key, i) => {
      const y = 58 + i * 30;
      const u = UPGRADES[key];
      const lvl = save.upgrades[key];
      const cost = upgradeCost(key, lvl);
      const affordable = cost !== null && save.inventory.scrap >= cost;
      const w = rowW();
      panel(ui, 12, y, w, 26);
      text(ui, PORTRAIT ? u.name : `[${i + 1}] ${u.name}`, 18, y + 2, { size: 12, color: affordable ? '#ffffff' : '#cbbf9f' });
      text(ui, u.desc, 18, y + 14, { size: 9, color: '#8a7d62' });
      bar(ui, 12 + w * 0.46, y + 5, w * 0.3, 5, lvl / u.costs.length, '#d6a83a');
      text(ui, cost === null ? 'MAX' : `${cost} дет.`, 12 + w - 8, y + 7, {
        size: 11, align: 'right', color: cost === null ? '#9fdc6a' : affordable ? '#e0b25a' : '#7a5a4a',
      });
    });

    const s = computeTruckStats(save.upgrades);
    const statsY = 58 + UPGRADE_KEYS.length * 30 + 8;
    const statLines = PORTRAIT
      ? [`Скорость ${s.maxSpeed}  Разгон ${s.accel}  Руль ${s.handling}`, `Броня ${s.maxHp}  Таран ×${s.ram.toFixed(2)}`]
      : [`Скорость ${s.maxSpeed}  Разгон ${s.accel}  Руль ${s.handling}  Броня ${s.maxHp}  Таран ×${s.ram.toFixed(2)}`];
    statLines.forEach((l, i) => text(ui, l, 16, statsY + i * 12, { size: 9, color: '#b8ab8c' }));
    const nextY = statsY + statLines.length * 12 + 2;
    text(ui, `Следующий рейс: этап ${save.level + 1}, вышка через ${goalMeters(save.level)} м`, 16, nextY, { size: PORTRAIT ? 9 : 10 });
    text(ui, PORTRAIT ? 'Тап по строке — купить, тап ниже — в путь' : '[Enter] В путь    [Esc] Меню    (на телефоне: тап по строке — купить, тап вне — в путь)',
      16, UI_H - 18, { size: 9, color: '#d8c9a3' });
    if (this.msgT > 0) text(ui, this.msg, PORTRAIT ? UI_W / 2 : 390, PORTRAIT ? nextY + 22 : 230, { size: 12, align: 'center', color: '#ffcf4a' });
  }
}

/** Width of an upgrade row: fits the narrow portrait screen. */
function rowW() {
  return Math.min(300, UI_W - 24);
}
