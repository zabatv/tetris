import test from 'node:test';
import assert from 'node:assert/strict';

import { COLS, ROWS, HIDDEN_ROWS, I, J, L, O, S, T, Z, GARBAGE, gravityFor } from '../src/core/constants.js';
import { Bag } from '../src/core/bag.js';
import { mulberry32 } from '../src/core/rng.js';
import { shapeOf, spawnPiece, kicksFor } from '../src/core/pieces.js';
import {
  createBoard, collides, fullRows, clearRows, dropDistance,
  addGarbage, isEmpty, stackHeight,
} from '../src/core/board.js';
import { detectSpin, scoreClear, attackLines, levelForLines, clearLabel } from '../src/core/scoring.js';
import { Game, PHASE } from '../src/core/game.js';

const seeded = () => mulberry32(12345);

function fillRow(board, row, except = []) {
  for (let c = 0; c < COLS; c++) if (!except.includes(c)) board[row][c] = GARBAGE;
}

test('мешок семи выдаёт каждую фигуру ровно раз за цикл', () => {
  const bag = new Bag(seeded());
  const first = Array.from({ length: 7 }, () => bag.take());
  assert.deepEqual([...first].sort((a, b) => a - b), [I, J, L, O, S, T, Z]);
  const second = Array.from({ length: 7 }, () => bag.take());
  assert.deepEqual([...second].sort((a, b) => a - b), [I, J, L, O, S, T, Z]);
});

test('peek не вынимает фигуры из очереди', () => {
  const bag = new Bag(seeded());
  const preview = bag.peek(5);
  assert.equal(preview.length, 5);
  assert.deepEqual(bag.peek(5), preview);
  assert.equal(bag.take(), preview[0]);
});

test('повороты фигур образуют цикл из четырёх состояний', () => {
  for (const id of [I, J, L, O, S, T, Z]) {
    assert.deepEqual(shapeOf(id, 4), shapeOf(id, 0));
    assert.deepEqual(shapeOf(id, -1), shapeOf(id, 3));
  }
  assert.deepEqual(shapeOf(O, 1), shapeOf(O, 0), 'O-фигура не меняет форму');
});

test('фигура O не получает пристенных сдвигов, I имеет свою таблицу', () => {
  assert.deepEqual(kicksFor(O, 0, 1), [[0, 0]]);
  assert.notDeepEqual(kicksFor(I, 0, 1), kicksFor(T, 0, 1));
  assert.equal(kicksFor(T, 0, 1).length, 5);
});

test('коллизии ловят стены, пол и занятые клетки', () => {
  const board = createBoard();
  const piece = spawnPiece(T);
  assert.equal(collides(board, piece), false);
  assert.equal(collides(board, { ...piece, x: -2 }), true);
  assert.equal(collides(board, { ...piece, x: COLS }), true);
  assert.equal(collides(board, { ...piece, y: ROWS }), true);
  board[5][4] = I;
  assert.equal(collides(board, { ...piece, y: 4 }), true);
});

test('слом рядов опускает то, что было выше', () => {
  const board = createBoard();
  fillRow(board, ROWS - 1);
  board[ROWS - 3][0] = I;
  assert.deepEqual(fullRows(board), [ROWS - 1]);
  clearRows(board, [ROWS - 1]);
  assert.equal(board[ROWS - 1].every(v => v === 0), true);
  assert.equal(board[ROWS - 2][0], I, 'блок сверху сдвинулся на ряд вниз');
  assert.equal(board.length, ROWS);
});

test('мусорные ряды встают снизу и оставляют сквозную дырку', () => {
  const board = createBoard();
  board[ROWS - 1][0] = I;
  addGarbage(board, 2, 3);
  assert.equal(board[ROWS - 1][3], 0);
  assert.equal(board[ROWS - 1][4], GARBAGE);
  assert.equal(board[ROWS - 3][0], I, 'старое содержимое поднялось на две строки');
});

test('dropDistance и stackHeight считают геометрию стакана', () => {
  const board = createBoard();
  const piece = spawnPiece(O);
  assert.equal(dropDistance(board, piece) + piece.y, ROWS - 2);
  assert.equal(stackHeight(board), 0);
  fillRow(board, ROWS - 1);
  assert.equal(stackHeight(board), 1);
  assert.equal(isEmpty(board), false);
});

