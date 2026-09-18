import { rgbString } from './palette.js';

function hslToRgbString(h, s, l) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))));
  };
  return `${f(0)},${f(8)},${f(4)}`;
}

/**
 * Линии скорости: лучи, сходящиеся к точке интереса. Рисуются поверх поля
 * и не хранят состояния — только сила и время.
 */
export function drawSpeedLines(ctx, { strength, width, height, focusY, time }) {
  if (strength <= 0.01) return;
  const cx = width / 2;
  const cy = focusY == null ? height / 2 : focusY;
  const count = Math.round(14 + strength * 26);
  const reach = Math.hypot(width, height);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + time * 0.0006;
    const inner = reach * (0.22 + ((i * 37) % 17) / 40) * (1.2 - strength * 0.5);
    const outer = inner + reach * (0.18 + strength * 0.5);
    const alpha = Math.min(0.75, strength * (0.18 + ((i * 13) % 7) / 24));
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = 1 + strength * 2.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.stroke();
  }
  ctx.restore();
}

const GRAVITY = 0.00055; // px на мс²

/** Лёгкая система частиц: искры, осколки, ударные волны и пыль. */
export class Particles {
  constructor(limit = 900) {
    this.items = [];
    this.limit = limit;
  }

  get count() {
    return this.items.length;
  }

  clear() {
    this.items.length = 0;
  }

  push(p) {
    if (this.items.length >= this.limit) this.items.shift();
    this.items.push(p);
  }

  spark(x, y, color, count = 12, power = 0.35) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = power * (0.4 + Math.random());
      this.push({
        kind: 'spark', x, y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.05,
        size: 1.5 + Math.random() * 2.5,
        life: 1, decay: 0.0012 + Math.random() * 0.0016,
        color: rgbString(color),
      });
    }
  }

  shards(x, y, color, count = 10, cell = 30) {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
      const v = 0.18 + Math.random() * 0.4;
      this.push({
        kind: 'shard', x, y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        size: cell * (0.18 + Math.random() * 0.3),
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.012,
        life: 1, decay: 0.0009 + Math.random() * 0.001,
        color: rgbString(color),
      });
    }
  }

  ring(x, y, color, { radius = 4, growth = 0.55, width = 3 } = {}) {
    this.push({
      kind: 'ring', x, y, radius, growth, width,
      life: 1, decay: 0.0016,
      color: rgbString(color),
    });
  }

  dust(x, y, color, count = 4) {
    for (let i = 0; i < count; i++) {
      this.push({
        kind: 'dust',
        x: x + (Math.random() - 0.5) * 12,
        y: y + (Math.random() - 0.5) * 12,
        vx: (Math.random() - 0.5) * 0.04,
        vy: -0.02 - Math.random() * 0.05,
        size: 3 + Math.random() * 6,
        life: 1, decay: 0.0018 + Math.random() * 0.002,
        color: rgbString(color),
      });
    }
  }

  /** Конфетти: разноцветные лоскуты, которые кружит и сносит в сторону. */
  confetti(x, y, count = 24, spread = 1) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.15 + Math.random() * 0.5) * spread;
      this.push({
        kind: 'confetti',
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 0.25,
        size: 4 + Math.random() * 8,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.02,
        life: 1, decay: 0.0006 + Math.random() * 0.0007,
        hue: Math.random() * 360,
        spin: 0.15 + Math.random() * 0.4,
      });
    }
  }

  /** Молния: ломаная от точки к точке, живёт полмига. */
  bolt(x1, y1, x2, y2, color = '#ffffff', segments = 8) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const spread = Math.sin(t * Math.PI) * 26;
      points.push([
        x1 + (x2 - x1) * t + (Math.random() - 0.5) * spread,
        y1 + (y2 - y1) * t + (Math.random() - 0.5) * spread,
      ]);
    }
    this.push({ kind: 'bolt', points, life: 1, decay: 0.004, color: rgbString(color), width: 1 + Math.random() * 2 });
  }

  /** Салют: несколько разноцветных вспышек подряд. */
  firework(x, y, count = 40) {
    const hues = [0, 45, 140, 190, 280, 320];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 0.2 + Math.random() * 0.55;
      const hue = hues[(Math.random() * hues.length) | 0];
      this.push({
        kind: 'spark', x, y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        size: 2 + Math.random() * 3,
        life: 1, decay: 0.0011 + Math.random() * 0.0012,
        color: hslToRgbString(hue, 100, 62),
      });
    }
  }

  streak(x, y, color, length = 40) {
    this.push({
      kind: 'streak', x, y, vx: 0, vy: 0.9,
      length, life: 1, decay: 0.004,
      color: rgbString(color),
    });
  }

  /** Полоса искр по всему ряду — сопровождает слом. */
  rowBlast(y, width, color, count = 26) {
    for (let i = 0; i < count; i++) {
      const x = Math.random() * width;
      this.spark(x, y, color, 3, 0.5);
      if (Math.random() < 0.4) this.dust(x, y, color, 1);
    }
  }

  update(dt, scale = 1) {
    const step = dt * scale;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= p.decay * step;
      if (p.life <= 0) { this.items.splice(i, 1); continue; }
      switch (p.kind) {
        case 'spark':
          p.vy += GRAVITY * step;
          p.x += p.vx * step; p.y += p.vy * step;
          break;
        case 'shard':
          p.vy += GRAVITY * 1.4 * step;
          p.x += p.vx * step; p.y += p.vy * step;
          p.rot += p.vr * step;
          break;
        case 'ring':
          p.radius += p.growth * step;
          break;
        case 'dust':
          p.x += p.vx * step; p.y += p.vy * step;
          break;
        case 'streak':
          p.y += p.vy * step;
          break;
        case 'confetti':
          p.vy += GRAVITY * 0.55 * step;
          p.vx *= 0.999;
          p.x += p.vx * step;
          p.y += p.vy * step;
          p.rot += p.vr * step;
          p.hue = (p.hue + p.spin * step) % 360;
          break;
        case 'bolt':
          break;
      }
    }
  }

  render(ctx) {
    if (!this.items.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.items) {
      const a = Math.max(0, Math.min(1, p.life));
      switch (p.kind) {
        case 'spark':
          ctx.fillStyle = `rgba(${p.color},${a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'shard':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = `rgba(${p.color},${a})`;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
          break;
        case 'ring':
          ctx.strokeStyle = `rgba(${p.color},${a * 0.9})`;
          ctx.lineWidth = p.width * a;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'dust':
          ctx.fillStyle = `rgba(${p.color},${a * 0.35})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'streak':
          ctx.strokeStyle = `rgba(${p.color},${a * 0.7})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x, p.y - p.length * a);
          ctx.stroke();
          break;
        case 'confetti':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          // Лоскут поворачивается ребром — отсюда «мерцание».
          ctx.scale(1, Math.abs(Math.cos(p.rot * 1.7)) * 0.8 + 0.2);
          ctx.fillStyle = `hsla(${p.hue}, 100%, 62%, ${a})`;
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
          ctx.restore();
          break;
        case 'bolt': {
          ctx.strokeStyle = `rgba(${p.color},${a})`;
          ctx.lineWidth = p.width * (0.4 + a);
          ctx.beginPath();
          ctx.moveTo(p.points[0][0], p.points[0][1]);
          for (let i = 1; i < p.points.length; i++) ctx.lineTo(p.points[i][0], p.points[i][1]);
          ctx.stroke();
          ctx.strokeStyle = `rgba(255,255,255,${a * 0.8})`;
          ctx.lineWidth = p.width * 0.4;
          ctx.stroke();
          break;
        }
      }
    }
    ctx.restore();
  }
}
