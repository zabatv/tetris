// Геометрия поля. Две верхние строки — скрытый буфер спавна.
export const COLS = 10;
export const ROWS_VISIBLE = 20;
export const HIDDEN_ROWS = 2;
export const ROWS = ROWS_VISIBLE + HIDDEN_ROWS;

// Идентификаторы фигур (значения клеток поля).
export const I = 1, J = 2, L = 3, O = 4, S = 5, T = 6, Z = 7;
export const GARBAGE = 8;

export const PIECE_IDS = [I, J, L, O, S, T, Z];
export const PIECE_LETTER = { [I]: 'I', [J]: 'J', [L]: 'L', [O]: 'O', [S]: 'S', [T]: 'T', [Z]: 'Z' };

// Тайминги (мс).
export const LOCK_DELAY = 500;
export const MAX_LOCK_RESETS = 15;
export const SPAWN_DELAY = 60;
export const DAS = 150;
export const ARR = 33;
export const SOFT_DROP_RATE = 28;

// Сколько длится «тизер» перед сломом рядов — зависит от их числа.
export const CLEAR_DELAY_BASE = 260;
export const CLEAR_DELAY_PER_ROW = 90;

export const MAX_LEVEL = 20;

// Гравитация по гайдлайну: время падения на одну клетку.
export function gravityFor(level) {
  const lv = Math.min(Math.max(level, 1), MAX_LEVEL);
  return Math.max(16, Math.pow(0.8 - (lv - 1) * 0.007, lv - 1) * 1000);
}
