import { rgbString } from './palette.js';

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
      }
    }
    ctx.restore();
  }
}
