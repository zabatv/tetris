/**
 * Синтезированный звук: сэмплов нет, всё считается на лету через Web Audio.
 * Контекст создаётся только после жеста пользователя — иначе браузер его не пустит.
 */

const STORAGE_KEY = 'tetris.audio';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.musicEnabled = true;
    this.volume = 0.6;
    this.step = 0;
    this.nextNoteTime = 0;
    this.timer = null;
    this.tempo = 128;
    this.level = 1;
    this.restore();
  }

  restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (typeof saved.muted === 'boolean') this.muted = saved.muted;
      if (typeof saved.music === 'boolean') this.musicEnabled = saved.music;
      if (typeof saved.volume === 'number') this.volume = saved.volume;
    } catch { /* приватный режим — просто играем со значениями по умолчанию */ }
  }

  persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        muted: this.muted, music: this.musicEnabled, volume: this.volume,
      }));
    } catch { /* ничего страшного */ }
  }

  /** Вызывается из обработчика клика/клавиши. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;

    // Лёгкая компрессия, чтобы залпы эффектов не перегружали выход.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicEnabled ? 0.34 : 0;
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 1;

    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    return true;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : this.volume;
    this.persist();
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMusicEnabled(on) {
    this.musicEnabled = on;
    if (this.musicGain) this.musicGain.gain.value = on ? 0.34 : 0;
    this.persist();
  }

  toggleMusic() {
    this.setMusicEnabled(!this.musicEnabled);
    return this.musicEnabled;
  }

  // --- примитивы -------------------------------------------------------------

  tone(freq, dur, { type = 'square', gain = 0.12, when = 0, slideTo = 0, bus = null } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env);
    env.connect(bus || this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.04);
  }

  noise(dur, { gain = 0.3, type = 'lowpass', from = 2200, to = 200, when = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter); filter.connect(env); env.connect(this.sfxGain);
    src.start(t);
  }

  thump(dur = 0.25, gain = 0.5, freq = 160) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + dur);
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env); env.connect(this.sfxGain);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  // --- звуки событий ---------------------------------------------------------

  move() { this.tone(240, 0.045, { gain: 0.05, type: 'square' }); }
  rotate() { this.tone(380, 0.05, { gain: 0.07 }); this.tone(560, 0.05, { gain: 0.05, type: 'triangle', when: 0.02 }); }
  soft() { this.tone(180, 0.035, { gain: 0.04, type: 'sine' }); }
  hold() { this.tone(520, 0.08, { gain: 0.09, type: 'triangle', slideTo: 760 }); }

  lock() {
    this.noise(0.1, { gain: 0.16, from: 900, to: 140 });
    this.thump(0.14, 0.28, 140);
  }

  hardDrop(distance = 10) {
    this.noise(0.26, { gain: 0.3, type: 'bandpass', from: 320, to: 2600 });
    this.tone(760, 0.16, { gain: 0.1, type: 'sawtooth', slideTo: 90 });
    this.thump(0.22, 0.34, 110 + Math.min(60, distance * 3));
  }

  /** Нарастающий «риск» — звучит, пока идёт замедление перед сломом. */
  riser(duration = 0.6, rows = 1) {
    this.tone(180, duration, { gain: 0.05 + rows * 0.015, type: 'sawtooth', slideTo: 900 + rows * 260 });
    this.noise(duration, { gain: 0.1, type: 'highpass', from: 400, to: 5200 });
  }

  clear(count, spin = 'none', perfect = false) {
    const root = spin !== 'none' ? 392 : 330;
    for (let i = 0; i < count; i++) {
      this.tone(root * Math.pow(1.26, i), 0.14, { gain: 0.11, type: 'square', when: i * 0.06 });
    }
    if (count >= 2) { this.noise(0.2, { gain: 0.22, type: 'highpass', from: 800, to: 3600 }); this.thump(0.3, 0.3, 90); }
    if (count === 4 || spin !== 'none') {
      this.tone(880, 0.45, { gain: 0.13, type: 'sawtooth', slideTo: 1760 });
      this.noise(0.6, { gain: 0.3, type: 'bandpass', from: 180, to: 3000 });
      this.thump(0.7, 0.55, 200);
    }
    if (perfect) [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, { gain: 0.13, type: 'triangle', when: i * 0.08 }));
  }

  combo(n) { this.tone(480 + n * 70, 0.12, { gain: 0.13, type: 'triangle' }); }
  levelUp() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, { gain: 0.14, type: 'triangle', when: i * 0.08 })); }
  garbage(count) { this.noise(0.22, { gain: 0.2, from: 700, to: 90 }); this.thump(0.3, 0.3, 80 + count * 6); }
  gameOver() {
    [392, 330, 262, 196, 147].forEach((f, i) => this.tone(f, 0.4, { gain: 0.14, type: 'sawtooth', when: i * 0.16 }));
    this.noise(0.9, { gain: 0.22, from: 1400, to: 80 });
  }

  // --- музыка ----------------------------------------------------------------

  // Прогрессия аккордов; шаг секвенсора — шестнадцатая.
  static get PROGRESSION() {
    return [
      [220.00, 261.63, 329.63],
      [196.00, 246.94, 293.66],
      [174.61, 220.00, 261.63],
      [196.00, 246.94, 311.13],
    ];
  }

  startMusic() {
    if (!this.ctx || this.timer) return;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    // Планировщик с запасом: setInterval неточен, ноты ставим по времени контекста.
    this.timer = setInterval(() => this.scheduleAhead(), 25);
  }

  stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  setLevel(level) {
    this.level = level;
    this.tempo = 120 + Math.min(60, (level - 1) * 5);
  }

  scheduleAhead() {
    if (!this.ctx) return;
    const stepDuration = 60 / this.tempo / 4;
    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this.scheduleStep(this.step, this.nextNoteTime);
      this.nextNoteTime += stepDuration;
      this.step = (this.step + 1) % 64;
    }
  }

  scheduleStep(step, time) {
    if (!this.musicEnabled || this.muted) return;
    const bar = Math.floor(step / 16) % AudioEngine.PROGRESSION.length;
    const chord = AudioEngine.PROGRESSION[bar];
    const beat = step % 16;
    const when = time - this.ctx.currentTime;
    if (when < 0) return;

    if (beat % 4 === 0) {
      this.tone(chord[0] / 2, 0.22, { type: 'triangle', gain: 0.2, when, bus: this.musicGain });
    }
    // Арпеджио: на высоких уровнях нот больше — темп чувствуется физически.
    const density = this.level >= 6 ? 2 : 4;
    if (beat % density === 0) {
      const note = chord[(beat / density) % chord.length] * 2;
      this.tone(note, 0.12, { type: 'square', gain: 0.055, when, bus: this.musicGain });
    }
    if (beat === 4 || beat === 12) {
      this.tone(1800, 0.03, { type: 'square', gain: 0.02, when, bus: this.musicGain });
    }
  }
}