test('T-спин определяется по трём углам и только после поворота', () => {
  const board = createBoard();
  const piece = { ...spawnPiece(T), x: 3, y: 10, rotation: 2, shape: shapeOf(T, 2) };
  // Углы 3x3-рамки вокруг фигуры.
  board[10][3] = GARBAGE;
  board[10][5] = GARBAGE;
  board[12][3] = GARBAGE;
  board[12][5] = GARBAGE;
  assert.equal(detectSpin(board, piece, true, 0), 'spin');
  assert.equal(detectSpin(board, piece, false, 0), 'none', 'без поворота спина нет');
  assert.equal(detectSpin(board, { ...piece, id: L }, true, 0), 'none', 'только T-фигура');
});

test('мини-спин повышается до полного на последнем пристенном сдвиге', () => {
  const board = createBoard();
  const piece = { ...spawnPiece(T), x: 3, y: 10, rotation: 0, shape: shapeOf(T, 0) };
  board[12][3] = GARBAGE;
  board[12][5] = GARBAGE;
  board[10][3] = GARBAGE;
  assert.equal(detectSpin(board, piece, true, 0), 'mini');
  assert.equal(detectSpin(board, piece, true, 4), 'spin');
});

test('очки учитывают уровень, комбо, back-to-back и идеальную зачистку', () => {
  const plain = scoreClear({ cleared: 1, spin: 'none', level: 1, combo: 0, b2bActive: false, perfect: false });
  assert.equal(plain.points, 100);
  assert.equal(plain.b2b, false);

  const tetris = scoreClear({ cleared: 4, spin: 'none', level: 3, combo: 0, b2bActive: false, perfect: false });
  assert.equal(tetris.points, 2400);

  const b2b = scoreClear({ cleared: 4, spin: 'none', level: 1, combo: 0, b2bActive: true, perfect: false });
  assert.equal(b2b.points, 1200, 'серия даёт полуторный множитель');
  assert.equal(b2b.b2b, true);

  const combo = scoreClear({ cleared: 1, spin: 'none', level: 2, combo: 3, b2bActive: false, perfect: false });
  assert.equal(combo.points, 100 * 2 + 50 * 3 * 2);

  const perfect = scoreClear({ cleared: 4, spin: 'none', level: 1, combo: 0, b2bActive: false, perfect: true });
  assert.equal(perfect.points, 800 + 2000);
});

test('атака растёт от спинов, серии, комбо и идеальной зачистки', () => {
  assert.equal(attackLines({ cleared: 1, spin: 'none', combo: 0, b2b: false, perfect: false }), 0);
  assert.equal(attackLines({ cleared: 4, spin: 'none', combo: 0, b2b: false, perfect: false }), 4);
  assert.equal(attackLines({ cleared: 2, spin: 'spin', combo: 0, b2b: false, perfect: false }), 4);
  assert.equal(attackLines({ cleared: 4, spin: 'none', combo: 0, b2b: true, perfect: false }), 5);
  assert.equal(attackLines({ cleared: 2, spin: 'none', combo: 4, b2b: false, perfect: false }), 3);
  assert.equal(attackLines({ cleared: 0, spin: 'spin', combo: 9, b2b: true, perfect: true }), 0);
});

test('уровень и подписи слома', () => {
  assert.equal(levelForLines(0), 1);
  assert.equal(levelForLines(9), 1);
  assert.equal(levelForLines(10), 2);
  assert.equal(clearLabel(4, 'none', false), 'ТЕТРИС');
  assert.equal(clearLabel(2, 'spin', false), 'T-СПИН ДВОЙНОЙ');
  assert.equal(clearLabel(1, 'none', true), 'ИДЕАЛЬНАЯ ЗАЧИСТКА');
});

test('гравитация ускоряется с уровнем и не уходит ниже кадра', () => {
  assert.equal(gravityFor(1), 1000);
  assert.ok(gravityFor(5) < gravityFor(2));
  assert.ok(gravityFor(20) >= 16);
  assert.equal(gravityFor(99), gravityFor(20), 'выше максимума скорость не растёт');
});

// --- игровой цикл -----------------------------------------------------------

function newGame(events = []) {
  const game = new Game({ random: seeded(), onEvent: (t, p) => events.push({ t, p }) });
  game.start();
  return game;
}

