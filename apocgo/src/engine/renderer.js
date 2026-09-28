// Two-layer renderer:
//  * `ctx`  — a low-resolution buffer (e.g. 480x270) for the pixel-art world.
//  * `ui`   — the full-resolution display canvas, pre-scaled so UI code also works in
//             virtual coordinates but text stays crisp.

export class Renderer {
  constructor(canvas, width, height) {
    this.W = width;
    this.H = height;
    this.display = canvas;
    this.dctx = canvas.getContext('2d');

    this.buffer = document.createElement('canvas');
    this.buffer.width = width;
    this.buffer.height = height;
    this.ctx = this.buffer.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.scale = 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const s = Math.min(window.innerWidth / this.W, window.innerHeight / this.H);
    const cssW = Math.floor(this.W * s);
    const cssH = Math.floor(this.H * s);
    this.display.style.width = `${cssW}px`;
    this.display.style.height = `${cssH}px`;
    this.display.width = Math.round(cssW * dpr);
    this.display.height = Math.round(cssH * dpr);
    this.scale = this.display.width / this.W;
  }

  beginFrame() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.fillStyle = '#000';
    c.fillRect(0, 0, this.W, this.H);
  }

  /** Blit the world buffer to the screen and prepare the UI layer. */
  present() {
    const d = this.dctx;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.imageSmoothingEnabled = false;
    d.drawImage(this.buffer, 0, 0, this.display.width, this.display.height);
    d.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    d.imageSmoothingEnabled = true;
  }

  get ui() {
    return this.dctx;
  }
}
