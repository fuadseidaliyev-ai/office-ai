// Fixed-timestep game loop: simulation runs at a constant rate regardless of the
// display refresh rate, rendering happens once per animation frame.

export class GameLoop {
  constructor({ update, render, step = 1 / 60, maxFrame = 0.25 }) {
    this.update = update;
    this.render = render;
    this.step = step;
    this.maxFrame = maxFrame;
    this.acc = 0;
    this.last = 0;
    this.running = false;
    this.fps = 0;
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    this._frame = this._frame.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._frame);
  }

  stop() {
    this.running = false;
  }

  _frame(now) {
    if (!this.running) return;
    // Clamp long pauses (tab switch) so we don't simulate a huge catch-up burst.
    const frame = Math.min((now - this.last) / 1000, this.maxFrame);
    this.last = now;
    this.acc += frame;

    while (this.acc >= this.step) {
      this.update(this.step);
      this.acc -= this.step;
    }
    this.render(this.acc / this.step);

    this._fpsAcc += frame;
    this._fpsFrames++;
    if (this._fpsAcc >= 0.5) {
      this.fps = Math.round(this._fpsFrames / this._fpsAcc);
      this._fpsAcc = 0;
      this._fpsFrames = 0;
    }
    requestAnimationFrame(this._frame);
  }
}
