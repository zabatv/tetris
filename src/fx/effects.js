/**
 * Экранные эффекты: замедление времени, стоп-кадры, зумы, тряска, глитч,
 * RGB-разрыв, линии скорости и всплывающий текст.
 *
 * Композиция за кадр строится из трёх источников:
 *   1) разовые события (удар, вспышка, глитч),
 *   2) «тизер» перед сломом — самый долгий и злой,
 *   3) фоновая интенсивность, которая растёт от комбо, уровня и высоты завала.
 * Правила игры об этом ничего не знают.
 */

const clamp01 = v => Math.max(0, Math.min(1, v));

/** Замедление и стоп-кадры: игра тормозит, эффекты продолжают жить. */
export class TimeScale {
  constructor() {
    this.scale = 1;
    this.timer = 0;
    this.target = 1;
    this.freezeTimer = 0;
  }

  slow(duration, factor = 0.12) {
    this.timer = Math.max(this.timer, duration);
    this.target = Math.min(this.target === 1 ? factor : this.target, factor);
  }

  /** Полная остановка: кадр «залипает» на момент удара. */
  freeze(duration = 70) {
    this.freezeTimer = Math.max(this.freezeTimer, duration);
  }

  release() {
    this.timer = 0;
    this.target = 1;
  }

  update(dt) {
    if (this.freezeTimer > 0) {
      this.freezeTimer -= dt;
      this.scale = 0;
      return 0;
    }
    if (this.timer > 0) {
      this.timer -= dt;
      this.scale += (this.target - this.scale) * Math.min(1, dt * 0.03);
      if (this.timer <= 0) this.target = 1;
    } else {
      // Выход из слоу-мо резкий — это и есть «щелчок» возврата времени.
      this.scale += (1 - this.scale) * Math.min(1, dt * 0.03);
      if (this.scale > 0.995) this.scale = 1;
    }
    return this.scale;
  }
}

export class ScreenFX {
  constructor({ stage, screen, flash, textLayer, floats, chroma, glitch, scanlines, vignette, reducedMotion = false }) {
    this.stage = stage;
    this.screen = screen;
    this.flashEl = flash;
    this.textLayer = textLayer;
    this.floats = floats;
    this.chromaEl = chroma;
    this.glitchEl = glitch;
    this.scanlinesEl = scanlines;
    this.vignetteEl = vignette;
    this.reducedMotion = reducedMotion;

    // Множитель безумия: 0 — всё выключено, 1 — как задумано, 1.6 — перебор.
    this.madness = reducedMotion ? 0 : 1;

    this.shakes = [];
    this.punches = [];
    this.flashes = [];
    this.zooms = [];
    this.glitches = [];
    this.hueBursts = [];
    this.tease = null;
    this.ambient = 0;
    this.hueSpin = 0;
    this.speedLines = 0;
    this.speedLinesDecay = 0;
    this.time = 0;
    this.lastFilter = '';
    this.quality = 1;
  }

  setMadness(value) {
    this.madness = this.reducedMotion ? 0 : value;
  }

  /**
   * Смягчённый множитель для геометрии: оттенок и вспышки можно крутить
   * линейно, а зум и тряску — нет, иначе на «безумии» поле уезжает за экран.
   */
  get soften() {
    return this.on ? 0.6 + this.madness * 0.4 : 0;
  }

  /** 1 — всё как задумано, 0 — режим выживания для слабых машин. */
  setQuality(value) {
    this.quality = Math.max(0, Math.min(1, value));
  }

  get on() {
    return this.madness > 0;
  }

  // --- разовые события -------------------------------------------------------

  shake(power = 8, duration = 320) {
    if (!this.on) return;
    this.shakes.push({ power: Math.min(26, power * this.soften), duration, time: 0 });
    if (this.shakes.length > 6) this.shakes.shift();
  }

  /** Короткий удар камеры. */
  zoomPunch(amount = 0.06, duration = 300) {
    if (!this.on) return;
    this.punches.push({ amount: Math.min(0.3, amount * this.soften), duration, time: 0 });
    if (this.punches.length > 4) this.punches.shift();
  }

