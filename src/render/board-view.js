import { COLS, ROWS, ROWS_VISIBLE, HIDDEN_ROWS, GARBAGE, LOCK_DELAY } from '../core/constants.js';
import { PHASE } from '../core/game.js';
import { drawBlock, drawGhost, drawGarbage } from './blocks.js';
import { SURFACE, colorOf, rgba, levelHue } from './palette.js';

/** Отрисовка игрового стакана: фон, сетка, стопка, призрак и активная фигура. */
export class BoardView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cell = 30;
    this.width = COLS * this.cell;
    this.height = ROWS_VISIBLE * this.cell;
    this.time = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width || this.canvas.clientWidth || 300;
    this.height = rect.height || this.width * (ROWS_VISIBLE / COLS);
    this.cell = this.width / COLS;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Экранная позиция клетки поля (скрытый буфер уезжает за верхний край). */
  cellPos(col, row) {
    return [col * this.cell, (row - HIDDEN_ROWS) * this.cell];
  }

  render(game, fx = {}) {
    const ctx = this.ctx;
    const cell = this.cell;
    this.time = fx.time || this.time;
    // Волна по стакану: ряды плывут по синусоиде, когда накаляется обстановка.
    const warp = (fx.warp || 0) * cell * 0.5;

    ctx.clearRect(0, 0, this.width, this.height);
    this.drawWell(game);

    const clearing = game.phase === PHASE.CLEARING && game.clearInfo;
    const clearRows = clearing ? new Set(game.clearInfo.rows) : null;
    const clearProgress = clearing ? 1 - Math.max(0, game.clearTimer) / game.clearInfo.duration : 0;

    // Стопка.
    for (let r = HIDDEN_ROWS; r < ROWS; r++) {
      const inClear = clearRows && clearRows.has(r);
      for (let c = 0; c < COLS; c++) {
        const value = game.board[r][c];
        if (!value) continue;
        const [bx, y] = this.cellPos(c, r);
        const x = warp
          ? bx + Math.sin(r * 0.55 + this.time * 0.006) * warp + (inClear ? (Math.random() - 0.5) * warp : 0)
          : bx;
        if (inClear) {
          // Ряд разгорается и схлопывается — это и есть «тизер» перед сломом.
          const wave = Math.max(0, clearProgress - c * 0.02);
          drawBlock(ctx, x, y, cell, value, {
            flash: Math.min(0.92, wave * 1.3),
            glow: 0.5 + clearProgress * 0.5,
            scale: 1 - Math.max(0, clearProgress - 0.55) * 1.6,
            alpha: 1 - Math.max(0, clearProgress - 0.8) * 3,
          });
        } else if (value === GARBAGE) {
          drawGarbage(ctx, x, y, cell);
        } else {
          drawBlock(ctx, x, y, cell, value);
        }
      }
    }

    if (game.piece && game.phase === PHASE.FALLING) this.drawActive(game, warp);
    this.drawDanger(game);
    this.drawPendingGarbage(game);
    this.drawFrame();
  }

  drawWell(game) {
    const ctx = this.ctx;
    const grad = ctx.createLinearGradient(0, 0, 0, this.height);
    grad.addColorStop(0, '#0a0c14');
    grad.addColorStop(1, SURFACE.well);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Мягкое пятно света сверху — стакан не выглядит плоским.
    const hue = levelHue(game.level || 1);
    const light = ctx.createRadialGradient(
      this.width / 2, -this.height * 0.15, 0,
      this.width / 2, -this.height * 0.15, this.height * 0.9,
    );
    light.addColorStop(0, `hsla(${190 + hue}, 90%, 60%, 0.14)`);
    light.addColorStop(1, 'hsla(0,0%,0%,0)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.lineWidth = 1;
    ctx.strokeStyle = SURFACE.grid;
    ctx.beginPath();
    for (let c = 1; c < COLS; c++) {
      const x = Math.round(c * this.cell) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
    }
    for (let r = 1; r < ROWS_VISIBLE; r++) {
      const y = Math.round(r * this.cell) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
    }
    ctx.stroke();
  }

  drawActive(game, warp = 0) {
    const ctx = this.ctx;
    const cell = this.cell;
    const shift = (row) => (warp ? Math.sin(row * 0.55 + this.time * 0.006) * warp : 0);
    const piece = game.piece;
    const shape = piece.shape;
    const ghostY = game.ghostY;

    for (let r = 0; r < shape.length; r++)
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const row = ghostY + r;
        if (row < HIDDEN_ROWS) continue;
        const [x, y] = this.cellPos(piece.x + c, row);
        drawGhost(ctx, x + shift(row), y, cell, piece.id);
      }

    // Столбы-указатели: видно, куда именно упадёт фигура.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const columns = new Set();
    for (let r = 0; r < shape.length; r++)
      for (let c = 0; c < shape[r].length; c++)
        if (shape[r][c]) columns.add(piece.x + c);
    for (const col of columns) {
      const grad = ctx.createLinearGradient(0, 0, 0, this.height);
      grad.addColorStop(0, rgba(colorOf(piece.id), 0));
      grad.addColorStop(1, rgba(colorOf(piece.id), 0.12));
      ctx.fillStyle = grad;
      ctx.fillRect(col * cell, 0, cell, this.height);
    }
    ctx.restore();

    const lockProgress = game.grounded ? Math.min(1, game.lockTimer / LOCK_DELAY) : 0;
    const pulse = game.grounded ? 0.25 + 0.35 * Math.abs(Math.sin(this.time * 0.012)) : 0;

    for (let r = 0; r < shape.length; r++)
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const row = piece.y + r;
        if (row < HIDDEN_ROWS) continue;
        const [x, y] = this.cellPos(piece.x + c, row);
        drawBlock(ctx, x + shift(row), y, cell, piece.id, {
          glow: 0.55 + lockProgress * 0.4,
          flash: pulse * lockProgress,
        });
      }
  }

  /** Красная линия и подсветка, когда стопка подбирается к верху. */
  drawDanger(game) {
    const height = game.stackHeight;
    const danger = Math.max(0, (height - ROWS_VISIBLE * 0.7) / (ROWS_VISIBLE * 0.3));
    if (danger <= 0) return;
    const ctx = this.ctx;
    const alpha = Math.min(0.5, danger * 0.45) * (0.7 + 0.3 * Math.sin(this.time * 0.006));
    const grad = ctx.createLinearGradient(0, 0, 0, this.height * 0.4);
    grad.addColorStop(0, `rgba(255,70,90,${alpha})`);
    grad.addColorStop(1, 'rgba(255,70,90,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height * 0.4);
  }

  /** Полоса слева — сколько мусора прилетит после следующей фигуры. */
  drawPendingGarbage(game) {
    if (!game.pendingGarbage) return;
    const ctx = this.ctx;
    const h = Math.min(ROWS_VISIBLE, game.pendingGarbage) * this.cell;
    const w = Math.max(3, this.cell * 0.14);
    const blink = 0.55 + 0.45 * Math.abs(Math.sin(this.time * 0.01));
    ctx.save();
    ctx.fillStyle = `rgba(255,80,90,${blink})`;
    ctx.shadowColor = 'rgba(255,80,90,0.9)';
    ctx.shadowBlur = 12;
    ctx.fillRect(0, this.height - h, w, h);
    ctx.restore();
  }

  drawFrame() {
    const ctx = this.ctx;
    ctx.strokeStyle = SURFACE.wellEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, this.width - 2, this.height - 2);
  }
}
