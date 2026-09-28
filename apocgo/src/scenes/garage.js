import { bar, panel, text } from '../engine/text.js';
import { UI_W, UI_H, VIEW_W, VIEW_H, UPGRADES, UPGRADE_KEYS, computeTruckStats, goalMeters, upgradeCost } from '../game/config.js';
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
      const tapped = input.tapIn(12, 58 + i * 30, 300, 26);
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
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#231b15';
    for (let y = 0; y < VIEW_H; y += 54) ctx.fillRect(0, y, VIEW_W, 3);
    // truck on the lift, under a work lamp
    const cx = 1300;
    const cy = 480;
    const g = ctx.createRadialGradient(cx, cy, 40, cx, cy, 420);
    g.addColorStop(0, 'rgba(255,210,140,0.18)');
    g.addColorStop(1, 'rgba(255,210,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 420, cy - 420, 840, 840);
    const img = art.truck;
    if (img) ctx.drawImage(img, cx - img.width * 0.75, cy - img.height * 0.75, img.width * 1.5, img.height * 1.5);
  }

  renderUI(ui) {
    const { save } = this.game;
    text(ui, 'ГАРАЖ', 16, 10, { size: 24, color: '#e0b25a' });
    text(ui, `Запчасти: ${save.inventory.scrap}    Еда: ${save.inventory.food}    Корм: ${save.inventory.dogFood}`, 16, 38, { size: 11, color: '#b9c3cc' });

    UPGRADE_KEYS.forEach((key, i) => {
      const y = 58 + i * 30;
      const u = UPGRADES[key];
      const lvl = save.upgrades[key];
      const cost = upgradeCost(key, lvl);
      const affordable = cost !== null && save.inventory.scrap >= cost;
      panel(ui, 12, y, 300, 26);
      text(ui, `[${i + 1}] ${u.name}`, 18, y + 2, { size: 12, color: affordable ? '#ffffff' : '#cbbf9f' });
      text(ui, u.desc, 18, y + 14, { size: 9, color: '#8a7d62' });
      bar(ui, 150, y + 5, 90, 5, lvl / u.costs.length, '#d6a83a');
      text(ui, cost === null ? 'MAX' : `${cost} зап.`, 304, y + 7, {
        size: 11, align: 'right', color: cost === null ? '#9fdc6a' : affordable ? '#e0b25a' : '#7a5a4a',
      });
    });

    const s = computeTruckStats(save.upgrades);
    const statsY = 214;
    text(ui, `Скорость ${s.maxSpeed}  Разгон ${s.accel}  Руль ${s.handling}  Броня ${s.maxHp}  Бак ${s.maxFuel}  Таран ×${s.ram.toFixed(2)}`, 16, statsY, { size: 9, color: '#b8ab8c' });
    text(ui, `Следующий рейс: этап ${save.level + 1}, радиовышка через ${goalMeters(save.level)} м`, 16, statsY + 14, { size: 10 });
    text(ui, '[Enter] В путь    [Esc] Меню    (на телефоне: тап по строке — купить, тап вне — в путь)', 16, UI_H - 18, { size: 9, color: '#d8c9a3' });
    if (this.msgT > 0) text(ui, this.msg, 390, 230, { size: 12, align: 'center', color: '#ffcf4a' });
  }
}