  /** Долгий наезд: держится, пока идёт событие. */
  zoom(amount, duration, ease = 0.5) {
    if (!this.on) return;
    this.zooms.push({ amount: amount * this.soften, duration, time: 0, ease });
  }

  /** Короткий пинок камеры: тряска и микрозум одним движением. */
  bump(power = 2, amount = 0.008, duration = 140) {
    this.shake(power, duration);
    this.zoomPunch(amount, duration + 40);
  }

  flash(color = 'rgba(255,255,255,0.6)', duration = 240) {
    this.flashes.push({ color, duration, time: 0 });
  }

  chromatic(duration = 320) {
    if (!this.chromaEl || !this.on) return;
    this.chromaEl.classList.remove('is-on');
    void this.chromaEl.offsetWidth; // перезапуск анимации
    this.chromaEl.classList.add('is-on');
    clearTimeout(this._chromaTimer);
    this._chromaTimer = setTimeout(() => this.chromaEl.classList.remove('is-on'), duration);
  }

  /** Разрыв картинки полосами — «сигнал поплыл». */
  glitch(duration = 360, power = 1) {
    if (!this.on) return;
    this.glitches.push({ duration, time: 0, power: power * this.madness });
  }

  /** Прокрутка оттенка по всему экрану. */
  hueBurst(amount = 360, duration = 900) {
    if (!this.on) return;
    this.hueBursts.push({ amount, duration, time: 0 });
  }

  /** Линии скорости на игровом поле. */
  speed(strength = 1, decay = 0.0025) {
    if (!this.on) return;
    this.speedLines = Math.min(1.6, this.speedLines + strength * this.madness);
    this.speedLinesDecay = decay;
  }

  /** Постоянный фон безумия: комбо, уровень и завал. */
  setAmbient(value) {
    this.ambient = clamp01(value) * this.madness;
  }

  /** Состояние «вот-вот сломается ряд». */
  setTease(progress, rows, centerY) {
    if (progress == null) { this.tease = null; return; }
    this.tease = { progress: clamp01(progress), rows, centerY };
  }

  // --- текст -----------------------------------------------------------------

  banner(text, tone = 'normal') {
    if (!this.textLayer || !text) return;
    const el = document.createElement('div');
    el.className = `fx-banner fx-banner--${tone}`;
    el.textContent = text;
    this.textLayer.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
    while (this.textLayer.childElementCount > 4) this.textLayer.firstElementChild.remove();
  }

