import { COLS, ROWS, ROWS_VISIBLE, GARBAGE } from './constants.js';

export function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

export function cellAt(board, x, y) {
  if (x < 0 || x >= COLS || y >= ROWS) return GARBAGE; // стены и пол считаем занятыми
  if (y < 0) return 0;                                 // над полем пусто
  return board[y][x];
}

export function collides(board, piece) {
  const shape = piece.shape;
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const x = piece.x + c;
      const y = piece.y + r;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && board[y][x]) return true;
    }
  }
  return false;
}

export function merge(board, piece) {
  const shape = piece.shape;
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c] && piece.y + r >= 0) board[piece.y + r][piece.x + c] = piece.id;
  return board;
}

export function dropDistance(board, piece) {
  let dy = 0;
  while (!collides(board, { ...piece, y: piece.y + dy + 1 })) dy++;
  return dy;
}

export function fullRows(board) {
  const rows = [];
  for (let r = 0; r < ROWS; r++) if (board[r].every(v => v !== 0)) rows.push(r);
  return rows;
}

// Убирает ряды и опускает всё, что было выше.
export function clearRows(board, rows) {
  const drop = new Set(rows);
  const kept = board.filter((_, r) => !drop.has(r));
  while (kept.length < ROWS) kept.unshift(new Array(COLS).fill(0));
  for (let r = 0; r < ROWS; r++) board[r] = kept[r];
  return board;
}

export function isEmpty(board) {
  return board.every(row => row.every(v => v === 0));
}

// Мусорные ряды снизу: сплошные, кроме одной сквозной дырки.
export function addGarbage(board, count, holeColumn) {
  if (count <= 0) return board;
  for (let i = 0; i < count; i++) {
    board.shift();
    const row = new Array(COLS).fill(GARBAGE);
    row[holeColumn] = 0;
    board.push(row);
  }
  return board;
}

// Высота завала в рядах — для интерфейса и «тревожных» эффектов.
export function stackHeight(board) {
  for (let r = 0; r < ROWS; r++) {
    if (board[r].some(v => v !== 0)) return Math.min(ROWS_VISIBLE, ROWS - r);
  }
  return 0;
}
