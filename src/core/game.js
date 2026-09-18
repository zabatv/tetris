import {
  COLS, ROWS, HIDDEN_ROWS, LOCK_DELAY, MAX_LOCK_RESETS, SPAWN_DELAY,
  CLEAR_DELAY_BASE, CLEAR_DELAY_PER_ROW, gravityFor,
} from './constants.js';
import { Bag } from './bag.js';
import { shapeOf, spawnPiece, kicksFor, cellsOf } from './pieces.js';
import {
  createBoard, collides, merge, dropDistance, fullRows, clearRows,
  isEmpty, addGarbage, stackHeight,
} from './board.js';
import { detectSpin, scoreClear, attackLines, isB2BClear, levelForLines } from './scoring.js';
import { systemRandom } from './rng.js';

export const PHASE = {
  IDLE: 'idle',
  ENTRY: 'entry',
  FALLING: 'falling',
  CLEARING: 'clearing',
  OVER: 'over',
};

const NEXT_COUNT = 5;

/**
 * Правила тетриса без единой ссылки на DOM: состояние + события.
 * Отрисовка, звук и сеть подписываются на события и ничего не меняют внутри.
 */
export class Game {
  constructor({ random = systemRandom, onEvent = () => {} } = {}) {
    this.random = random;
    this.onEvent = onEvent;
    this.bag = new Bag(random);
    this.board = createBoard();
    this.reset();
  }

  reset() {
    this.bag.reset();
    this.board = createBoard();
    this.piece = null;
    this.hold = null;
    this.holdLocked = false;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = 0;
    this.maxCombo = 0;
    this.b2b = false;
    this.b2bChain = 0;
    this.piecesPlaced = 0;
    this.phase = PHASE.IDLE;
    this.gravityTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.grounded = false;
    this.entryTimer = 0;
    this.clearTimer = 0;
    this.clearInfo = null;
    this.pendingGarbage = 0;
    this.lastKickIndex = 0;
    this.lastActionWasRotation = false;
    this.startedAt = 0;
    this.elapsed = 0;
  }

  emit(type, payload) {
    this.onEvent(type, payload || {});
  }

  start() {
    this.reset();
    this.phase = PHASE.ENTRY;
    this.entryTimer = 0;
    this.emit('start', {});
    this.spawn();
  }

  get running() {
    return this.phase !== PHASE.IDLE && this.phase !== PHASE.OVER;
  }

  get nextQueue() {
    return this.bag.peek(NEXT_COUNT);
  }

  get gravityInterval() {
    return gravityFor(this.level);
  }

  /** Куда упадёт фигура при хард-дропе. */
  get ghostY() {
    if (!this.piece) return 0;
    return this.piece.y + dropDistance(this.board, this.piece);
  }

  get stackHeight() {
    return stackHeight(this.board);
  }

  // --- жизненный цикл фигуры -------------------------------------------------

  spawn(id = null) {
    const pieceId = id == null ? this.bag.take() : id;
    const piece = spawnPiece(pieceId);
    piece.y = HIDDEN_ROWS - 2;
    this.piece = piece;
    this.grounded = false;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.gravityTimer = 0;
    this.lastActionWasRotation = false;
    this.lastKickIndex = 0;
    this.phase = PHASE.FALLING;

    if (collides(this.board, piece)) {
      // Пытаемся приподнять фигуру в буфер — иначе это конец.
      piece.y -= 1;
      if (collides(this.board, piece)) {
        this.piece = piece;
        this.gameOver();
        return false;
      }
    }
    this.emit('spawn', { piece: this.snapshotPiece(), next: this.nextQueue.slice() });
    return true;
  }

  snapshotPiece() {
    if (!this.piece) return null;
    const p = this.piece;
    return { id: p.id, x: p.x, y: p.y, rotation: p.rotation, shape: p.shape.map(r => r.slice()) };
  }

  gameOver() {
    if (this.phase === PHASE.OVER) return;
    this.phase = PHASE.OVER;
    this.emit('gameover', {
      score: this.score,
      lines: this.lines,
      level: this.level,
      maxCombo: this.maxCombo,
      pieces: this.piecesPlaced,
      time: this.elapsed,
    });
  }

