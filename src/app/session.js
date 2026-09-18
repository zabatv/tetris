import { Game, PHASE } from '../core/game.js';
import { HIDDEN_ROWS, ROWS_VISIBLE } from '../core/constants.js';
import { BoardView } from '../render/board-view.js';
import { PreviewView } from '../render/preview.js';
import { Background } from '../render/background.js';
import { Particles, drawSpeedLines } from '../render/particles.js';
import { drawOpponent } from '../render/opponent-view.js';
import { colorOf } from '../render/palette.js';
import { ScreenFX, TimeScale } from '../fx/effects.js';
import { AudioEngine } from '../audio/audio.js';
import { Controls } from '../input/controls.js';
import { Net } from '../net/net.js';

const BEST_KEY = 'tetris.best';
const MADNESS_KEY = 'tetris.madness';
const STATE_INTERVAL = 90;

// Уровни безумия: множитель всех экранных эффектов.
export const MADNESS_LEVELS = [
  { id: 'calm', label: 'СПОКОЙНО', value: 0.45 },
  { id: 'wild', label: 'ЛЮТО', value: 1 },
  { id: 'insane', label: 'БЕЗУМИЕ', value: 1.7 },
];

function loadMadness() {
  try {
    const saved = localStorage.getItem(MADNESS_KEY);
    return MADNESS_LEVELS.find(level => level.id === saved) || MADNESS_LEVELS[1];
  } catch { return MADNESS_LEVELS[1]; }
}

function loadBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}

function saveBest(value) {
  try { localStorage.setItem(BEST_KEY, String(value)); } catch { /* приватный режим */ }
}

/**
 * Связывает правила, картинку, звук и сеть. Интерфейс дергает методы сессии
 * и получает обновления через колбэк — React не лезет в игровой цикл.
 */
export class Session {
  constructor({ refs, onState }) {
    this.refs = refs;
    this.onState = onState || (() => {});
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.game = new Game({ onEvent: (type, payload) => this.handleGameEvent(type, payload) });
    this.boardView = new BoardView(refs.board);
    this.fxCtx = refs.fx.getContext('2d');
    this.nextView = new PreviewView(refs.next, { cell: this.previewCell(), rows: 4 });
    this.holdView = new PreviewView(refs.hold, { cell: this.previewCell() });
    this.background = new Background(refs.background, { reducedMotion: this.reducedMotion });
    this.particles = new Particles();
    this.fx = new ScreenFX({
      stage: refs.stage,
      screen: refs.screen,
      flash: refs.flash,
      textLayer: refs.text,
      floats: refs.floats,
      chroma: refs.chroma,
      glitch: refs.glitch,
      scanlines: refs.scanlines,
      vignette: refs.vignette,
      reducedMotion: this.reducedMotion,
    });
    this.time = new TimeScale();
    this.audio = new AudioEngine();
    this.net = new Net();

    this.paused = false;
    this.started = false;
    this.best = loadBest();
    this.lastFrame = 0;
    this.stateTimer = 0;
    this.softSoundTimer = 0;
    this.frameAvg = 16.7;
    this.quality = 1;
    this.opponentCanvases = new Map();
    this.opponents = [];
    this.lastSummary = null;
    this.madness = loadMadness();
    this.applyMadness();

    this.controls = new Controls(this.actionMap(), { touchTarget: refs.stage });
    this.controls.attach();
    this.bindNet();

    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    this.publish();
  }

  previewCell() {
    const cell = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell')) || 26;
    return cell * 0.62;
  }

  actionMap() {
    return {
      left: () => this.game.move(-1),
      right: () => this.game.move(1),
      soft: () => this.game.softDrop(),
      rotateCW: () => this.game.rotate(1),
      rotateCCW: () => this.game.rotate(-1),
      rotate180: () => this.game.rotate(2),
      hardDrop: () => this.game.hardDrop(),
      hold: () => this.game.holdPiece(),
      pause: () => this.togglePause(),
      restart: () => this.start(),
      mute: () => { this.audio.toggleMuted(); this.publish(); },
    };
  }

  applyMadness() {
    this.fx.setMadness(this.madness.value);
    this.background.setMadness(this.madness.value);
  }

  /** Переключает уровень экранного безумия по кругу. */
  cycleMadness() {
    const index = MADNESS_LEVELS.indexOf(this.madness);
    this.madness = MADNESS_LEVELS[(index + 1) % MADNESS_LEVELS.length];
    try { localStorage.setItem(MADNESS_KEY, this.madness.id); } catch { /* приватный режим */ }
    this.applyMadness();
    this.fx.banner(this.madness.label, 'cool');
    this.publish();
  }

