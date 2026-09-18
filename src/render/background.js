import { levelHue } from './palette.js';

const LAMPS = [
  { hue: 190, ax: 0.24, ay: 0.20, sx: 0.000071, sy: 0.000053, r: 0.62 },
  { hue: 288, ax: 0.28, ay: 0.24, sx: -0.000047, sy: 0.000067, r: 0.55 },
  { hue: 152, ax: 0.20, ay: 0.28, sx: 0.000059, sy: -0.000041, r: 0.48 },
];

/**
 * Фон-сцена: пятна света, дышащая сетка, тоннель из колец и калейдоскоп.
 * Чем выше `intensity` (комбо, уровень, завал), тем сильнее всё плывёт.
 * Космоса нет — это свет и геометрия, а не звёзды.
 */
export class Background {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.time = 0;
    this.reducedMotion = reducedMotion;
    this.madness = reducedMotion ? 0 : 1;
    this.pulses = [];
    this.energy = 0;
    this.quality = 1;
    this.intensity = 0;
    this.kaleido = 0;
    this.tunnel = 0;
    this.hueShift = 0;
    this.resize();
  }

  setMadness(value) {
    this.madness = this.reducedMotion ? 0 : value;
  }

  setQuality(value) {
    this.quality = Math.max(0, Math.min(1, value));
  }

  setIntensity(value) {
    this.intensity = Math.max(0, Math.min(1, value)) * this.madness;
  }

  resize() {
    // Фон — это мягкие градиенты, резкость им не нужна. Рисуем в половинном
    // разрешении и растягиваем: заливки дешевеют вчетверо, а размытие от
    // масштабирования только на пользу.
    const scale = 0.5;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.max(1, Math.round(this.width * scale));
    this.canvas.height = Math.max(1, Math.round(this.height * scale));
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // Слой мягкого света — ещё вдвое мельче: радиальные градиенты дороги.
    if (!this.soft) {
      this.soft = document.createElement('canvas');
      this.softCtx = this.soft.getContext('2d');
    }
    this.softScale = 0.25;
    this.soft.width = Math.max(1, Math.round(this.width * this.softScale));
    this.soft.height = Math.max(1, Math.round(this.height * this.softScale));
    this.softCtx.setTransform(this.softScale, 0, 0, this.softScale, 0, 0);

    this.buildVignette();
  }

  /** Виньетка не меняется — рисуем её один раз и потом просто копируем. */
  buildVignette() {
    if (!this.vignette) {
      this.vignette = document.createElement('canvas');
      this.vignetteCtx = this.vignette.getContext('2d');
    }
    const scale = 0.25;
    const w = Math.max(1, Math.round(this.width * scale));
    const h = Math.max(1, Math.round(this.height * scale));
    this.vignette.width = w;
    this.vignette.height = h;
    const ctx = this.vignetteCtx;
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  /** Волна от слома рядов. */
  pulse(strength = 1, hue = 190) {
    this.pulses.push({ r: 0, life: 1, strength: strength * this.madness, hue });
    this.energy = Math.min(2, this.energy + strength * 0.5);
  }

  /** Калейдоскоп: зеркальные сектора вращаются вокруг центра. */
  burst(duration = 1, tunnel = 1) {
    this.kaleido = Math.min(2.4, this.kaleido + duration * this.madness);
    this.tunnel = Math.min(2.4, this.tunnel + tunnel * this.madness);
  }

  render(dt, { level = 1 } = {}) {
    // Полноэкранный канвас перезаливается целиком, поэтому на спокойной игре
    // фон обновляется вдвое реже — глаз этого не замечает, а кадр дешевеет.
    this.sinceFrame = (this.sinceFrame || 0) + dt;
    const hot = this.intensity > 0.12 || this.energy > 0.04 || this.kaleido > 0.02 || this.tunnel > 0.02 || this.pulses.length > 0;
    const interval = hot ? (this.quality > 0.55 ? 0 : 33) : (this.quality > 0.55 ? 33 : 50);
    if (this.sinceFrame < interval) return;
    dt = this.sinceFrame;
    this.sinceFrame = 0;

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const speed = 1 + this.intensity * 5;
    this.time += (this.reducedMotion ? 0 : dt) * speed;
    this.energy = Math.max(0, this.energy - dt * 0.0012);
    this.kaleido = Math.max(0, this.kaleido - dt * 0.0011);
    this.tunnel = Math.max(0, this.tunnel - dt * 0.0009);
    this.hueShift = (this.hueShift + dt * 0.02 * (this.intensity + this.energy * 0.5)) % 360;

    const hue = levelHue(level) + this.hueShift;

    // Мягкий свет собираем на мелком слое, потом растягиваем на весь экран.
    const soft = this.softCtx;
    soft.globalCompositeOperation = 'source-over';
    const base = soft.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#080910');
    base.addColorStop(0.55, '#0a0c14');
    base.addColorStop(1, '#05060b');
    soft.fillStyle = base;
    soft.fillRect(0, 0, w, h);
    this.drawLamps(soft, hue);
    if (this.tunnel > 0.02) this.drawTunnel(soft, hue);
    if (this.kaleido > 0.02) this.drawKaleido(soft, hue);
    this.drawPulses(soft, dt, hue);

    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.soft, 0, 0, w, h);
    this.drawGrid(hue);

    ctx.globalAlpha = 0.72 - this.intensity * 0.2;
    ctx.drawImage(this.vignette, 0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  drawLamps(ctx, hueShift) {
    const w = this.width;
    const h = this.height;
    const boost = 1 + this.intensity * 1.6 + this.energy * 0.8;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const lamp of LAMPS) {
      const wobble = 1 + Math.sin(this.time * 0.0012 + lamp.hue) * 0.12 * this.intensity;
      const x = w * (0.5 + Math.sin(this.time * lamp.sx) * lamp.ax * wobble);
      const y = h * (0.5 + Math.cos(this.time * lamp.sy) * lamp.ay * wobble);
      const radius = Math.max(w, h) * lamp.r * wobble;
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      const alpha = (0.16 + this.energy * 0.1) * boost;
      const tone = (lamp.hue + hueShift) % 360;
      g.addColorStop(0, `hsla(${tone}, 95%, 60%, ${alpha})`);
      g.addColorStop(0.5, `hsla(${tone}, 95%, 50%, ${alpha * 0.25})`);
      g.addColorStop(1, 'hsla(0,0%,0%,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  /** Сетка «дышит»: на спокойной игре ровная, на безумии идёт волнами. */
  drawGrid(hueShift) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const step = 64;
    const drift = this.reducedMotion ? 0 : (this.time * 0.012) % step;
    const sweep = Math.sin(this.time * 0.00035) * 0.5 + 0.5;
    const warp = this.intensity * 26 + this.energy * 10;

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = `hsla(${(200 + hueShift) % 360}, 80%, 72%, ${0.05 + sweep * 0.025 + this.energy * 0.05 + this.intensity * 0.06})`;
    ctx.beginPath();
    if (warp < 1) {
      for (let x = -step + drift; x < w + step; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = -step + drift; y < h + step; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
    } else {
      // На безумии линии идут синусоидой — «пол плывёт».
      const segment = 64;
      for (let x = -step + drift; x < w + step; x += step) {
        ctx.moveTo(x + Math.sin(this.time * 0.002) * warp, 0);
        for (let y = 0; y <= h; y += segment) {
          ctx.lineTo(x + Math.sin((y + this.time * 0.35) * 0.012) * warp, y);
        }
      }
      for (let y = -step + drift; y < h + step; y += step) {
        ctx.moveTo(0, y + Math.cos(this.time * 0.002) * warp);
        for (let x = 0; x <= w; x += segment) {
          ctx.lineTo(x, y + Math.cos((x + this.time * 0.35) * 0.012) * warp);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Кольца, летящие из центра — ощущение падения в тоннель. */
  drawTunnel(ctx, hueShift) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const max = Math.hypot(cx, cy);
    const power = Math.min(1, this.tunnel);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const phase = ((this.time * 0.0009 + i / 14) % 1);
      const radius = phase * max * 1.2;
      const alpha = (1 - phase) * 0.35 * power;
      if (alpha <= 0.01) continue;
      ctx.strokeStyle = `hsla(${(i * 26 + hueShift) % 360}, 95%, 62%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Зеркальные сектора: короткий приступ психоделии на сильных событиях. */
  drawKaleido(ctx, hueShift) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const power = Math.min(1, this.kaleido);
    const slices = 8;
    const radius = Math.hypot(cx, cy);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(cx, cy);
    ctx.rotate(this.time * 0.0006);
    for (let i = 0; i < slices; i++) {
      ctx.rotate((Math.PI * 2) / slices);
      const g = ctx.createLinearGradient(0, 0, radius, 0);
      const tone = (i * 40 + hueShift) % 360;
      g.addColorStop(0, `hsla(${tone}, 100%, 65%, ${0.22 * power})`);
      g.addColorStop(0.6, `hsla(${(tone + 40) % 360}, 100%, 55%, ${0.08 * power})`);
      g.addColorStop(1, 'hsla(0,0%,0%,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, -0.18, 0.18);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawPulses(ctx, dt, hueShift) {
    if (!this.pulses.length) return;
    const cx = this.width / 2;
    const cy = this.height / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.r += dt * 1.6 * (0.7 + p.strength * 0.6);
      p.life -= dt * 0.0011;
      if (p.life <= 0) { this.pulses.splice(i, 1); continue; }
      ctx.strokeStyle = `hsla(${(p.hue + hueShift) % 360}, 95%, 65%, ${p.life * 0.26 * p.strength})`;
      ctx.lineWidth = 2 + p.strength * 5;
      ctx.beginPath();
      ctx.arc(cx, cy, p.r, 0, Math.PI * 2);
      ctx.stroke();
      if (p.strength > 0.9) {
        ctx.strokeStyle = `hsla(${(p.hue + hueShift + 180) % 360}, 95%, 70%, ${p.life * 0.14 * p.strength})`;
        ctx.beginPath();
        ctx.arc(cx, cy, p.r * 0.72, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
