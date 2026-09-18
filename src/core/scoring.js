import { T } from './constants.js';
import { cellAt } from './board.js';

// Углы 3x3-рамки T-фигуры: пара «передних» зависит от поворота.
const FRONT_CORNERS = {
  0: [[0, 0], [2, 0]],
  1: [[2, 0], [2, 2]],
  2: [[0, 2], [2, 2]],
  3: [[0, 0], [0, 2]],
};
const ALL_CORNERS = [[0, 0], [2, 0], [0, 2], [2, 2]];

/**
 * Определяет T-спин по правилу трёх углов.
 * @returns {'none'|'mini'|'spin'}
 */
export function detectSpin(board, piece, lastActionWasRotation, kickIndex) {
  if (!lastActionWasRotation || piece.id !== T) return 'none';
  const occupied = ([dx, dy]) => cellAt(board, piece.x + dx, piece.y + dy) !== 0;
  const front = FRONT_CORNERS[piece.rotation].filter(occupied).length;
  const total = ALL_CORNERS.filter(occupied).length;
  if (total < 3) return 'none';
  // Последний (самый «дальний») пристенный сдвиг всегда засчитывается как полный спин.
  if (front === 2 || kickIndex === 4) return 'spin';
  return 'mini';
}

const LINE_POINTS = {
  none: [0, 100, 300, 500, 800],
  mini: [100, 200, 400, 600, 800],
  spin: [400, 800, 1200, 1600, 1600],
};

const PERFECT_POINTS = [0, 800, 1200, 1800, 2000];

/** Продолжает ли этот слом серию back-to-back. */
export function isB2BClear(cleared, spin) {
  return cleared > 0 && (cleared === 4 || spin !== 'none');
}

/**
 * Очки за один слом.
 * @returns {{points:number, b2b:boolean, label:string}}
 */
export function scoreClear({ cleared, spin, level, combo, b2bActive, perfect }) {
  const table = LINE_POINTS[spin] || LINE_POINTS.none;
  let base = table[Math.min(cleared, 4)];
  const keepsB2B = isB2BClear(cleared, spin);
  const b2b = keepsB2B && b2bActive;
  if (b2b) base = Math.floor(base * 1.5);
  let points = base * level;
  if (cleared > 0 && combo > 0) points += 50 * combo * level;
  if (perfect && cleared > 0) points += PERFECT_POINTS[Math.min(cleared, 4)] * level;
  return { points, b2b, label: clearLabel(cleared, spin, perfect) };
}

const NAMES = ['', 'ОДИНАРНЫЙ', 'ДВОЙНОЙ', 'ТРОЙНОЙ', 'ТЕТРИС'];

export function clearLabel(cleared, spin, perfect) {
  if (perfect && cleared) return 'ИДЕАЛЬНАЯ ЗАЧИСТКА';
  if (spin === 'spin') return cleared ? `T-СПИН ${NAMES[cleared]}` : 'T-СПИН';
  if (spin === 'mini') return cleared ? `T-СПИН МИНИ ${NAMES[cleared]}` : 'T-СПИН МИНИ';
  return NAMES[Math.min(cleared, 4)];
}

const ATTACK_BASE = [0, 0, 1, 2, 4];
const ATTACK_SPIN = [0, 2, 4, 6, 6];
const COMBO_ATTACK = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];

/** Сколько мусорных рядов улетает соперникам. */
export function attackLines({ cleared, spin, combo, b2b, perfect }) {
  if (!cleared) return 0;
  let lines = spin === 'spin' ? ATTACK_SPIN[Math.min(cleared, 4)] : ATTACK_BASE[Math.min(cleared, 4)];
  if (spin === 'mini' && cleared >= 2) lines += 1;
  if (b2b) lines += 1;
  lines += COMBO_ATTACK[Math.min(combo, COMBO_ATTACK.length - 1)];
  if (perfect) lines += 10;
  return lines;
}

export function levelForLines(lines) {
  return Math.floor(lines / 10) + 1;
}