  // --- управление сессией ----------------------------------------------------

  start() {
    this.audio.unlock();
    this.audio.startMusic();
    this.audio.setLevel(1);
    this.particles.clear();
    this.fx.reset();
    this.time.scale = 1;
    this.paused = false;
    this.started = true;
    this.game.start();
    this.publish();
  }

  togglePause() {
    if (!this.started || !this.game.running) return;
    this.paused = !this.paused;
    if (this.paused) this.audio.stopMusic();
    else this.audio.startMusic();
    this.publish();
  }

  setPaused(paused) {
    if (this.paused !== paused) this.togglePause();
  }

  toggleMute() {
    this.audio.unlock();
    this.audio.toggleMuted();
    this.publish();
  }

  toggleMusic() {
    this.audio.unlock();
    const on = this.audio.toggleMusic();
    if (on && this.game.running && !this.paused) this.audio.startMusic();
    this.publish();
  }

  resize() {
    this.boardView.resize();
    this.background.resize();
    this.nextView.rows = window.innerWidth <= 680 ? 3 : 4;
    this.nextView.cellSize = this.previewCell();
    this.holdView.cellSize = this.previewCell();
    this.nextView.resize();
    this.holdView.resize();
    this.resizeFxCanvas();
  }

  resizeFxCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = this.refs.fx;
    canvas.width = Math.round(this.boardView.width * dpr);
    canvas.height = Math.round(this.boardView.height * dpr);
    this.fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.controls.detach();
    this.audio.stopMusic();
    this.net.disconnect();
  }

  // --- сеть ------------------------------------------------------------------

  bindNet() {
    this.net.on('opponents', (list) => { this.opponents = list; this.publish(); });
    this.net.on('attack', ({ lines, from }) => {
      this.game.receiveGarbage(lines);
      this.fx.banner(`${from || 'Соперник'} шлёт ${lines}`, 'hot');
    });
    this.net.on('opponentTetris', ({ nick }) => this.fx.banner(`${nick} — ТЕТРИС!`, 'cool'));
    this.net.on('opponentOut', ({ nick }) => this.fx.banner(`${nick} выбыл`, 'hot'));
  }

  registerOpponentCanvas(id, canvas) {
    if (canvas) this.opponentCanvases.set(id, canvas);
    else this.opponentCanvases.delete(id);
  }

  // --- события игры ----------------------------------------------------------

  handleGameEvent(type, payload) {
    const cell = this.boardView.cell;
    const toScreen = (col, row) => [col * cell + cell / 2, (row - HIDDEN_ROWS) * cell + cell / 2];

    switch (type) {
      case 'move':
        this.audio.move();
        break;

      case 'rotate': {
        this.audio.rotate();
        if (this.game.piece) {
          const [x, y] = toScreen(this.game.piece.x + 1.5, this.game.piece.y + 1.5);
          this.particles.dust(x, y, colorOf(this.game.piece.id), 3);
        }
        break;
      }

      case 'softdrop':
        // Звук софт-дропа при автоповторе сыпался бы каждые 28 мс — прореживаем.
        if (performance.now() - this.softSoundTimer > 70) {
          this.softSoundTimer = performance.now();
          this.audio.soft();
        }
        break;

      case 'hold':
        this.audio.hold();
        break;

      case 'harddrop': {
        const { distance, cells } = payload;
        const id = this.game.piece ? this.game.piece.id : 1;
        this.audio.hardDrop(distance);
        for (const [col, row] of cells) {
          const [x, y] = toScreen(col, row);
          this.particles.streak(x, y - cell, colorOf(id), Math.min(220, distance * cell));
          this.particles.dust(x, y, colorOf(id), 3);
          this.particles.spark(x, y + cell * 0.4, colorOf(id), 4, 0.3);
        }
        // Удар о дно: стоп-кадр, тряска и лучи по краям.
        this.time.freeze(18 + Math.min(40, distance * 2.5));
        this.fx.shake(4 + distance * 0.8, 260);
        this.fx.zoomPunch(0.03 + distance * 0.006, 260);
        this.fx.speed(0.35 + distance * 0.05, 0.004);
        if (distance >= 8) this.fx.chromatic(260);
        if (distance >= 14) this.fx.glitch(220, 0.6);
        break;
      }

      case 'lock': {
        this.audio.lock();
        for (const [col, row] of payload.cells) {
          const [x, y] = toScreen(col, row);
          this.particles.dust(x, y + cell * 0.4, colorOf(payload.piece.id), 2);
        }
        this.fx.shake(3, 150);
        if (payload.spin !== 'none') {
          // Спин без слома тоже надо заметить.
          this.fx.hueBurst(180, 500);
          this.fx.chromatic(200);
          this.particles.ring(this.boardView.width / 2, (payload.cells[0][1] - HIDDEN_ROWS) * cell, '#c084fc', { growth: 0.6, width: 3 });
        }
        break;
      }

      case 'clearstart': {
        const { rows, cleared, spin, duration } = payload;
        const heavy = cleared >= 3 || spin !== 'none';
        // Время почти встаёт: дальше всё держится на картинке и звуке.
        this.time.slow(duration + 260, heavy ? 0.05 : 0.12);
        this.audio.riser(duration / 1000, cleared);
        const centerY = (rows[0] - HIDDEN_ROWS + rows.length / 2) * cell;
        this.teaseCenter = centerY;
        this.fx.speed(0.6 + cleared * 0.25, 0.0012);
        this.fx.chromatic(duration);
        this.background.pulse(0.5 + cleared * 0.25);
        this.background.burst(0.5 + cleared * 0.35, cleared * 0.5);
        for (const row of rows) {
          const y = (row - HIDDEN_ROWS + 0.5) * cell;
          this.particles.rowBlast(y, this.boardView.width, '#ffffff', 12 + cleared * 6);
          this.particles.bolt(0, y, this.boardView.width, y + (Math.random() - 0.5) * cell, '#ffffff', 10);
        }
        break;
      }

      case 'clear':
        this.onClear(payload, cell);
        break;

      case 'levelup':
        this.audio.levelUp();
        this.audio.setLevel(payload.level);
        this.fx.banner(`УРОВЕНЬ ${payload.level}`, 'cool');
        this.fx.flash('rgba(34,211,238,0.5)', 320);
        this.fx.hueBurst(540, 1200);
        this.fx.zoomPunch(0.1, 520);
        this.fx.shake(7, 420);
        this.fx.glitch(420, 0.9);
        this.background.pulse(1.4);
        this.background.burst(1.4, 1.6);
        this.particles.firework(this.boardView.width / 2, this.boardView.height / 2, 60);
        this.particles.confetti(this.boardView.width / 2, this.boardView.height * 0.3, 40, 1.4);
        break;

      case 'garbage':
        this.audio.garbage(payload.count);
        this.fx.shake(4 + payload.count * 1.5, 320);
        this.fx.flash('rgba(251,113,133,0.3)', 260);
        this.fx.glitch(260, 0.7);
        this.fx.hueBurst(-120, 420);
        for (let i = 0; i < payload.count; i++) {
          const y = this.boardView.height - (i + 0.5) * cell;
          this.particles.spark(Math.random() * this.boardView.width, y, '#fb7185', 8, 0.4);
        }
        break;

      case 'incoming':
        if (payload.pending >= 4) {
          this.fx.banner(`ВХОДЯЩИЕ ${payload.pending}`, 'hot');
          this.fx.chromatic(200);
        }
        break;

      case 'gameover':
        this.onGameOver(payload);
        break;
    }
    this.publish();
  }

  onClear(payload, cell) {
    const { rows, cleared, spin, points, label, perfect, b2b, combo, attack } = payload;
    const centerY = (rows[0] - HIDDEN_ROWS + rows.length / 2) * cell;
    const centerX = this.boardView.width / 2;
    const heavy = cleared >= 3 || spin !== 'none' || perfect;
    const weight = cleared + (spin !== 'none' ? 2 : 0) + (perfect ? 3 : 0) + Math.min(4, combo);

    this.audio.clear(cleared, spin, perfect);
    if (combo > 0) this.audio.combo(combo);

    // Момент удара: время встаёт, картинку рвёт, потом всё отпускает.
    this.fx.setTease(null);
    this.time.release();
    this.time.freeze(60 + weight * 14);
    this.time.slow(220 + weight * 40, 0.35);

    this.fx.flash(perfect ? 'rgba(255,255,255,0.95)' : heavy ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.45)', 200 + weight * 30);
    this.fx.shake(8 + weight * 3.2, 420 + weight * 30);
    this.fx.zoomPunch(0.08 + weight * 0.035, 460);
    this.fx.zoom(-0.06 - weight * 0.012, 700, 0.25);
    this.fx.chromatic(280 + weight * 40);
    this.fx.glitch(300 + weight * 60, 0.8 + weight * 0.18);
    this.fx.hueBurst(180 + weight * 90, 700 + weight * 80);
    this.fx.speed(0.8 + weight * 0.18, 0.0035);

    this.fx.banner(label, perfect ? 'gold' : spin !== 'none' ? 'cool' : cleared === 4 ? 'gold' : 'normal');
    if (b2b) this.fx.banner('BACK-TO-BACK', 'cool');
    if (combo > 0) this.fx.banner(`КОМБО ×${combo}`, combo >= 4 ? 'hot' : 'gold');
    this.fx.floatText(centerX, centerY, `+${points}`, heavy ? 'gold' : 'normal');

    for (const row of rows) {
      const y = (row - HIDDEN_ROWS + 0.5) * cell;
      this.particles.rowBlast(y, this.boardView.width, heavy ? '#ffd24a' : '#22d3ee', 26 + weight * 8);
      for (let i = 0; i < 6 + weight * 3; i++) {
        this.particles.shards(Math.random() * this.boardView.width, y, heavy ? '#ffd24a' : '#22d3ee', 3, cell);
      }
      this.particles.bolt(0, y, this.boardView.width, y, '#ffffff', 12);
      this.particles.ring(centerX, y, heavy ? '#ffd24a' : '#22d3ee', { growth: 0.9, width: 3 });
    }

    this.particles.confetti(centerX, centerY, 30 + weight * 12, 1 + weight * 0.12);
    this.particles.ring(centerX, centerY, '#ffffff', { growth: 1.2 + weight * 0.2, width: 4 + weight });
    if (heavy) {
      this.particles.firework(centerX, centerY, 50 + weight * 10);
      this.particles.ring(centerX, centerY, '#c084fc', { growth: 0.6, width: 3 });
      // Серия салютов вдогонку — праздник длится дольше одного кадра.
      for (let i = 1; i <= Math.min(4, weight); i++) {
        setTimeout(() => this.particles.firework(
          Math.random() * this.boardView.width,
          this.boardView.height * (0.2 + Math.random() * 0.5),
          34,
        ), i * 130);
      }
    }
    this.background.pulse(0.8 + weight * 0.3);
    this.background.burst(0.6 + weight * 0.25, 0.8 + weight * 0.3);

    if (attack > 0) {
      this.net.sendAttack(attack);
      this.fx.floatText(centerX, centerY - cell * 2, `АТАКА ${attack}`, 'hot');
    }
  }

  onGameOver(payload) {
    this.audio.gameOver();
    this.audio.stopMusic();
    this.time.freeze(140);
    this.time.slow(2200, 0.1);
    this.fx.shake(22, 900);
    this.fx.chromatic(900);
    this.fx.glitch(1400, 1.6);
    this.fx.hueBurst(900, 1800);
    this.fx.zoom(-0.18, 1600, 0.2);
    this.fx.flash('rgba(251,113,133,0.6)', 700);
    this.fx.speed(1.2, 0.0009);
    this.background.pulse(2);
    this.background.burst(2, 2);
    for (let i = 0; i < 40; i++) {
      this.particles.shards(
        Math.random() * this.boardView.width,
        Math.random() * this.boardView.height,
        '#fb7185', 3, this.boardView.cell,
      );
    }
    this.particles.confetti(this.boardView.width / 2, this.boardView.height / 2, 60, 1.6);
    for (let i = 0; i < 6; i++) {
      this.particles.bolt(
        Math.random() * this.boardView.width, 0,
        Math.random() * this.boardView.width, this.boardView.height,
        '#fb7185', 14,
      );
    }
    if (payload.score > this.best) {
      this.best = payload.score;
      saveBest(this.best);
      this.fx.banner('НОВЫЙ РЕКОРД', 'gold');
      this.particles.firework(this.boardView.width / 2, this.boardView.height * 0.35, 80);
    }
    this.lastSummary = { ...payload, best: this.best };
  }

  // --- цикл ------------------------------------------------------------------

  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = this.lastFrame ? Math.min(now - this.lastFrame, 100) : 16;
    this.lastFrame = now;

    this.tuneQuality(dt);
    const scale = this.time.update(dt);
    const active = this.started && this.game.running && !this.paused;

    if (active) {
      this.controls.update(dt);
      // Слоу-мо замедляет игру, но не кинематику слома: её длительность —
      // это реальные секунды, иначе тизер растянулся бы на полминуты.
      this.game.update(this.game.phase === PHASE.CLEARING ? dt : dt * scale);
    }

    // Фоновое безумие: комбо, уровень и близость завала к верху.
    const danger = Math.max(0, (this.game.stackHeight - ROWS_VISIBLE * 0.6) / (ROWS_VISIBLE * 0.4));
    const ambient = this.game.running
      ? Math.min(1, Math.max(0, this.game.combo - 1) * 0.14 + (this.game.level - 1) * 0.045 + danger * 0.45 + this.game.b2bChain * 0.08)
      : 0;
    this.fx.setAmbient(ambient);
    this.background.setIntensity(ambient);

    // Тизер перед сломом ведём вручную: камера смотрит на ряды, которые уйдут.
    if (this.game.phase === PHASE.CLEARING && this.game.clearInfo) {
      const progress = 1 - Math.max(0, this.game.clearTimer) / this.game.clearInfo.duration;
      this.fx.setTease(progress, this.game.clearInfo.rows.length, this.teaseCenter || 0);
    } else if (this.fx.tease) {
      this.fx.setTease(null);
    }

    // Частицы почти не тормозят вместе с игрой — иначе слоу-мо выглядит мёртвым.
    this.particles.update(dt, 0.45 + scale * 0.55);
    this.fx.update(dt);
    this.background.render(dt, { level: this.game.level });

    this.boardView.time = now;
    this.boardView.render(this.game, {
      time: now,
      warp: (this.fx.tease ? Math.pow(this.fx.tease.progress, 2) * 1.2 : 0) + ambient * 0.25,
    });

    this.fxCtx.clearRect(0, 0, this.boardView.width, this.boardView.height);
    drawSpeedLines(this.fxCtx, {
      strength: this.fx.speedLines,
      width: this.boardView.width,
      height: this.boardView.height,
      focusY: this.fx.tease ? this.teaseCenter : null,
      time: now,
    });
    this.particles.render(this.fxCtx);

    this.nextView.renderQueue(this.game.nextQueue);
    if (this.game.hold) this.holdView.renderSingle(this.game.hold);
    else if (this.holdView.signature !== 'empty') { this.holdView.clear(); this.holdView.signature = 'empty'; }

    this.renderOpponents(now);
    this.syncStageClasses();

    if (active) {
      this.stateTimer += dt;
      if (this.stateTimer >= STATE_INTERVAL) {
        this.stateTimer = 0;
        this.net.sendState(this.game.snapshot());
      }
    }
  }

  /**
   * Следим за длительностью кадра и мягко снижаем нагрузку, если машина
   * не тянет: эффекты остаются, но становятся дешевле.
   */
  tuneQuality(dt) {
    this.frameAvg += (Math.min(dt, 120) - this.frameAvg) * 0.05;
    const target = this.frameAvg > 30 ? -1 : this.frameAvg < 20 ? 1 : 0;
    if (target) {
      this.quality = Math.max(0, Math.min(1, this.quality + target * 0.004));
      this.fx.setQuality(this.quality);
      this.background.setQuality(this.quality);
      this.particles.limit = 260 + Math.round(this.quality * 740);
    }
  }

  renderOpponents(now) {
    for (const opp of this.opponents) {
      const canvas = this.opponentCanvases.get(opp.id);
      if (canvas) drawOpponent(canvas.getContext('2d'), opp, now);
    }
  }

  syncStageClasses() {
    const stage = this.refs.stage;
    if (!stage) return;
    const danger = this.game.running && this.game.stackHeight > ROWS_VISIBLE * 0.75;
    stage.classList.toggle('is-danger', danger);
    stage.classList.toggle('is-paused', this.paused);
  }

  /** Срез состояния для интерфейса. Повторы отсекаем — React лишний раз не дёргаем. */
  publish() {
    const next = {
      phase: this.game.phase,
      started: this.started,
      paused: this.paused,
      score: this.game.score,
      lines: this.game.lines,
      level: this.game.level,
      combo: Math.max(0, this.game.combo - 1),
      b2b: this.game.b2bChain,
      pending: this.game.pendingGarbage,
      hold: this.game.hold,
      holdLocked: this.game.holdLocked,
      best: this.best,
      muted: this.audio.muted,
      music: this.audio.musicEnabled,
      madness: this.madness.id,
      madnessLabel: this.madness.label,
      opponents: this.opponents,
      summary: this.lastSummary,
      levelProgress: (this.game.lines % 10) / 10,
    };
    if (this.lastPublished && Object.keys(next).every(key => next[key] === this.lastPublished[key])) return;
    this.lastPublished = next;
    this.onState(next);
  }
}
