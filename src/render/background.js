import { levelHue } from './palette.js';

const LAMPS = [
  { hue: 190, ax: 0.22, ay: 0.18, sx: 0.000071, sy: 0.000053, r: 0.62 },
  { hue: 288, ax: 0.26, ay: 0.22, sx: -0.000047, sy: 0.000067, r: 0.55 },
  { hue: 152, ax: 0.18, ay: 0.26, sx: 0.000059, sy: -0.000041, r: 0.48 },
];

/**
 * Фон: тёмная сцена, медленно плывущие пятна света и неоновая сетка.
 * Никакого космоса — это свет студии, а не звёзды.
 */
export class Background {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.time = 0;
    this.reducedMotion = reducedMotion;
    this.pulses = [];
    this.energy = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Вспышка от слома рядов: волна расходится по всей сцене. */
  pulse(strength = 1, hue = 190) {
    this.pulses.push({ r: 0, life: 1, strength, hue });
    this.energy = Math.min(1.6, this.energy + strength * 0.5);
  }

  render(dt, { level = 1 } = {}) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    this.time += this.reducedMotion ? 0 : dt;
    this.energy = Math.max(0, this.energy - dt * 0.0012);

    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#080910');
    base.addColorStop(0.55, '#0a0c14');
    base.addColorStop(1, '#05060b');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    const hueShift = levelHue(level);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const lamp of LAMPS) {
      const x = w * (0.5 + Math.sin(this.time * lamp.sx) * lamp.ax);
      const y = h * (0.5 + Math.cos(this.time * lamp.sy) * lamp.ay);
      const radius = Math.max(w, h) * lamp.r;
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      const alpha = 0.16 + this.energy * 0.12;
      g.addColorStop(0, `hsla(${(lamp.hue + hueShift) % 360}, 90%, 58%, ${alpha})`);
      g.addColorStop(0.5, `hsla(${(lamp.hue + hueShift) % 360}, 90%, 50%, ${alpha * 0.25})`);
      g.addColorStop(1, 'hsla(0,0%,0%,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();

    this.drawGrid(hueShift);
    this.drawPulses(dt, hueShift);

    // Затемнение по краям — взгляд держится на стакане.
    const vign = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
    vign.addColorStop(0, 'rgba(0,0,0,0)');
    vign.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = vign;
    ctx.fillRect(0, 0, w, h);
  }

  drawGrid(hueShift) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const step = 64;
    const drift = this.reducedMotion ? 0 : (this.time * 0.012) % step;
    const sweep = (Math.sin(this.time * 0.00035) * 0.5 + 0.5);

    ctx.save();
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -step + drift; x < w + step; x += step) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, h);
    }
    for (let y = -step + drift; y < h + step; y += step) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(w, Math.round(y) + 0.5);
    }
    ctx.strokeStyle = `hsla(${(200 + hueShift) % 360}, 70%, 70%, ${0.035 + sweep * 0.02 + this.energy * 0.03})`;
    ctx.stroke();
    ctx.restore();
  }

  drawPulses(dt, hueShift) {
    if (!this.pulses.length) return;
    const ctx = this.ctx;
    const cx = this.width / 2;
    const cy = this.height / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.r += dt * 1.5 * (0.7 + p.strength * 0.5);
      p.life -= dt * 0.0011;
      if (p.life <= 0) { this.pulses.splice(i, 1); continue; }
      ctx.strokeStyle = `hsla(${(p.hue + hueShift) % 360}, 95%, 65%, ${p.life * 0.18 * p.strength})`;
      ctx.lineWidth = 2 + p.strength * 3;
      ctx.beginPath();
      ctx.arc(cx, cy, p.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
