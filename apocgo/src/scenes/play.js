import { panel, text } from '../engine/text.js';
import { VIEW_W, VIEW_H } from '../game/config.js';
import { drawHud } from '../game/hud.js';
import { drawWorld } from '../game/view.js';
import { World } from '../game/world.js';

const END_DELAY = 1.6; // seconds to watch the crash / arrival before the results screen

export class PlayScene {
  constructor(game) {
    this.game = game;
  }

  enter() {
    this.world = new World({ save: this.game.save });
    this.paused = false;
    this.endTimer = 0;
  }

  update(dt) {
    const { input } = this.game;
    if (input.pressed('debug')) this.game.debug = !this.game.debug;

    if (this.paused) {
      if (input.pressed('pause') || input.pressed('confirm')) this.paused = false;
      else if (input.pressed('garage')) this.finish(); // abandon run
      return;
    }
    if (input.pressed('pause')) {
      this.paused = true;
      return;
    }

    this.world.update(dt, input);
    if (this.world.state !== 'running') {
      this.endTimer += dt;
      if (this.endTimer > END_DELAY) this.finish();
    }
  }

  finish() {
    if (this.world.state === 'running') this.world.end('lost', 'Рейс прерван');
    const result = this.world.applyResult(this.game.save);
    this.game.persist();
    this.game.go('result', result);
  }

  render(ctx) {
    drawWorld(ctx, this.world, { debug: this.game.debug });
  }

  renderUI(ui) {
    drawHud(ui, this.world, { fps: this.game.loop.fps, debug: this.game.debug });
    if (this.paused) {
      ui.fillStyle = 'rgba(0,0,0,0.55)';
      ui.fillRect(0, 0, VIEW_W, VIEW_H);
      panel(ui, VIEW_W / 2 - 90, VIEW_H / 2 - 36, 180, 72);
      text(ui, 'ПАУЗА', VIEW_W / 2, VIEW_H / 2 - 30, { size: 20, align: 'center', color: '#e0b25a' });
      text(ui, '[P] продолжить', VIEW_W / 2, VIEW_H / 2 - 2, { size: 11, align: 'center' });
      text(ui, '[G] прервать рейс', VIEW_W / 2, VIEW_H / 2 + 14, { size: 11, align: 'center', color: '#c9745a' });
    }
  }
}
