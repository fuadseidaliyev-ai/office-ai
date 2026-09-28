import { panel, text } from '../engine/text.js';
import { UI_W, UI_H, VIEW_W, VIEW_H } from '../game/config.js';

// Summary after a run: why it ended and what was brought back.
export class ResultScene {
  constructor(game, result) {
    this.game = game;
    this.r = result;
  }

  update() {
    const { input } = this.game;
    if (input.pressed('confirm')) this.game.go('garage');
    else if (input.pressed('back')) this.game.go('menu');
  }

  render(ctx) {
    ctx.fillStyle = this.r.won ? '#1a1a10' : '#1a0e0b';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  renderUI(ui) {
    const r = this.r;
    const cx = UI_W / 2;
    text(ui, r.won ? 'ДОБРАЛИСЬ' : 'КОНЕЦ ПУТИ', cx, 30, { size: 30, align: 'center', color: r.won ? '#9fdc6a' : '#c8433a' });
    text(ui, r.reason, cx, 66, { size: 13, align: 'center', color: '#d8c9a3' });

    panel(ui, cx - 130, 90, 260, 108);
    const rows = [
      ['Пройдено', `${r.distance} / ${r.goal} м`],
      ['Зомби сбито', r.kills],
      ['Найдено запчастей', r.gained.scrap],
      [r.won ? 'Привезено запчастей' : 'Спасено (½)', r.keptScrap],
      ['Еда / корм найдено', `${r.gained.food} / ${r.gained.dogFood}`],
      ['Топливо подобрано', r.gained.fuel],
    ];
    rows.forEach(([k, v], i) => {
      text(ui, k, cx - 120, 96 + i * 16, { size: 11, color: '#b8ab8c' });
      text(ui, String(v), cx + 120, 96 + i * 16, { size: 11, align: 'right' });
    });

    text(ui, '[Enter] В гараж    [Esc] Меню', cx, UI_H - 40, { size: 12, align: 'center', color: '#e0b25a' });
  }
}
