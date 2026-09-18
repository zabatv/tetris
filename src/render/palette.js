import { I, J, L, O, S, T, Z, GARBAGE } from '../core/constants.js';

// Единая палитра: отсюда берут цвет и поле, и превью, и мини-доски соперников.
export const PIECE_COLORS = {
  [I]: '#22d3ee',
  [J]: '#4f7dff',
  [L]: '#ff9d4d',
  [O]: '#ffd24a',
  [S]: '#4ade80',
  [T]: '#c084fc',
  [Z]: '#fb7185',
  [GARBAGE]: '#5a6377',
};

export const SURFACE = {
  well: '#0c0e16',
  wellEdge: 'rgba(255,255,255,0.07)',
  grid: 'rgba(255,255,255,0.045)',
  gridStrong: 'rgba(255,255,255,0.08)',
};

export function colorOf(value) {
  return PIECE_COLORS[value] || '#8b93a7';
}

export function hexToRgb(hex) {
  const v = hex.replace('#', '');
  const n = parseInt(v.length === 3 ? v.split('').map(c => c + c).join('') : v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbString(hex) {
  return hexToRgb(hex).join(',');
}

/** amount > 0 — светлее, < 0 — темнее. */
export function shade(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  const t = amount > 0 ? 255 : 0;
  const p = Math.abs(amount);
  const mix = (c) => Math.round(c + (t - c) * p);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

export function rgba(hex, alpha) {
  return `rgba(${rgbString(hex)},${alpha})`;
}

/** Оттенок акцента растёт вместе с уровнем — картинка «нагревается». */
export function levelHue(level) {
  return ((level - 1) * 24) % 360;
}
