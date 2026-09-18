import { Game, PHASE } from '../core/game.js';
import { HIDDEN_ROWS, ROWS_VISIBLE } from '../core/constants.js';
import { BoardView } from '../render/board-view.js';
import { PreviewView } from '../render/preview.js';
import { Background } from '../render/background.js';
import { Particles } from '../render/particles.js';
import { drawOpponent } from '../render/opponent-view.js';
import { colorOf } from '../render/palette.js';
import { ScreenFX, TimeScale } from '../fx/effects.js';
import { AudioEngine } from '../audio/audio.js';
import { Controls } from '../input/controls.js';
import { Net } from '../net/net.js';

const BEST_KEY = 'tetris.best';
const STATE_INTERVAL = 90;

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
      flash: refs.flash,
      textLayer: refs.text,
      floats: refs.floats,
      chroma: refs.chroma,
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
    this.opponentCanvases = new Map();
    this.opponents = [];
    this.lastSummary = null;

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
        this.audio.hardDrop(distance);
        for (const [col, row] of cells) {
          const [x, y] = toScreen(col, row);
          this.particles.streak(x, y - cell, colorOf(this.game.piece ? this.game.piece.id : 1), Math.min(140, distance * cell));
          this.particles.dust(x, y, colorOf(this.game.piece ? this.game.piece.id : 1), 2);
        }
        this.fx.shake(Math.min(9, 2 + distance * 0.45), 220);
        this.fx.zoomPunch(Math.min(0.04, 0.012 + distance * 0.002), 240);
        if (distance >= 12) this.fx.chromatic(240);
        break;
      }

      case 'lock': {
        this.audio.lock();
        for (const [col, row] of payload.cells) {
          const [x, y] = toScreen(col, row);
          this.particles.dust(x, y + cell * 0.4, colorOf(payload.piece.id), 2);
        }
        this.fx.shake(2.5, 140);
        break;
      }

      case 'clearstart': {
        const { rows, cleared, duration } = payload;
        // Замедление + наезд камеры: момент слома читается как событие.
        this.time.slow(duration + 200, cleared >= 3 ? 0.16 : 0.26);
        this.audio.riser(duration / 1000, cleared);
        const centerY = (rows[0] - HIDDEN_ROWS + rows.length / 2) * cell;
        this.teaseCenter = centerY;
        this.background.pulse(0.4 + cleared * 0.2);
        for (const row of rows) {
          this.particles.rowBlast((row - HIDDEN_ROWS + 0.5) * cell, this.boardView.width, '#ffffff', 10 + cleared * 4);
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
        this.fx.flash('rgba(34,211,238,0.35)', 260);
        this.background.pulse(1.1);
        break;

      case 'garbage':
        this.audio.garbage(payload.count);
        this.fx.shake(3 + payload.count, 260);
        this.fx.flash('rgba(251,113,133,0.22)', 220);
        break;

      case 'incoming':
        if (payload.pending >= 4) this.fx.banner(`ВХОДЯЩИЕ ${payload.pending}`, 'hot');
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
    const big = cleared >= 3 || spin !== 'none' || perfect;

    this.audio.clear(cleared, spin, perfect);
    if (combo > 0) this.audio.combo(combo);

    this.fx.setTease(null);
    this.fx.flash(perfect ? 'rgba(255,255,255,0.75)' : big ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.28)', big ? 320 : 200);
    this.fx.shake(4 + cleared * 3 + (big ? 4 : 0), 340);
    this.fx.zoomPunch(0.03 + cleared * 0.018, 380);
    if (big) this.fx.chromatic(320);
    this.fx.banner(label, perfect ? 'gold' : spin !== 'none' ? 'cool' : cleared === 4 ? 'gold' : 'normal');
    if (b2b) this.fx.banner('BACK-TO-BACK', 'cool');
    if (combo > 0) this.fx.banner(`КОМБО ×${combo}`, combo >= 4 ? 'hot' : 'gold');
    this.fx.floatText(centerX, centerY, `+${points}`, big ? 'gold' : 'normal');

    for (const row of rows) {
      const y = (row - HIDDEN_ROWS + 0.5) * cell;
      this.particles.rowBlast(y, this.boardView.width, big ? '#ffd24a' : '#22d3ee', 18 + cleared * 6);
      for (let i = 0; i < 4 + cleared * 2; i++) {
        this.particles.shards(Math.random() * this.boardView.width, y, big ? '#ffd24a' : '#22d3ee', 2, cell);
      }
    }
    this.particles.ring(centerX, centerY, big ? '#ffd24a' : '#22d3ee', { growth: 0.7 + cleared * 0.15, width: 3 + cleared });
    if (big) this.particles.ring(centerX, centerY, '#c084fc', { growth: 0.45, width: 2 });
    this.background.pulse(0.6 + cleared * 0.35);

    if (attack > 0) {
      this.net.sendAttack(attack);
      this.fx.floatText(centerX, centerY - cell * 2, `АТАКА ${attack}`, 'hot');
    }
  }

  onGameOver(payload) {
    this.audio.gameOver();
    this.audio.stopMusic();
    this.fx.shake(14, 700);
    this.fx.chromatic(600);
    this.fx.flash('rgba(251,113,133,0.4)', 600);
    this.background.pulse(1.6);
    for (let i = 0; i < 24; i++) {
      this.particles.shards(
        Math.random() * this.boardView.width,
        Math.random() * this.boardView.height,
        '#fb7185', 3, this.boardView.cell,
      );
    }
    if (payload.score > this.best) {
      this.best = payload.score;
      saveBest(this.best);
      this.fx.banner('НОВЫЙ РЕКОРД', 'gold');
    }
    this.lastSummary = { ...payload, best: this.best };
  }

  // --- цикл ------------------------------------------------------------------

  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = this.lastFrame ? Math.min(now - this.lastFrame, 100) : 16;
    this.lastFrame = now;

    const scale = this.time.update(dt);
    const active = this.started && this.game.running && !this.paused;

    if (active) {
      this.controls.update(dt);
      this.game.update(dt * scale);
    }

    // Тизер перед сломом ведём вручную: камера смотрит на ряды, которые уйдут.
    if (this.game.phase === PHASE.CLEARING && this.game.clearInfo) {
      const progress = 1 - Math.max(0, this.game.clearTimer) / this.game.clearInfo.duration;
      this.fx.setTease(progress, this.game.clearInfo.rows.length, this.teaseCenter || 0);
    } else if (this.fx.tease) {
      this.fx.setTease(null);
    }

    this.particles.update(dt, 0.35 + scale * 0.65);
    this.fx.update(dt);
    this.background.render(dt, { level: this.game.level });

    this.boardView.time = now;
    this.boardView.render(this.game, { time: now });

    this.fxCtx.clearRect(0, 0, this.boardView.width, this.boardView.height);
    this.particles.render(this.fxCtx);

    this.nextView.renderQueue(this.game.nextQueue);
    if (this.game.hold) this.holdView.renderSingle(this.game.hold);
    else this.holdView.clear();

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
      opponents: this.opponents,
      summary: this.lastSummary,
      levelProgress: (this.game.lines % 10) / 10,
    };
    if (this.lastPublished && Object.keys(next).every(key => next[key] === this.lastPublished[key])) return;
    this.lastPublished = next;
    this.onState(next);
  }
}
