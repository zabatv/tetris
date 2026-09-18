import { colorOf, shade, rgba } from './palette.js';

function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Один блок: объёмная заливка, фаска и блик. Свечение включается точечно —
 * тень канваса дорогая, поэтому по умолчанию выключена.
 */
export function drawBlock(ctx, px, py, size, value, opts = {}) {
  const { alpha = 1, glow = 0, flash = 0, scale = 1 } = opts;
  const color = opts.color || colorOf(value);
  const inset = size * 0.055;
  const s = size - inset * 2;
  const w = s * scale;
  const h = s * scale;
  const x = px + inset + (s - w) / 2;
  const y = py + inset + (s - h) / 2;
  const radius = Math.max(2, size * 0.2);

  ctx.save();
  ctx.globalAlpha = alpha;

  if (glow > 0) {
    ctx.shadowColor = rgba(color, Math.min(1, glow));
    ctx.shadowBlur = size * 0.75 * glow;
  }

  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, shade(color, 0.32));
  grad.addColorStop(0.45, color);
  grad.addColorStop(1, shade(color, -0.32));
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Верхний блик — объём без тяжёлых фильтров.
  const gloss = ctx.createLinearGradient(x, y, x, y + h * 0.5);
  gloss.addColorStop(0, 'rgba(255,255,255,0.34)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  roundRect(ctx, x + w * 0.1, y + h * 0.07, w * 0.8, h * 0.42, radius * 0.6);
  ctx.fill();

  ctx.lineWidth = Math.max(1, size * 0.035);
  ctx.strokeStyle = rgba(color, 0.85);
  roundRect(ctx, x, y, w, h, radius);
  ctx.stroke();

  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, flash)})`;
    roundRect(ctx, x, y, w, h, radius);
    ctx.fill();
  }
  ctx.restore();
}

/** Призрак — только контур, чтобы не спорить с настоящей фигурой. */
export function drawGhost(ctx, px, py, size, value, alpha = 0.34) {
  const color = colorOf(value);
  const inset = size * 0.12;
  const s = size - inset * 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = Math.max(1.2, size * 0.055);
  ctx.strokeStyle = color;
  ctx.setLineDash([size * 0.22, size * 0.16]);
  roundRect(ctx, px + inset, py + inset, s, s, size * 0.16);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = alpha * 0.25;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** Мусорный ряд рисуем плоско — он не должен спорить с фигурами. */
export function drawGarbage(ctx, px, py, size) {
  const inset = size * 0.08;
  const s = size - inset * 2;
  ctx.save();
  ctx.fillStyle = '#3d4456';
  roundRect(ctx, px + inset, py + inset, s, s, size * 0.16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.stroke();
  ctx.restore();
}
