// Two-layer renderer:
//  * `ctx`  — a fixed-size buffer for the world (the camera's view in world units).
//  * `ui`   — the full-resolution display canvas, pre-scaled so UI code works in its own
//             small virtual resolution (uiW x uiH) while text stays crisp.

export class Renderer {
  constructor(canvas, width, height, uiW = width, uiH = height) {
    this.W = width;
    this.H = height;
    this.uiW = uiW;
    this.uiH = uiH;
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
    this.uiScale = this.display.width / this.uiW;
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
    // painterly art: smooth when the buffer is scaled down, crisp when scaled up
    d.imageSmoothingEnabled = this.scale < 1;
    d.imageSmoothingQuality = 'high';
    d.drawImage(this.buffer, 0, 0, this.display.width, this.display.height);
    d.setTransform(this.uiScale, 0, 0, this.uiScale, 0, 0);
    d.imageSmoothingEnabled = true;
  }

  get ui() {
    return this.dctx;
  }
}
