import { I, J, L, O, S, T, Z, PIECE_IDS } from './constants.js';

// Базовые формы в рамках SRS: I — 4x4, O — 2x2, остальные — 3x3.
const BASE = {
  [I]: [[0, 0, 0, 0], [I, I, I, I], [0, 0, 0, 0], [0, 0, 0, 0]],
  [J]: [[J, 0, 0], [J, J, J], [0, 0, 0]],
  [L]: [[0, 0, L], [L, L, L], [0, 0, 0]],
  [O]: [[O, O], [O, O]],
  [S]: [[0, S, S], [S, S, 0], [0, 0, 0]],
  [T]: [[0, T, 0], [T, T, T], [0, 0, 0]],
  [Z]: [[Z, Z, 0], [0, Z, Z], [0, 0, 0]],
};

// Горизонтальный сдвиг спавна, чтобы фигура вставала по центру поля.
const SPAWN_X = { [I]: 3, [J]: 3, [L]: 3, [O]: 4, [S]: 3, [T]: 3, [Z]: 3 };

function rotateCW(matrix) {
  const n = matrix.length;
  return matrix[0].map((_, c) => matrix.map(row => row[c]).reverse().slice(0, n));
}

// Четыре состояния поворота для каждой фигуры: 0 — спавн, 1 — R, 2 — 180, 3 — L.
export const ROTATIONS = {};
for (const id of PIECE_IDS) {
  const states = [BASE[id]];
  for (let i = 1; i < 4; i++) states.push(rotateCW(states[i - 1]));
  ROTATIONS[id] = states;
}

// Таблицы пристенных сдвигов SRS: ключ «из состояния -> в состояние».
const KICKS_JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

const KICKS_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

// Для поворота на 180° штатной таблицы в SRS нет — берём мягкий набор.
const KICKS_180 = [[0, 0], [0, -1], [1, 0], [-1, 0], [0, 1]];

export function kicksFor(id, from, to) {
  if (id === O) return [[0, 0]];
  if ((from + 2) % 4 === to) return KICKS_180;
  const table = id === I ? KICKS_I : KICKS_JLSTZ;
  return table[`${from}>${to}`] || [[0, 0]];
}

export function shapeOf(id, rotation) {
  return ROTATIONS[id][((rotation % 4) + 4) % 4];
}

export function spawnPiece(id) {
  return { id, rotation: 0, x: SPAWN_X[id], y: 0, shape: shapeOf(id, 0) };
}

// Координаты занятых клеток фигуры в системе поля.
export function cellsOf(piece) {
  const out = [];
  const shape = piece.shape;
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) out.push([piece.x + c, piece.y + r]);
  return out;
}
