import { COLS, ROWS, ROWS_VISIBLE, HIDDEN_ROWS, GARBAGE } from '../core/constants.js';
import { colorOf, rgba } from './palette.js';

const CELL = 11;
export const OPP_W = COLS * CELL;
export const OPP_H = ROWS_VISIBLE * CELL;

/**
 * Мини-доска соперника. Позиция фигуры сглаживается: пакеты приходят
 * реже кадров, и без интерполяции фигура дёргалась бы.
 */
export function drawOpponent(ctx, opp, now = performance.now()) {
  ctx.clearRect(0, 0, OPP_W, OPP_H);
  const bg = ctx.createLinearGradient(0, 0, 0, OPP_H);
  bg.addColorStop(0, '#0a0c14');
  bg.addColorStop(1, '#070810');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, OPP_W, OPP_H);

  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < COLS; c++) { ctx.moveTo(c * CELL + 0.5, 0); ctx.lineTo(c * CELL + 0.5, OPP_H); }
  for (let r = 1; r < ROWS_VISIBLE; r++) { ctx.moveTo(0, r * CELL + 0.5); ctx.lineTo(OPP_W, r * CELL + 0.5); }
  ctx.stroke();

  const board = opp.board;
  if (board) {
    const offset = board.length === ROWS ? HIDDEN_ROWS : 0;
    for (let r = offset; r < board.length; r++) {
      const row = board[r];
      if (!row) continue;
      for (let c = 0; c < COLS; c++) {
        const v = row[c];
        if (!v) continue;
        ctx.fillStyle = v === GARBAGE ? '#3d4456' : colorOf(v);
        ctx.fillRect(c * CELL + 1, (r - offset) * CELL + 1, CELL - 2, CELL - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(c * CELL + 1, (r - offset) * CELL + 1, CELL - 2, 1.5);
      }
    }
  }

  const piece = opp.piece;
  if (piece && piece.shape) {
    const offset = (opp.board && opp.board.length === ROWS) ? HIDDEN_ROWS : 0;
    if (opp.lastId !== piece.id || opp.px == null) {
      opp.lastId = piece.id;
      opp.px = piece.x;
      opp.py = piece.y;
      opp.pgy = piece.gy != null ? piece.gy : piece.y;
    } else {
      opp.px += (piece.x - opp.px) * 0.25;
      opp.py += (piece.y - opp.py) * 0.25;
      if (piece.gy != null) opp.pgy += (piece.gy - opp.pgy) * 0.25;
    }
    const color = colorOf(piece.id);

    if (piece.gy != null) {
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = color;
      forEachCell(piece.shape, (c, r) => {
        ctx.fillRect((opp.px + c) * CELL, (opp.pgy + r - offset) * CELL, CELL, CELL);
      });
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.shadowColor = rgba(color, 0.8);
    ctx.shadowBlur = 8;
    ctx.fillStyle = color;
    forEachCell(piece.shape, (c, r) => {
      ctx.fillRect((opp.px + c) * CELL + 1, (opp.py + r - offset) * CELL + 1, CELL - 2, CELL - 2);
    });
    ctx.restore();
  }

  if (opp.flashUntil && now < opp.flashUntil) {
    const a = (opp.flashUntil - now) / 450;
    ctx.fillStyle = `rgba(255,255,255,${a * 0.35})`;
    ctx.fillRect(0, 0, OPP_W, OPP_H);
    ctx.strokeStyle = `rgba(120,240,255,${a})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, OPP_W - 2, OPP_H - 2);
  }

  if (opp.over) {
    ctx.fillStyle = 'rgba(4,6,12,0.72)';
    ctx.fillRect(0, 0, OPP_W, OPP_H);
    ctx.fillStyle = '#ff6b81';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ВЫБЫЛ', OPP_W / 2, OPP_H / 2 - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(String(opp.score || 0), OPP_W / 2, OPP_H / 2 + 14);
  }
}

function forEachCell(shape, fn) {
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) fn(c, r);
}
