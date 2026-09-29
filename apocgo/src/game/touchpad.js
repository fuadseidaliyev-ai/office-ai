// On-screen driving controls: ◀ ▶ steering on the left, GAS / BRAKE pedals on the
// right, plus pause (the dog does the shooting). Rects are in UI coordinates (UI_W x UI_H); Input turns
// fingers on them into the same actions the keyboard produces.

import { text } from '../engine/text.js';
import { art } from './art.js';
import { PORTRAIT, UI_W, UI_H } from './config.js';

export function touchButtons() {
  return [
    // sizes follow the button art's proportions (assets/btn*.png)
    // steering sits higher than the pedals (easier for the thumb in portrait)
    { action: 'left', label: '', icon: 'left', art: 'btnLeft', x: 6, y: UI_H - steerLift() - 60, w: 52, h: 54 },
    { action: 'right', label: '', icon: 'right', art: 'btnRight', x: 62, y: UI_H - steerLift() - 60, w: 52, h: 54 },
    { action: 'gas', label: 'ГАЗ', icon: 'gas', art: 'btnGas', x: UI_W - 52, y: UI_H - 109, w: 46, h: 103 },
    { action: 'brake', label: 'ТОРМОЗ', icon: 'brake', art: 'btnBrake', x: UI_W - 100, y: UI_H - 92, w: 44, h: 86 },
    { action: 'pause', label: '', icon: 'pause', x: UI_W / 2 - 14, y: 4, w: 28, h: 18 },
  ];
}

function steerLift() {
  return PORTRAIT ? 64 : 30;
}

/** Is this a touch-first device (phone / tablet)? */
export function isTouchDevice() {
  try {
    return navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

const ACCENT = {
  gas: '#6fae4a',
  brake: '#c8433a',
  shoot: '#e0b25a',
};

export function drawTouchButtons(ui, buttons, input) {
  for (const b of buttons) {
    const held = input.isButtonHeld(b) || input.down(b.action);
    const img = b.art && art[b.art];
    if (img) {
      // rusty metal buttons: pressed = pushed in a little and lit up
      const k = held ? 0.94 : 1;
      const w = b.w * k;
      const h = b.h * k;
      ui.save();
      ui.globalAlpha = held ? 1 : 0.88;
      ui.drawImage(img, b.x + (b.w - w) / 2, b.y + (b.h - h) / 2, w, h);
      if (held) {
        ui.globalCompositeOperation = 'lighter';
        ui.globalAlpha = 0.18;
        ui.drawImage(img, b.x + (b.w - w) / 2, b.y + (b.h - h) / 2, w, h);
      }
      ui.restore();
      continue;
    }
    const accent = ACCENT[b.action] || '#e9e4d8';
    ui.save();
    ui.globalAlpha = held ? 0.95 : 0.6;
    ui.fillStyle = held ? 'rgba(60,48,34,0.85)' : 'rgba(14,12,10,0.6)';
    roundRect(ui, b.x, b.y, b.w, b.h, 6);
    ui.fill();
    ui.lineWidth = held ? 1.4 : 0.8;
    ui.strokeStyle = held ? accent : 'rgba(233,228,216,0.35)';
    ui.stroke();
    ui.globalAlpha = held ? 1 : 0.85;
    drawIcon(ui, b, held ? accent : '#e9e4d8');
    if (b.label) {
      text(ui, b.label, b.x + b.w / 2, b.y + b.h - 11, {
        size: 6.5, align: 'center', color: held ? accent : '#cfc8b6', bold: true, shadow: false,
      });
    }
    ui.restore();
  }
}

function drawIcon(ui, b, color) {
  const cx = b.x + b.w / 2;
  const cy = b.y + (b.label ? b.h / 2 - 4 : b.h / 2);
  ui.fillStyle = color;
  ui.strokeStyle = color;
  ui.beginPath();
  switch (b.icon) {
    case 'left':
      ui.moveTo(cx - 11, cy);
      ui.lineTo(cx + 8, cy - 12);
      ui.lineTo(cx + 8, cy + 12);
      break;
    case 'right':
      ui.moveTo(cx + 11, cy);
      ui.lineTo(cx - 8, cy - 12);
      ui.lineTo(cx - 8, cy + 12);
      break;
    case 'gas':
      // tall pedal with grip lines
      roundRect(ui, cx - 11, cy - 22, 22, 40, 4);
      ui.fill();
      ui.fillStyle = 'rgba(14,12,10,0.7)';
      for (let i = 0; i < 5; i++) ui.fillRect(cx - 7, cy - 16 + i * 7, 14, 2);
      return;
    case 'brake':
      roundRect(ui, cx - 13, cy - 8, 26, 16, 3);
      ui.fill();
      ui.fillStyle = 'rgba(14,12,10,0.7)';
      for (let i = 0; i < 3; i++) ui.fillRect(cx - 9, cy - 5 + i * 4, 18, 1.6);
      return;
    case 'shoot': {
      // crosshair
      ui.lineWidth = 1.6;
      ui.arc(cx, cy, 9, 0, Math.PI * 2);
      ui.moveTo(cx - 14, cy);
      ui.lineTo(cx - 4, cy);
      ui.moveTo(cx + 4, cy);
      ui.lineTo(cx + 14, cy);
      ui.moveTo(cx, cy - 14);
      ui.lineTo(cx, cy - 4);
      ui.moveTo(cx, cy + 4);
      ui.lineTo(cx, cy + 14);
      ui.stroke();
      return;
    }
    case 'pause':
      ui.fillRect(cx - 4, cy - 5, 3, 10);
      ui.fillRect(cx + 1, cy - 5, 3, 10);
      return;
    default:
      return;
  }
  ui.closePath();
  ui.fill();
}

function roundRect(ui, x, y, w, h, r) {
  ui.beginPath();
  ui.moveTo(x + r, y);
  ui.arcTo(x + w, y, x + w, y + h, r);
  ui.arcTo(x + w, y + h, x, y + h, r);
  ui.arcTo(x, y + h, x, y, r);
  ui.arcTo(x, y, x + w, y, r);
  ui.closePath();
}
