import { text } from '../engine/text.js';
import { UI_W, UI_H, BUFFER_W, BUFFER_H, PORTRAIT } from '../game/config.js';
import { drawWorld } from '../game/view.js';
import { drawWorld3D } from '../game/view3d.js';
import { World } from '../game/world.js';

export class MenuScene {
  constructor(game) {
    this.game = game;
    this.t = 0;
  }

  enter() {
    this.world = new World({ save: this.game.save, seed: 777 });
  }

  relayout() {
    this.world.relayout();
  }

  update(dt) {
    this.t += dt;
    this.world.ambient(dt);
    const input = this.game.input;
    if (input.pressed('view')) this.game.view = this.game.view === 'chase' ? 'top' : 'chase';
    if (input.pressed('garage') || input.tapIn(UI_W / 2 - 80, this.top + 100, 160, 18)) this.game.go('garage');
    else if (input.pressed('confirm')) this.game.go('play');
  }

  render(ctx) {
    if (this.game.view === 'chase') drawWorld3D(ctx, this.world, { hideTruck: true });
    else drawWorld(ctx, this.world, { hideTruck: true });
    ctx.fillStyle = 'rgba(10,6,3,0.45)';
    ctx.fillRect(0, 0, BUFFER_W, BUFFER_H);
  }

  /** Top of the menu block (landscape: as before; portrait: centred in the tall screen). */
  get top() {
    return PORTRAIT ? 110 : 52;
  }

  renderUI(ui) {
    const s = this.game.save;
    const cx = UI_W / 2;
    const y = this.top;
    text(ui, 'ApocGo', cx, y, { size: 48, align: 'center', color: '#e0b25a', bold: true });
    text(ui, 'дорога после конца света', cx, y + 48, { size: 12, align: 'center', color: '#b8ab8c' });

    const pulse = Math.floor(this.t * 2) % 2 === 0;
    text(ui, PORTRAIT ? 'Тап — в путь' : '[Enter] В путь', cx, y + 80, { size: 16, align: 'center', color: pulse ? '#ffffff' : '#d8c9a3' });
    text(ui, PORTRAIT ? 'Гараж — улучшения' : '[G] Гараж — улучшения', cx, y + 100, { size: 12, align: 'center' });

    const help = PORTRAIT
      ? ['Кнопки внизу — руль, газ, тормоз', 'Собака сама стреляет из пулемёта, пока сыта',
        'Детали чинят машину, еда — для водителя,', 'корм — для собаки']
      : ['WASD / стрелки — руль, газ, тормоз    Собака сама стреляет из пулемёта, пока сыта',
        'E — поесть    Q — покормить собаку    P / Esc — пауза    T — экранные кнопки'];
    help.forEach((line, i) => text(ui, line, cx, y + 138 + i * 13, { size: 9, align: 'center', color: i ? '#8a7d62' : '#b8ab8c' }));

    const stats = `Этап ${s.level + 1}   ·   Рекорд: ${s.bestDistance} м   ·   Запчасти: ${s.inventory.scrap}`;
    text(ui, stats, cx, UI_H - 18, { size: PORTRAIT ? 8 : 10, align: 'center', color: '#8a7d62' });
  }
}
