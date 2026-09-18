/**
 * Экранные эффекты: тряска, зум-удар, вспышки, всплывающий текст и «тизер»
 * замедления перед сломом. Всё, что двигает картинку целиком, живёт здесь —
 * правила игры об этом не знают.
 */

const clamp01 = v => Math.max(0, Math.min(1, v));

/** Глобальное замедление времени: игра идёт медленнее, эффекты — нет. */
export class TimeScale {
  constructor() {
    this.scale = 1;
    this.timer = 0;
    this.target = 1;
  }

  slow(duration, factor = 0.18) {
    this.timer = Math.max(this.timer, duration);
    this.target = factor;
  }

  update(dt) {
    if (this.timer > 0) {
      this.timer -= dt;
      // Плавный вход в замедление и такой же выход.
      this.scale += (this.target - this.scale) * Math.min(1, dt * 0.02);
    } else {
      this.scale += (1 - this.scale) * Math.min(1, dt * 0.006);
      if (this.scale > 0.995) this.scale = 1;
    }
    return this.scale;
  }
}

export class ScreenFX {
  constructor({ stage, flash, textLayer, floats, chroma, reducedMotion = false }) {
    this.stage = stage;
    this.flashEl = flash;
    this.textLayer = textLayer;
    this.floats = floats;
    this.chromaEl = chroma;
    this.reducedMotion = reducedMotion;

    this.shakes = [];
    this.punch = null;
    this.tease = null;
    this.flashes = [];
    this.time = 0;
  }

  shake(power = 8, duration = 320) {
    if (this.reducedMotion) return;
    this.shakes.push({ power, duration, time: 0 });
    if (this.shakes.length > 4) this.shakes.shift();
  }

  /** Короткий «удар» камеры — читается как вес события. */
  zoomPunch(amount = 0.05, duration = 300) {
    if (this.reducedMotion) return;
    this.punch = { amount, duration, time: 0 };
  }

  flash(color = 'rgba(255,255,255,0.55)', duration = 240) {
    this.flashes.push({ color, duration, time: 0 });
  }

  chromatic(duration = 320) {
    if (!this.chromaEl || this.reducedMotion) return;
    this.chromaEl.classList.remove('is-on');
    void this.chromaEl.offsetWidth; // перезапуск анимации
    this.chromaEl.classList.add('is-on');
    clearTimeout(this._chromaTimer);
    this._chromaTimer = setTimeout(() => this.chromaEl.classList.remove('is-on'), duration);
  }

  /** Состояние «вот-вот сломается ряд»: зум к рядам и сдвиг цвета. */
  setTease(progress, rows, centerY) {
    if (progress == null) { this.tease = null; return; }
    this.tease = { progress: clamp01(progress), rows, centerY };
  }

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
    this.flashes.length = 0;
    this.punch = null;
    this.tease = null;
    if (this.stage) {
      this.stage.style.transform = '';
      this.stage.style.filter = '';
      this.stage.style.transformOrigin = '';
    }
    if (this.flashEl) this.flashEl.style.opacity = '0';
    if (this.textLayer) this.textLayer.replaceChildren();
    if (this.floats) this.floats.replaceChildren();
  }

  update(dt) {
    this.time += dt;
    let dx = 0, dy = 0, rot = 0, scale = 1;
    let originX = null, originY = null;
    let filter = '';

    for (let i = this.shakes.length - 1; i >= 0; i--) {
      const s = this.shakes[i];
      s.time += dt;
      if (s.time >= s.duration) { this.shakes.splice(i, 1); continue; }
      const k = 1 - s.time / s.duration;
      const decay = k * k;
      dx += (Math.random() - 0.5) * 2 * s.power * decay;
      dy += (Math.random() - 0.5) * 2 * s.power * decay;
      rot += (Math.random() - 0.5) * 0.6 * decay;
    }

    if (this.punch) {
      this.punch.time += dt;
      const k = this.punch.time / this.punch.duration;
      if (k >= 1) {
        this.punch = null;
      } else {
        // Резкий старт, мягкий возврат — пружина без библиотеки.
        scale += this.punch.amount * Math.sin(Math.PI * k) * (1 - k * 0.4);
      }
    }

    if (this.tease && !this.reducedMotion) {
      const p = this.tease.progress;
      const ease = p * p;
      const n = this.tease.rows;
      scale += 0.05 + ease * (0.1 + n * 0.035);
      rot += Math.sin(this.time * 0.02) * ease * (0.4 + n * 0.25);
      originX = 50;
      originY = this.tease.centerY;
      filter = `saturate(${1 + ease * 0.9}) brightness(${1 + ease * 0.22}) hue-rotate(${Math.sin(this.time * 0.006) * 24 * ease}deg)`;
    }

    if (this.stage) {
      this.stage.style.transformOrigin = originX == null ? '' : `${originX}% ${originY}px`;
      this.stage.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) rotate(${rot.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
      this.stage.style.filter = filter;
    }

    if (this.flashEl) {
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
  }
}