  // --- управление ------------------------------------------------------------

  move(dx) {
    if (this.phase !== PHASE.FALLING || !this.piece) return false;
    const moved = { ...this.piece, x: this.piece.x + dx };
    if (collides(this.board, moved)) return false;
    this.piece.x += dx;
    this.lastActionWasRotation = false;
    this.onPieceMoved();
    this.emit('move', { dx });
    return true;
  }

  rotate(dir = 1) {
    if (this.phase !== PHASE.FALLING || !this.piece) return false;
    const from = this.piece.rotation;
    const to = (((from + dir) % 4) + 4) % 4;
    const shape = shapeOf(this.piece.id, to);
    const kicks = kicksFor(this.piece.id, from, to);
    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i];
      // В таблицах SRS ось Y направлена вверх, у поля — вниз.
      const candidate = { ...this.piece, shape, rotation: to, x: this.piece.x + kx, y: this.piece.y - ky };
      if (!collides(this.board, candidate)) {
        this.piece.shape = shape;
        this.piece.rotation = to;
        this.piece.x = candidate.x;
        this.piece.y = candidate.y;
        this.lastActionWasRotation = true;
        this.lastKickIndex = i;
        this.onPieceMoved();
        this.emit('rotate', { dir, kick: i });
        return true;
      }
    }
    return false;
  }

  /** Сбрасывает таймер приземления — фигуру можно доводить до места. */
  onPieceMoved() {
    const grounded = collides(this.board, { ...this.piece, y: this.piece.y + 1 });
    if (this.grounded && grounded && this.lockResets < MAX_LOCK_RESETS) {
      this.lockResets++;
      this.lockTimer = 0;
    }
    this.grounded = grounded;
    if (!grounded) this.lockTimer = 0;
  }

  softDrop() {
    if (this.phase !== PHASE.FALLING || !this.piece) return false;
    if (collides(this.board, { ...this.piece, y: this.piece.y + 1 })) {
      this.grounded = true;
      return false;
    }
    this.piece.y++;
    this.score += 1;
    this.gravityTimer = 0;
    this.lastActionWasRotation = false;
    this.grounded = collides(this.board, { ...this.piece, y: this.piece.y + 1 });
    this.emit('softdrop', {});
    return true;
  }

  hardDrop() {
    if (this.phase !== PHASE.FALLING || !this.piece) return false;
    const distance = dropDistance(this.board, this.piece);
    const from = { x: this.piece.x, y: this.piece.y };
    this.piece.y += distance;
    this.score += distance * 2;
    // Настоящий спин заканчивается там, где поворот и поставил фигуру:
    // если после него ещё было куда падать, это уже не спин.
    if (distance > 0) this.lastActionWasRotation = false;
    this.emit('harddrop', { distance, from, cells: cellsOf(this.piece) });
    this.lock();
    return true;
  }

  holdPiece() {
    if (this.phase !== PHASE.FALLING || !this.piece || this.holdLocked) return false;
    const current = this.piece.id;
    const swap = this.hold;
    this.hold = current;
    this.holdLocked = true;
    this.emit('hold', { id: current, swap });
    this.spawn(swap == null ? null : swap);
    return true;
  }

  // --- приземление и слом ----------------------------------------------------

  lock() {
    const spin = detectSpin(this.board, this.piece, this.lastActionWasRotation, this.lastKickIndex);
    const cells = cellsOf(this.piece);
    merge(this.board, this.piece);
    // Lock out: фигура целиком осталась в скрытом буфере — стакан переполнен.
    if (cells.every(([, y]) => y < HIDDEN_ROWS)) {
      this.piece = null;
      this.gameOver();
      return;
    }
    this.piecesPlaced++;
    this.holdLocked = false;
    this.emit('lock', { piece: this.snapshotPiece(), cells, spin });

    const rows = fullRows(this.board);
    this.piece = null;

    if (rows.length) {
      const duration = CLEAR_DELAY_BASE + rows.length * CLEAR_DELAY_PER_ROW;
      this.clearInfo = { rows, spin, duration };
      this.clearTimer = duration;
      this.phase = PHASE.CLEARING;
      this.emit('clearstart', { rows: rows.slice(), cleared: rows.length, spin, duration });
      return;
    }

    // Без слома серия комбо обрывается, а мусор от соперников падает в стакан.
    if (this.combo > 0) this.emit('combobreak', { combo: this.combo });
    this.combo = 0;
    if (spin !== 'none') this.emit('spin', { spin, cleared: 0 });
    this.applyPendingGarbage();
    this.beginEntry();
  }

  commitClear() {
    const { rows, spin } = this.clearInfo;
    const cleared = rows.length;
    clearRows(this.board, rows);
    const perfect = isEmpty(this.board);

    const keepsB2B = isB2BClear(cleared, spin);
    const { points, b2b, label } = scoreClear({
      cleared, spin, level: this.level, combo: this.combo, b2bActive: this.b2b, perfect,
    });
    const attack = attackLines({ cleared, spin, combo: this.combo, b2b, perfect });

    this.score += points;
    this.lines += cleared;
    this.combo++;
    if (this.combo - 1 > this.maxCombo) this.maxCombo = this.combo - 1;
    this.b2bChain = keepsB2B ? this.b2bChain + 1 : 0;
    this.b2b = keepsB2B;

    const cancelled = Math.min(attack, this.pendingGarbage);
    this.pendingGarbage -= cancelled;
    const outgoing = attack - cancelled;

    this.emit('clear', {
      rows: rows.slice(), cleared, spin, points, label, perfect,
      b2b, b2bChain: this.b2bChain, combo: this.combo - 1, attack: outgoing, cancelled,
    });

    const nextLevel = levelForLines(this.lines);
    if (nextLevel > this.level) {
      this.level = nextLevel;
      this.emit('levelup', { level: this.level });
    }

    this.clearInfo = null;
    this.applyPendingGarbage();
    this.beginEntry();
  }

  beginEntry() {
    this.phase = PHASE.ENTRY;
    this.entryTimer = SPAWN_DELAY;
  }

  /** Мусор от соперников встаёт снизу одной сквозной колонкой дырок. */
  applyPendingGarbage() {
    if (this.pendingGarbage <= 0) return;
    const count = Math.min(this.pendingGarbage, ROWS - HIDDEN_ROWS);
    const hole = Math.floor(this.random() * COLS);
    addGarbage(this.board, count, hole);
    this.pendingGarbage -= count;
    this.emit('garbage', { count, hole });
  }

  receiveGarbage(count) {
    if (!this.running || count <= 0) return;
    this.pendingGarbage += count;
    this.emit('incoming', { pending: this.pendingGarbage });
  }

  // --- такт ------------------------------------------------------------------

  update(dt) {
    if (!this.running) return;
    this.elapsed += dt;

    if (this.phase === PHASE.CLEARING) {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) this.commitClear();
      return;
    }

    if (this.phase === PHASE.ENTRY) {
      this.entryTimer -= dt;
      if (this.entryTimer <= 0) this.spawn();
      return;
    }

    if (!this.piece) return;

    this.gravityTimer += dt;
    const interval = this.gravityInterval;
    while (this.gravityTimer >= interval) {
      this.gravityTimer -= interval;
      if (collides(this.board, { ...this.piece, y: this.piece.y + 1 })) {
        this.grounded = true;
        break;
      }
      this.piece.y++;
      this.lastActionWasRotation = false;
      this.grounded = collides(this.board, { ...this.piece, y: this.piece.y + 1 });
    }

    if (this.grounded) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY) this.lock();
    } else {
      this.lockTimer = 0;
    }
  }

  /** Компактный слепок для сети и интерфейса. */
  snapshot() {
    return {
      board: this.board,
      piece: this.snapshotPiece(),
      ghostY: this.piece ? this.ghostY : null,
      hold: this.hold,
      next: this.nextQueue.slice(),
      score: this.score,
      lines: this.lines,
      level: this.level,
      combo: Math.max(0, this.combo - 1),
      b2b: this.b2bChain,
      pending: this.pendingGarbage,
      phase: this.phase,
    };
  }
}
