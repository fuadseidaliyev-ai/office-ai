// Text helpers for the UI layer (virtual coordinates, crisp at any scale).

export const FONT = "'Exo 2', 'Segoe UI', Roboto, sans-serif";

export function text(ctx, str, x, y, {
  size = 10, color = '#e8dcc0', align = 'left', baseline = 'top', shadow = true, bold = false,
} = {}) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillText(str, x + 0.6, y + 0.6);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

export function panel(ctx, x, y, w, h, { fill = 'rgba(18,14,10,0.78)', stroke = 'rgba(232,220,192,0.18)' } = {}) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(x + 0.25, y + 0.25, w - 0.5, h - 0.5);
}

export function bar(ctx, x, y, w, h, value, color, { back = 'rgba(0,0,0,0.6)', flash = false } = {}) {
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = flash ? '#fff' : color;
  ctx.fillRect(x + 0.5, y + 0.5, Math.max(0, (w - 1) * Math.min(1, value)), h - 1);
}
