import { shapeOf } from '../core/pieces.js';
import { drawBlock } from './blocks.js';

/** Общая отрисовка «следующих» и «удержания» — компактная сетка фигур. */
export class PreviewView {
  constructor(canvas, { cell = 18, rows = 1, dim = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cellSize = cell;
    this.rows = rows;
    this.dim = dim;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width || this.canvas.clientWidth || 96;
    this.height = rect.height || this.canvas.clientHeight || 80;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  /** Рисует одну фигуру по центру заданной ячейки-слота. */
  drawPiece(id, slotY, slotHeight, scale = 1) {
    if (!id) return;
    const shape = shapeOf(id, 0);
    const cells = [];
    for (let r = 0; r < shape.length; r++)
      for (let c = 0; c < shape[r].length; c++)
        if (shape[r][c]) cells.push([c, r]);
    if (!cells.length) return;

    const minX = Math.min(...cells.map(p => p[0]));
    const maxX = Math.max(...cells.map(p => p[0]));
    const minY = Math.min(...cells.map(p => p[1]));
    const maxY = Math.max(...cells.map(p => p[1]));
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const size = this.cellSize * scale;
    const ox = (this.width - w * size) / 2 - minX * size;
    const oy = slotY + (slotHeight - h * size) / 2 - minY * size;

    for (const [c, r] of cells) {
      drawBlock(this.ctx, ox + c * size, oy + r * size, size, id, {
        glow: this.dim ? 0 : 0.35,
        alpha: this.dim ? 0.45 : 1,
      });
    }
  }

  renderQueue(ids) {
    this.clear();
    const slot = this.height / Math.max(1, this.rows);
    ids.slice(0, this.rows).forEach((id, i) => {
      // Первая фигура в очереди крупнее — её берут прямо сейчас.
      this.drawPiece(id, i * slot, slot, i === 0 ? 1 : 0.78);
    });
  }

  renderSingle(id) {
    this.clear();
    this.drawPiece(id, 0, this.height, 1);
  }
}
