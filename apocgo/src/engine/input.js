// Action-based input. Game code asks about actions ("left", "gas"), never raw keys,
// so rebinding or adding a gamepad later only touches this file.

export const DEFAULT_BINDINGS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  gas: ['ArrowUp', 'KeyW'],
  brake: ['ArrowDown', 'KeyS'],
  eat: ['KeyE'],
  shoot: ['Space', 'KeyF'],
  reload: ['KeyR'],
  feedDog: ['KeyQ'],
  confirm: ['Enter'],
  back: ['Escape', 'Backspace'],
  pause: ['KeyP', 'Escape'],
  garage: ['KeyG'],
  debug: ['F3'],
  opt1: ['Digit1', 'Numpad1'],
  opt2: ['Digit2', 'Numpad2'],
  opt3: ['Digit3', 'Numpad3'],
  opt4: ['Digit4', 'Numpad4'],
  opt5: ['Digit5', 'Numpad5'],
};

export class Input {
  constructor(target, { bindings = DEFAULT_BINDINGS, width, height } = {}) {
    this.bindings = bindings;
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.touches = new Map(); // pointerId -> { x, y } in virtual coords
    this.touchTapped = false;
    this.touchShot = false;
    this.tap = null; // {x, y} of a touch/click that started this step (virtual coords)
    this.virtualW = width;
    this.virtualH = height;
    this._canvas = null;

    target.addEventListener('keydown', (e) => {
      if (this._isBound(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('blur', () => this.keys.clear());
  }

  /** Enable simple touch controls on the canvas: left/right thirds steer, any touch = gas. */
  attachTouch(canvas) {
    this._canvas = canvas;
    const toVirtual = (e) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width) * this.virtualW,
        y: ((e.clientY - r.top) / r.height) * this.virtualH,
      };
    };
    canvas.addEventListener('pointerdown', (e) => {
      const p = toVirtual(e);
      this.tap = p;
      if (e.pointerType === 'mouse') {
        // clicks confirm in menus and fire the shotgun in a run, but don't drive
        this.touchTapped = true;
        this.touchShot = true;
        return;
      }
      canvas.setPointerCapture?.(e.pointerId);
      this.touches.set(e.pointerId, p);
      this.touchTapped = true;
      // tapping the middle third fires the shotgun
      if (p.x > this.virtualW / 3 && p.x < (this.virtualW * 2) / 3) this.touchShot = true;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, toVirtual(e));
    });
    const end = (e) => this.touches.delete(e.pointerId);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  _isBound(code) {
    for (const codes of Object.values(this.bindings)) if (codes.includes(code)) return true;
    return false;
  }

  _touchAction(action) {
    if (this.touches.size === 0) return false;
    if (action === 'gas') return true;
    for (const t of this.touches.values()) {
      if (action === 'left' && t.x < this.virtualW / 3) return true;
      if (action === 'right' && t.x > (this.virtualW * 2) / 3) return true;
    }
    return false;
  }

  /** Held this step. */
  down(action) {
    const codes = this.bindings[action] || [];
    for (const c of codes) if (this.keys.has(c)) return true;
    return this._touchAction(action);
  }

  /** Went down since the last simulation step. */
  pressed(action) {
    const codes = this.bindings[action] || [];
    for (const c of codes) if (this.pressedKeys.has(c)) return true;
    return (action === 'confirm' && this.touchTapped) || (action === 'shoot' && this.touchShot);
  }

  /** Did a tap/click this step land inside the rectangle (virtual coords)? */
  tapIn(x, y, w, h) {
    const t = this.tap;
    return !!t && t.x >= x && t.x <= x + w && t.y >= y && t.y <= y + h;
  }

  /** -1..1 from two opposing actions. */
  axis(neg, pos) {
    return (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0);
  }

  /** Call once after every simulation step. */
  endStep() {
    this.pressedKeys.clear();
    this.touchTapped = false;
    this.touchShot = false;
    this.tap = null;
  }
}
