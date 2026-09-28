import { panel, text } from '../engine/text.js';
import { UI_W, UI_H, VIEW_W, VIEW_H } from '../game/config.js';
import { drawHud, vitalsRows } from '../game/hud.js';
import { drawTouchButtons, touchButtons } from '../game/touchpad.js';
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
    this.applyTouchUI();
  }

  exit() {
    this.game.input.setButtons([]);
  }

  /** Show / hide the on-screen driving buttons (auto on touch devices, T toggles). */
  applyTouchUI() {
    this.buttons = this.game.touchUI ? touchButtons() : [];
    this.game.input.setButtons(this.buttons);
  }

  update(dt) {
    const { input } = this.game;
    if (input.pressed('debug')) this.game.debug = !this.game.debug;
    if (input.pressed('touchUI')) {
      this.game.touchUI = !this.game.touchUI;
      this.applyTouchUI();
    }

    if (this.paused) {
      if (input.pressed('garage') || input.tapIn(UI_W / 2 - 90, UI_H / 2 + 10, 180, 18)) this.finish(); // abandon run
      else if (input.pressed('pause') || input.pressed('confirm')) this.paused = false;
      return;
    }
    if (input.pressed('pause')) {
      this.paused = true;
      return;
    }

    // touch: tapping the food / dog rows of the HUD eats / feeds
    const rows = vitalsRows(this.game.touchUI);
    if (input.tapIn(...rows.food)) this.world.eat();
    if (input.tapIn(...rows.dogFood)) this.world.feedDog();
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
    drawHud(ui, this.world, { fps: this.game.loop.fps, debug: this.game.debug, touch: this.game.touchUI });
    drawTouchButtons(ui, this.buttons, this.game.input);
    if (this.paused) {
      ui.fillStyle = 'rgba(0,0,0,0.55)';
      ui.fillRect(0, 0, UI_W, UI_H);
      panel(ui, UI_W / 2 - 90, UI_H / 2 - 36, 180, 72);
      text(ui, 'ПАУЗА', UI_W / 2, UI_H / 2 - 30, { size: 20, align: 'center', color: '#e0b25a' });
      text(ui, this.game.touchUI ? 'тап — продолжить' : '[P] продолжить', UI_W / 2, UI_H / 2 - 2, { size: 11, align: 'center' });
      text(ui, this.game.touchUI ? 'прервать рейс' : '[G] прервать рейс', UI_W / 2, UI_H / 2 + 14, { size: 11, align: 'center', color: '#c9745a' });
    }
  }
}