test('старт выдаёт фигуру, очередь из пяти и пустой стакан', () => {
  const events = [];
  const game = newGame(events);
  assert.equal(game.phase, PHASE.FALLING);
  assert.ok(game.piece);
  assert.equal(game.nextQueue.length, 5);
  assert.equal(isEmpty(game.board), true);
  assert.deepEqual(events.map(e => e.t), ['start', 'spawn']);
});

test('движение влево-вправо упирается в стены', () => {
  const game = newGame();
  let steps = 0;
  while (game.move(-1)) steps++;
  assert.ok(steps > 0);
  assert.equal(game.move(-1), false);
  assert.equal(collides(game.board, game.piece), false);
});

test('хард-дроп кладёт фигуру на пол и начисляет по 2 очка за клетку', () => {
  const events = [];
  const game = newGame(events);
  const distance = dropDistance(game.board, game.piece);
  game.hardDrop();
  assert.equal(game.score, distance * 2);
  assert.equal(game.piecesPlaced, 1);
  assert.ok(events.some(e => e.t === 'harddrop'));
  assert.ok(events.some(e => e.t === 'lock'));
});

test('софт-дроп двигает на клетку и даёт очко', () => {
  const game = newGame();
  const y = game.piece.y;
  assert.equal(game.softDrop(), true);
  assert.equal(game.piece.y, y + 1);
  assert.equal(game.score, 1);
});

test('удержание меняет фигуру и блокируется до следующего приземления', () => {
  const events = [];
  const game = newGame(events);
  const first = game.piece.id;
  assert.equal(game.holdPiece(), true);
  assert.equal(game.hold, first);
  assert.notEqual(game.piece.id, null);
  assert.equal(game.holdPiece(), false, 'повторное удержание до приземления запрещено');
  game.hardDrop();
  game.update(100);
  assert.equal(game.holdPiece(), true, 'после приземления удержание снова доступно');
});

test('заполненный ряд ломается через фазу тизера и приносит очки', () => {
  const events = [];
  const game = newGame(events);
  const row = ROWS - 1;
  fillRow(game.board, row, [0, 1, 2, 3]);
  game.piece = { ...spawnPiece(I), x: 0, y: row - 1 };
  game.lock();

  assert.equal(game.phase, PHASE.CLEARING, 'слом не мгновенный — сначала тизер');
  assert.equal(game.lines, 0);
  game.update(game.clearTimer);
  assert.equal(game.lines, 1);
  assert.ok(game.score > 0);
  assert.equal(game.combo, 1);

  const clear = events.find(e => e.t === 'clear');
  assert.equal(clear.p.cleared, 1);
  assert.equal(clear.p.perfect, true, 'стакан опустел — идеальная зачистка');
});

test('четыре ряда за раз дают тетрис, серию и атаку', () => {
  const events = [];
  const game = newGame(events);
  for (let r = ROWS - 4; r < ROWS; r++) fillRow(game.board, r, [9]);
  game.piece = { ...spawnPiece(I), x: 9, y: ROWS - 4, rotation: 1, shape: shapeOf(I, 1) };
  // Вертикальная I занимает столбец 9 на четырёх строках.
  game.piece.x = 7;
  game.lock();
  game.update(game.clearTimer);

  const clear = events.find(e => e.t === 'clear');
  assert.equal(clear.p.cleared, 4);
  assert.equal(clear.p.attack >= 4, true);
  assert.equal(game.b2b, true);
  assert.equal(game.lines, 4);
});

test('серия комбо обрывается приземлением без слома', () => {
  const game = newGame();
  fillRow(game.board, ROWS - 1, [0, 1, 2, 3]);
  game.piece = { ...spawnPiece(I), x: 0, y: ROWS - 2 };
  game.lock();
  game.update(game.clearTimer);
  assert.equal(game.combo, 1);
  game.update(1000);
  game.hardDrop();
  assert.equal(game.combo, 0);
});

test('входящий мусор копится и падает после приземления', () => {
  const events = [];
  const game = newGame(events);
  game.receiveGarbage(3);
  assert.equal(game.pendingGarbage, 3);
  game.hardDrop();
  assert.equal(game.pendingGarbage, 0);
  assert.equal(stackHeight(game.board) >= 3, true);
  const garbage = events.find(e => e.t === 'garbage');
  assert.equal(garbage.p.count, 3);
});

