import { text } from '../engine/text.js';
import { VIEW_W, VIEW_H } from '../game/config.js';
import { drawWorld } from '../game/view.js';
import { World } from '../game/world.js';

export class MenuScene {
  constructor(game) {
    this.game = game;
    this.t = 0;
  }

  enter() {
    this.world = new World({ save: this.game.save, seed: 777 });
  }

  update(dt) {
    this.t += dt;
    this.world.ambient(dt);
    const input = this.game.input;
    if (input.pressed('confirm')) this.game.go('play');
    else if (input.pressed('garage')) this.game.go('garage');
  }

  render(ctx) {
    drawWorld(ctx, this.world, { hideTruck: true });
    ctx.fillStyle = 'rgba(10,6,3,0.45)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  renderUI(ui) {
    const s = this.game.save;
    text(ui, 'ApocGo', VIEW_W / 2, 52, { size: 48, align: 'center', color: '#e0b25a', bold: true });
    text(ui, 'дорога после конца света', VIEW_W / 2, 100, { size: 12, align: 'center', color: '#b8ab8c' });

    const pulse = Math.floor(this.t * 2) % 2 === 0;
    text(ui, '[Enter] В путь', VIEW_W / 2, 132, { size: 16, align: 'center', color: pulse ? '#ffffff' : '#d8c9a3' });
    text(ui, '[G] Гараж — улучшения', VIEW_W / 2, 152, { size: 12, align: 'center' });

    text(ui, 'WASD / стрелки — руль, газ, тормоз   E — поесть   Q — покормить собаку', VIEW_W / 2, 196, { size: 9, align: 'center', color: '#b8ab8c' });
    text(ui, 'P / Esc — пауза   F3 — отладка', VIEW_W / 2, 208, { size: 9, align: 'center', color: '#8a7d62' });

    text(ui, `Этап ${s.level + 1}   ·   Рекорд: ${s.bestDistance} м   ·   Запчасти: ${s.inventory.scrap}`, VIEW_W / 2, VIEW_H - 18, { size: 10, align: 'center', color: '#8a7d62' });
  }
}
