import { text } from '../engine/text.js';
import { UI_W, UI_H, BUFFER_W, BUFFER_H } from '../game/config.js';
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
    if (input.pressed('garage') || input.tapIn(UI_W / 2 - 80, 150, 160, 18)) this.game.go('garage');
    else if (input.pressed('confirm')) this.game.go('play');
  }

  render(ctx) {
    drawWorld(ctx, this.world, { hideTruck: true });
    ctx.fillStyle = 'rgba(10,6,3,0.45)';
    ctx.fillRect(0, 0, BUFFER_W, BUFFER_H);
  }

  renderUI(ui) {
    const s = this.game.save;
    text(ui, 'ApocGo', UI_W / 2, 52, { size: 48, align: 'center', color: '#e0b25a', bold: true });
    text(ui, 'дорога после конца света', UI_W / 2, 100, { size: 12, align: 'center', color: '#b8ab8c' });

    const pulse = Math.floor(this.t * 2) % 2 === 0;
    text(ui, '[Enter] В путь', UI_W / 2, 132, { size: 16, align: 'center', color: pulse ? '#ffffff' : '#d8c9a3' });
    text(ui, '[G] Гараж — улучшения', UI_W / 2, 152, { size: 12, align: 'center' });

    text(ui, 'WASD / стрелки — руль, газ, тормоз    Собака сама стреляет из пулемёта, пока сыта', UI_W / 2, 190, { size: 9, align: 'center', color: '#b8ab8c' });
    text(ui, 'E — поесть    Q — покормить собаку    P / Esc — пауза    T — экранные кнопки', UI_W / 2, 203, { size: 9, align: 'center', color: '#8a7d62' });

    text(ui, `Этап ${s.level + 1}   ·   Рекорд: ${s.bestDistance} м   ·   Запчасти: ${s.inventory.scrap}`, UI_W / 2, UI_H - 18, { size: 10, align: 'center', color: '#8a7d62' });
  }
}
