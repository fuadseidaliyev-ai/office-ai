import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../src/engine/input.js';

// Minimal canvas stand-in: an EventTarget with a 480x270 on-screen box.
function fakeCanvas() {
  const c = new EventTarget();
  c.getBoundingClientRect = () => ({ left: 0, top: 0, width: 480, height: 270 });
  c.setPointerCapture = () => {};
  return c;
}

function pointer(canvas, type, id, x, y, pointerType = 'touch') {
  const e = new Event(type);
  Object.assign(e, { pointerId: id, clientX: x, clientY: y, pointerType });
  canvas.dispatchEvent(e);
}

function setup() {
  const input = new Input(new EventTarget(), { width: 480, height: 270 });
  const canvas = fakeCanvas();
  input.attachTouch(canvas);
  input.setButtons([
    { action: 'left', x: 0, y: 200, w: 50, h: 50 },
    { action: 'gas', x: 400, y: 180, w: 60, h: 80 },
    { action: 'shoot', x: 330, y: 150, w: 50, h: 50 },
  ]);
  return { input, canvas };
}

test('on-screen buttons: multi-touch hold, slide off releases, taps elsewhere do not drive', () => {
  const { input, canvas } = setup();
  pointer(canvas, 'pointerdown', 1, 20, 220); // left
  pointer(canvas, 'pointerdown', 2, 430, 220); // gas
  assert.ok(input.down('left') && input.down('gas'));
  assert.ok(!input.down('right') && !input.down('brake'));

  pointer(canvas, 'pointermove', 1, 200, 220); // slid off the button
  assert.ok(!input.down('left'));
  pointer(canvas, 'pointerup', 2, 430, 220);
  assert.ok(!input.down('gas'));

  pointer(canvas, 'pointerdown', 3, 240, 100); // empty screen area
  assert.ok(!input.down('gas'), 'with buttons set, a stray touch is not gas');
  assert.ok(!input.pressed('shoot'));
});

test('one-shot buttons fire once per press', () => {
  const { input, canvas } = setup();
  pointer(canvas, 'pointerdown', 1, 350, 170);
  assert.ok(input.pressed('shoot'));
  input.endStep();
  assert.ok(!input.pressed('shoot'));
});

test('without buttons the legacy zone controls still work', () => {
  const { input, canvas } = setup();
  input.setButtons([]);
  pointer(canvas, 'pointerdown', 1, 20, 100);
  assert.ok(input.down('gas') && input.down('left'));
});