test('своя атака гасит входящий мусор', () => {
  const game = newGame();
  game.receiveGarbage(2);
  for (let r = ROWS - 4; r < ROWS; r++) fillRow(game.board, r, [9]);
  game.piece = { ...spawnPiece(I), x: 7, y: ROWS - 4, rotation: 1, shape: shapeOf(I, 1) };
  game.lock();
  game.update(game.clearTimer);
  assert.equal(game.pendingGarbage, 0, 'входящий мусор погашен, а не добавлен');
});

test('гравитация опускает фигуру и включает задержку приземления', () => {
  const game = newGame();
  const y = game.piece.y;
  game.update(gravityFor(1) + 1);
  assert.equal(game.piece.y, y + 1);

  while (!game.grounded && game.phase === PHASE.FALLING) game.update(100);
  const landed = game.piece.y;
  game.update(100);
  assert.equal(game.piece.y, landed, 'на полу фигура ждёт задержку приземления');
  game.update(600);
  assert.equal(game.piecesPlaced, 1);
});

test('переполнение стакана заканчивает игру', () => {
  const events = [];
  const game = newGame(events);
  for (let r = 0; r < ROWS; r++) fillRow(game.board, r);
  game.piece = null;
  game.spawn(O);
  assert.equal(game.phase, PHASE.OVER);
  assert.equal(game.running, false);
  assert.ok(events.some(e => e.t === 'gameover'));
  const before = game.score;
  game.update(1000);
  assert.equal(game.score, before, 'после конца игры такты ничего не меняют');
});

test('фигура, запертая в скрытом буфере, тоже заканчивает игру', () => {
  const game = newGame();
  for (let r = HIDDEN_ROWS; r < ROWS; r++) fillRow(game.board, r);
  game.piece = null;
  game.spawn(O);
  assert.equal(game.phase, PHASE.FALLING, 'спавн в буфере сам по себе не проигрыш');
  game.hardDrop();
  assert.equal(game.phase, PHASE.OVER);
});

test('снимок состояния содержит всё, что нужно интерфейсу и сети', () => {
  const game = newGame();
  const snap = game.snapshot();
  assert.equal(snap.board.length, ROWS);
  assert.equal(snap.next.length, 5);
  assert.equal(typeof snap.ghostY, 'number');
  assert.ok(snap.ghostY >= snap.piece.y);
  assert.equal(snap.phase, PHASE.FALLING);
});

test('одинаковое зерно даёт одинаковую последовательность фигур', () => {
  const a = new Game({ random: mulberry32(99) });
  const b = new Game({ random: mulberry32(99) });
  a.start(); b.start();
  assert.deepEqual(a.nextQueue, b.nextQueue);
  assert.equal(a.piece.id, b.piece.id);
});

function tSpinWell(game) {
  // Ряд 20 не хватает трёх клеток под «шляпку» T, ряд 21 — с запасной дыркой,
  // чтобы слом получился одинарным. Клетка [19][3] даёт третий занятый угол.
  fillRow(game.board, ROWS - 1, [4, 9]);
  fillRow(game.board, ROWS - 2, [3, 4, 5]);
  game.board[ROWS - 3][3] = GARBAGE;
}

test('поворот в колодец и хард-дроп на месте засчитываются как T-спин', () => {
  const events = [];
  const game = newGame(events);
  tSpinWell(game);
  game.piece = { ...spawnPiece(T), x: 3, y: ROWS - 3, rotation: 0, shape: shapeOf(T, 0) };
  assert.equal(game.rotate(1), true);
  assert.equal(game.rotate(1), true, 'два поворота ставят T «носом» вниз');
  game.hardDrop();
  game.update(game.clearTimer);

  const clear = events.find(e => e.t === 'clear');
  assert.equal(clear.p.spin, 'spin');
  assert.equal(clear.p.cleared, 1);
  assert.equal(clear.p.points, 800, 'T-спин одинарный стоит 800, а не 100');
  assert.ok(clear.p.attack >= 2);
});

test('признак спина сбрасывается сдвигом вбок и полётом до пола', () => {
  const game = newGame();
  assert.equal(game.rotate(1), true);
  assert.equal(game.lastActionWasRotation, true);
  assert.equal(game.move(-1), true);
  assert.equal(game.lastActionWasRotation, false, 'сдвиг вбок — уже не спин');

  const other = newGame();
  other.rotate(1);
  assert.equal(other.lastActionWasRotation, true);
  other.hardDrop();
  // Между приземлением и новой фигурой есть пауза: признак ещё не перезаписан.
  assert.equal(other.lastActionWasRotation, false, 'полёт через всё поле отменяет спин');
});