  floatText(x, y, text, tone = 'normal') {
    if (!this.floats) return;
    const el = document.createElement('div');
    el.className = `fx-float fx-float--${tone}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.floats.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  reset() {
    this.shakes.length = 0;
    this.punches.length = 0;
    this.flashes.length = 0;
    this.zooms.length = 0;
    this.glitches.length = 0;
    this.hueBursts.length = 0;
    this.tease = null;
    this.ambient = 0;
    this.speedLines = 0;
    this.hueSpin = 0;
    if (this.stage) {
      this.stage.style.transform = '';
      this.stage.style.filter = '';
      this.stage.style.transformOrigin = '';
    }
    if (this.screen) this.screen.style.filter = '';
    if (this.flashEl) this.flashEl.style.opacity = '0';
    if (this.glitchEl) this.glitchEl.style.opacity = '0';
    if (this.vignetteEl) this.vignetteEl.style.opacity = '0';
    if (this.textLayer) this.textLayer.replaceChildren();
    if (this.floats) this.floats.replaceChildren();
  }

  // --- сборка кадра ----------------------------------------------------------

  update(dt) {
    this.time += dt;
    const madness = this.madness;

    let dx = 0, dy = 0, rot = 0, scale = 1;
    let originX = null, originY = null;
    let hue = 0, saturate = 1, contrast = 1, blur = 0, brightness = 1;
    let vignette = 0;

    // Тряска.
    for (let i = this.shakes.length - 1; i >= 0; i--) {
      const s = this.shakes[i];
      s.time += dt;
      if (s.time >= s.duration) { this.shakes.splice(i, 1); continue; }
      const k = 1 - s.time / s.duration;
      const decay = k * k;
      dx += (Math.random() - 0.5) * 2 * s.power * decay;
      dy += (Math.random() - 0.5) * 2 * s.power * decay;
      rot += (Math.random() - 0.5) * 1.4 * decay * madness;
    }

    // Удары камеры.
    for (let i = this.punches.length - 1; i >= 0; i--) {
      const p = this.punches[i];
      p.time += dt;
      const k = p.time / p.duration;
      if (k >= 1) { this.punches.splice(i, 1); continue; }
      scale += p.amount * Math.sin(Math.PI * k) * (1 - k * 0.35);
    }

    // Долгие наезды.
    for (let i = this.zooms.length - 1; i >= 0; i--) {
      const z = this.zooms[i];
      z.time += dt;
      const k = z.time / z.duration;
      if (k >= 1) { this.zooms.splice(i, 1); continue; }
      // Быстрый вход, долгий выдох.
      const shape = k < z.ease ? k / z.ease : 1 - (k - z.ease) / (1 - z.ease);
      scale += z.amount * shape;
    }

    // Прокрутка оттенка.
    for (let i = this.hueBursts.length - 1; i >= 0; i--) {
      const b = this.hueBursts[i];
      b.time += dt;
      const k = b.time / b.duration;
      if (k >= 1) { this.hueBursts.splice(i, 1); continue; }
      hue += b.amount * k * (1 - k) * 4;
      saturate += 0.7 * Math.sin(Math.PI * k);
    }

    // Лёгкое покачивание есть всегда: застывшая камера выглядит мёртвой.
    // Только сдвиг — поворот и масштаб заставляли бы слой пересчитываться
    // каждый кадр даже в полном покое.
    if (madness > 0) {
      dx += Math.sin(this.time * 0.00071) * 1.6 * madness;
      dy += Math.cos(this.time * 0.00053) * 1.2 * madness;
    }

    // Фоновое безумие: медленное дыхание и плывущий оттенок.
    if (this.ambient > 0) {
      this.hueSpin += dt * 0.02 * this.ambient;
      hue += Math.sin(this.time * 0.0006) * 14 * this.ambient + this.hueSpin * 0.35;
      saturate += 0.35 * this.ambient;
      contrast += 0.12 * this.ambient;
      scale += Math.sin(this.time * 0.0018) * 0.022 * this.ambient;
      rot += Math.sin(this.time * 0.0009) * 0.6 * this.ambient;
      dx += Math.sin(this.time * 0.0026) * 3 * this.ambient;
      dy += Math.cos(this.time * 0.0021) * 2.4 * this.ambient;
      vignette += 0.25 * this.ambient;
    }

    // Тизер перед сломом — главный аттракцион.
    if (this.tease && this.on) {
      const soften = this.soften;
      const p = this.tease.progress;
      const ease = p * p;
      const n = this.tease.rows;
      const punch = Math.pow(p, 6); // последние миллисекунды бьют сильнее всего
      // Камера наезжает сильно, но поле должно остаться в кадре целиком.
      scale += Math.min(1.1, (0.10 + ease * (0.2 + n * 0.055) + punch * 0.22) * soften);
      rot += Math.sin(this.time * 0.03) * ease * (1.2 + n * 0.35) * soften;
      dx += (Math.random() - 0.5) * ease * 8 * soften;
      dy += (Math.random() - 0.5) * ease * 8 * soften;
      originX = 50;
      originY = this.tease.centerY;
      hue += ease * 320 * madness + Math.sin(this.time * 0.02) * 40 * ease;
      saturate += ease * (1.4 + n * 0.3);
      contrast += ease * 0.5;
      brightness += ease * 0.25 + punch * 0.5;
      blur += punch * 1.6 * soften * this.quality;
      vignette = Math.max(vignette, Math.min(0.92, ease * 1.3));
      this.speedLines = Math.max(this.speedLines, ease * 1.2 * madness);
    }

    // Подстраховка: как бы ни сложились эффекты, картинка не улетает.
    scale = Math.max(0.55, Math.min(2.1, scale));
    {
    }

    // Глитч-полосы.
    let glitchAlpha = 0;
    let glitchShift = 0;
    for (let i = this.glitches.length - 1; i >= 0; i--) {
      const g = this.glitches[i];
      g.time += dt;
      const k = g.time / g.duration;
      if (k >= 1) { this.glitches.splice(i, 1); continue; }
      const strength = (1 - k) * g.power;
      glitchAlpha = Math.max(glitchAlpha, strength);
      glitchShift = Math.max(glitchShift, strength * 26);
      if (Math.random() < 0.5) dx += (Math.random() - 0.5) * strength * 14;
    }

    if (this.speedLines > 0) {
      this.speedLines = Math.max(0, this.speedLines - dt * (this.speedLinesDecay || 0.0025));
    }

    this.applyStage(dx, dy, rot, scale, originX, originY, brightness);
    this.applyScreen(hue, saturate, contrast, blur);
    this.applyFlash(dt);
    this.applyGlitch(glitchAlpha, glitchShift);
    this.applyVignette(vignette);
  }

  applyStage(dx, dy, rot, scale, originX, originY, brightness) {
    if (!this.stage) return;
    this.stage.style.transformOrigin = originX == null ? '' : `${originX}% ${originY}px`;
    this.stage.style.transform =
      `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) rotate(${rot.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
    this.stage.style.filter = brightness > 1.005 ? `brightness(${brightness.toFixed(3)})` : '';
  }

  /** Фильтр на весь экран — самый дорогой эффект, ставим только когда он что-то меняет. */
  applyScreen(hue, saturate, contrast, blur) {
    if (!this.screen) return;
    const parts = [];
    if (Math.abs(hue) > 0.6) parts.push(`hue-rotate(${(hue % 360).toFixed(1)}deg)`);
    if (Math.abs(saturate - 1) > 0.02) parts.push(`saturate(${saturate.toFixed(3)})`);
    if (Math.abs(contrast - 1) > 0.02) parts.push(`contrast(${contrast.toFixed(3)})`);
    if (blur > 0.05) parts.push(`blur(${blur.toFixed(2)}px)`);
    const filter = parts.join(' ');
    if (filter !== this.lastFilter) {
      this.screen.style.filter = filter;
      this.lastFilter = filter;
    }
  }

  applyFlash(dt) {
    if (!this.flashEl) return;
    let alpha = 0;
    let color = null;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.time += dt;
      if (f.time >= f.duration) { this.flashes.splice(i, 1); continue; }
      const k = 1 - f.time / f.duration;
      if (k > alpha) { alpha = k; color = f.color; }
    }
    this.flashEl.style.opacity = alpha ? String(alpha) : '0';
    if (color) this.flashEl.style.background = color;
  }

  applyGlitch(alpha, shift) {
    if (!this.glitchEl) return;
    if (alpha <= 0.01) {
      if (this.glitchEl.style.opacity !== '0') this.glitchEl.style.opacity = '0';
      return;
    }
    // Каждый кадр режем картинку новой полосой — получается «рваный сигнал».
    const top = Math.random() * 90;
    const height = 4 + Math.random() * 22;
    this.glitchEl.style.opacity = String(Math.min(1, alpha));
    this.glitchEl.style.clipPath = `inset(${top}% 0 ${Math.max(0, 100 - top - height)}% 0)`;
    this.glitchEl.style.transform = `translateX(${(Math.random() - 0.5) * shift}px)`;
  }

  applyVignette(value) {
    if (!this.vignetteEl) return;
    this.vignetteEl.style.opacity = value > 0.01 ? value.toFixed(3) : '0';
  }
}
