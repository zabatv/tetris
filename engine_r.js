(function () {

const COLS = 10, ROWS = 20, BLOCK = 30;
const COLORS = [null, '#00f0f0', '#0040f0', '#f0a000', '#f0f000', '#00f000', '#a000f0', '#f00000'];
const GLOW_COLORS = [null, '0,255,255', '0,64,240', '240,160,0', '240,240,0', '0,240,0', '160,0,240', '240,0,0'];
const SHAPES = [
  null,
  [[1,1,1,1]],
  [[2,0,0],[2,2,2]],
  [[0,0,3],[3,3,3]],
  [[4,4],[4,4]],
  [[0,5,5],[5,5,0]],
  [[0,6,0],[6,6,6]],
  [[7,7,0],[0,7,7]]
];

let canvas, ctx, ctx2, nextCanvas, nextCtx, stage, wrapper, flashEl, textEl, floatsEl, bgCanvas, bgCtx;
let __hud = null;
const hudc = {
  score: v => { if (__hud && __hud.score) __hud.score(v); },
  level: v => { if (__hud && __hud.level) __hud.level(v); },
  lines: v => { if (__hud && __hud.lines) __hud.lines(v); },
  combo: v => { if (__hud && __hud.combo) __hud.combo(v); },
  comboGold: b => { if (__hud && __hud.comboGold) __hud.comboGold(b); },
  levelPulse: () => { if (__hud && __hud.levelPulse) __hud.levelPulse(); },
  menu: b => { if (__hud && __hud.menu) __hud.menu(b); },
  gameOver: (s, m) => { if (__hud && __hud.gameOver) __hud.gameOver(s, m); }
};
function setupDom(refs) {
  canvas = refs.board;
  ctx = canvas.getContext('2d');
  ctx2 = document.createElement('canvas').getContext('2d');
  ctx2.canvas.width = canvas.width;
  ctx2.canvas.height = canvas.height;
  nextCanvas = refs.nextCanvas;
  nextCtx = nextCanvas.getContext('2d');
  stage = refs.stage;
  wrapper = refs.wrapper;
  flashEl = document.getElementById('flash');
  textEl = document.getElementById('textfx');
  floatsEl = document.getElementById('floats');
  bgCanvas = refs.bg;
  bgCtx = bgCanvas.getContext('2d');
}
function setupHud(h) { __hud = h; }

let board, piece, nextPiece, score, lines, level, combo, maxCombo, dropCounter, dropInterval, lastTime, animFrame, paused, gameOver;
let locking = false, lockTimer = 0;
const LOCK_DELAY = 300;
let particles = [];
let meteors = [];
let nebulas = [];
let embers = [];
let flevel = 1;
let lastLevel = 1;
let blastDone = false;
let slowmo = 1, slowmoT = 0, freezeT = 0;
let hardDropping = false, hardDropTarget = -1, hardDropTimer = 0;
const HARD_SPEED = 36;
let aboutToBreak = false;
let breakRows = [];
let breakTimer = 0;
let breakTicker = 0;
let partSlow = 1;

// ===== ЗВУК: Web Audio синтезатор =====
let actx = null, masterGain = null, musicOn = false, musicIv = null, musicStep = 0;
function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = actx.createGain();
    masterGain.gain.value = 0.55;
    masterGain.connect(actx.destination);
  } catch (e) {}
}
function tone(freq, dur, type, vol, when, slide) {
  if (!actx) return;
  const t = actx.currentTime + (when || 0);
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(1, slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol || 0.15, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(masterGain);
  o.start(t); o.stop(t + dur + 0.05);
}
function boom(dur, vol, freq) {
  if (!actx) return;
  const t = actx.currentTime;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq || 160, t);
  o.frequency.exponentialRampToValueAtTime(30, t + dur);
  g.gain.setValueAtTime(vol || 0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(masterGain);
  o.start(t); o.stop(t + dur + 0.02);
}
function noisew(dur, vol, type, f0, f1) {
  if (!actx) return;
  const t = actx.currentTime;
  const len = Math.floor(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = actx.createBufferSource();
  src.buffer = buf;
  const filt = actx.createBiquadFilter();
  filt.type = type || 'lowpass';
  filt.frequency.setValueAtTime(f0 || 2000, t);
  if (f1) filt.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(vol || 0.4, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt); filt.connect(g); g.connect(masterGain);
  src.start(t);
}
const sfx = {
  move() { tone(260, 0.05, 'square', 0.07); },
  rotate() { tone(320, 0.06, 'square', 0.1); tone(500, 0.05, 'triangle', 0.08, 0.02); },
  soft() { tone(200, 0.04, 'sine', 0.05); },
  lock() { noisew(0.12, 0.2, 'lowpass', 1000, 150); boom(0.16, 0.35, 150); },
  hard() { noisew(0.4, 0.45, 'bandpass', 250, 3500); tone(1000, 0.22, 'sawtooth', 0.12, 0, 90); boom(0.25, 0.35, 110); },
  line(n) {
    if (!n) return;
    for (let i = 0; i < n; i++) tone(330 * Math.pow(1.25, i), 0.12, 'square', 0.12, i * 0.07);
    if (n >= 2) { noisew(0.18, 0.3, 'highpass', 700, 3200); boom(0.3, 0.35, 90); }
    if (n === 4) { noisew(0.7, 0.5, 'bandpass', 150, 2800); boom(0.9, 0.7, 220); tone(880, 0.5, 'sawtooth', 0.16, 0, 1320); }
  },
  combo(c) { tone(550 + c * 60, 0.12, 'triangle', 0.16); },
  level() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.16, i * 0.09)); },
  over() { [392, 330, 262, 196, 147].forEach((f, i) => tone(f, 0.42, 'sawtooth', 0.16, i * 0.18)); noisew(0.9, 0.3, 'lowpass', 1400, 90); }
};
function startMusic() {
  if (!actx || musicOn) return;
  musicOn = true;
  musicStep = 0;
  musicIv = setInterval(musicTick, 150);
}
function stopMusic() {
  musicOn = false;
  if (musicIv) { clearInterval(musicIv); musicIv = null; }
}
function musicTick() {
  if (!actx) { musicIv = null; return; }
  const lv = (typeof level === 'number' && level >= 1) ? level : 1;
  const iv = Math.max(70, 140 - (lv - 1) * 3);
  clearInterval(musicIv);
  musicIv = setInterval(musicTick, iv);
  const s8 = musicStep % 8;
  if (s8 === 0 || s8 === 4) boom(0.2, 0.4, 135);
  if (s8 % 2 === 1) noisew(0.03, 0.05, 'highpass', 6000, 9000);
  if (s8 === 0) {
    const root = 55 * Math.pow(2, (musicStep >> 4) % 2);
    tone(root, 0.16, 'sawtooth', 0.12, 0, root);
  }
  if (lv >= 3 && s8 === 5) tone(550, 0.1, 'square', 0.07);
  if (lv >= 6 && s8 === 3) tone(1100, 0.08, 'square', 0.05);
  musicStep++;
}

function rgbFx() {
  const r = document.getElementById('rgbflash');
  r.classList.remove('on');
  void r.offsetWidth;
  r.classList.add('on');
  wrapper.classList.remove('zz-scale');
  void wrapper.offsetWidth;
  wrapper.classList.add('zz-scale');
  document.body.classList.remove('sick');
  void document.body.offsetWidth;
  document.body.classList.add('sick');
}
function hitPunch() {
  wrapper.classList.remove('hit');
  void wrapper.offsetWidth;
  wrapper.classList.add('hit');
}

function afterimage(x, y, color) {
  particles.push({
    x, y, vx: 0, vy: 0,
    life: 0.5, decay: 0.02, size: 0,
    color, type: 7
  });
}

function spawnHardTrail() {
  for (let r = 0; r < piece.shape.length; r++)
    for (let c = 0; c < piece.shape[r].length; c++)
      if (piece.shape[r][c] && piece.y + r >= 0 && piece.y + r < ROWS) {
        const tx = (piece.x + c) * BLOCK;
        const ty = (piece.y + r) * BLOCK;
        afterimage(tx, ty, GLOW_COLORS[piece.id]);
        spark(tx + BLOCK / 2, ty + BLOCK / 2, GLOW_COLORS[piece.id], 2);
        trail(tx + BLOCK / 2, ty + BLOCK / 2, GLOW_COLORS[piece.id]);
      }
  if (Math.random() < 0.4) {
    for (let i = 0; i < 8; i++) {
      particles.push({
        x: (piece.x + Math.random() * piece.shape[0].length) * BLOCK,
        y: (piece.y + Math.random() * piece.shape.length) * BLOCK,
        vx: (Math.random() - 0.5) * 3,
        vy: 8 + Math.random() * 14,
        life: 0.3, decay: 0.05,
        size: 3 + Math.random() * 4,
        color: GLOW_COLORS[piece.id], type: 2
      });
    }
  }
}

function finishHardDrop() {
  for (let r = 0; r < piece.shape.length; r++)
    for (let c = 0; c < piece.shape[r].length; c++)
      if (piece.shape[r][c] && piece.y + r >= 0) {
        const px = (piece.x + c) * BLOCK + BLOCK / 2;
        const py = (piece.y + r) * BLOCK + BLOCK / 2;
        burst(px, py, GLOW_COLORS[piece.id], 6);
        spark(px, py, GLOW_COLORS[piece.id], 3);
      }
  confetti((piece.x + piece.shape[0].length / 2) * BLOCK, piece.y * BLOCK, 40);
  beam((piece.x + 0.5) * BLOCK);
  flashEdge();
  rgbFx();
  sfx.lock();
  merge(board, piece);
  locking = false;
  lockTimer = 0;
  if (!gameOver) {
    let full = 0;
    for (let r = 0; r < ROWS; r++)
      if (board[r].every(v => v !== 0)) full++;
    if (full > 0) {
      beginBreakTease();
      return;
    }
    afterLock();
  }
  shake();
}

function firework() {
  const x = 30 + Math.random() * 240;
  const y = 80 + Math.random() * 240;
  const colors = ['255,0,255', '0,255,255', '255,255,0', '255,80,0', '0,255,80'];
  const c = colors[Math.random() * colors.length | 0];
  burst(x, y, c, 70);
  spark(x, y, '255,255,255', 25);
  ring(x, y, c);
  if (actx) tone(400 + Math.random() * 500, 0.35, 'triangle', 0.08, 0, 150);
}

function floatScore(x, y, txt, big) {
  const el = document.createElement('div');
  el.className = 'f-float' + (big ? ' big rainbow' : '');
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.color = big ? '#ff0' : '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  el.textContent = txt;
  floatsEl.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function createBoard() {
  return Array.from({length: ROWS}, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const id = (Math.random() * 7 | 0) + 1;
  const shape = SHAPES[id].map(r => [...r]);
  return { shape, id, x: (COLS - shape[0].length) / 2 | 0, y: 0 };
}

function collides(board, piece) {
  for (let r = 0; r < piece.shape.length; r++)
    for (let c = 0; c < piece.shape[r].length; c++)
      if (piece.shape[r][c]) {
        const nx = piece.x + c, ny = piece.y + r;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && board[ny][nx]) return true;
      }
  return false;
}

function merge(board, piece) {
  for (let r = 0; r < piece.shape.length; r++)
    for (let c = 0; c < piece.shape[r].length; c++)
      if (piece.shape[r][c]) {
        if (piece.y + r < 0) { gameOver = true; return; }
        board[piece.y + r][piece.x + c] = piece.id;
      }
}

function burst(cx, cy, color, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 2 + Math.random() * 8;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 3,
      life: 1,
      decay: 0.008 + Math.random() * 0.015,
      size: 2 + Math.random() * 4,
      color,
      type: 1
    });
  }
}

function spark(cx, cy, color, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 4 + Math.random() * 14;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 4,
      life: 1,
      decay: 0.02 + Math.random() * 0.03,
      size: 0.5 + Math.random() * 2,
      color,
      type: 2
    });
  }
}

function confetti(cx, cy, count) {
  const palette = ['255,0,255', '0,255,255', '255,255,0', '0,255,0', '255,0,0', '0,128,255'];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 2 + Math.random() * 12;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 6,
      life: 1,
      decay: 0.004 + Math.random() * 0.01,
      size: 3 + Math.random() * 6,
      color: palette[i % palette.length],
      type: 3,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4
    });
  }
}

function ring(cx, cy, color) {
  particles.push({
    x: cx, y: cy, vx: 0, vy: 0,
    life: 1, decay: 0.01, size: 4,
    color, type: 4, radius: 4, growth: 6
  });
}

function trail(cx, cy, color) {
  particles.push({
    x: cx + (Math.random() - 0.5) * BLOCK,
    y: cy + (Math.random() - 0.5) * BLOCK,
    vx: (Math.random() - 0.5) * 0.6,
    vy: (Math.random() - 0.5) * 0.6,
    life: 0.6,
    decay: 0.03,
    size: 2 + Math.random() * 3,
    color,
    type: 5
  });
}

function beam(cx) {
  particles.push({
    x: cx, y: 0, vx: 0, vy: 0,
    life: 1, decay: 0.02, size: 2,
    color: GLOW_COLORS[4], type: 6, x0: cx
  });
}

function flashEdge() {
  const lt = document.getElementById('lightning');
  lt.classList.remove('zz');
  void lt.offsetWidth;
  lt.classList.add('zz');
}

function confettiRain(count) {
  const palette = ['255,0,255', '0,255,255', '255,255,0', '0,255,0', '255,0,0', '0,128,255', '255,128,0'];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * 300,
      y: Math.random() * -40,
      vx: (Math.random() - 0.5) * 2,
      vy: 1.5 + Math.random() * 3,
      life: 1,
      decay: 0.002,
      size: 4 + Math.random() * 6,
      color: palette[i % palette.length],
      type: 3,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.5
    });
  }
}

function gameOverBlast() {
  const palette = ['255,0,255', '0,255,255', '255,255,0', '0,255,0', '255,0,0', '0,128,255'];
  for (let xs = 0; xs < COLS; xs++)
    for (let ys = 0; ys < ROWS; ys++)
      if (board[ys][xs]) {
        burst(xs * BLOCK + BLOCK / 2, ys * BLOCK + BLOCK / 2, GLOW_COLORS[board[ys][xs]], 4);
        spark(xs * BLOCK + BLOCK / 2, ys * BLOCK + BLOCK / 2, palette[board[ys][xs] % palette.length], 2);
      }
  for (let i = 0; i < 5; i++)
    ring(150 + (Math.random() - 0.5) * 100, 300 + (Math.random() - 0.5) * 200, '255,255,0');
  confettiRain(80);
  flashFx();
  shake();
}

function flashFx() {
  flashEl.classList.remove('on');
  void flashEl.offsetWidth;
  flashEl.classList.add('on');
}

function textFx(msg) {
  textEl.textContent = msg;
  textEl.classList.remove('show');
  void textEl.offsetWidth;
  textEl.classList.add('show');
}

function shake() {
  wrapper.classList.remove('shake');
  void wrapper.offsetWidth;
  wrapper.classList.add('shake');
}

function removeLines() {
  let cleared = 0;
  const rows = [];
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      rows.push(r);
      cleared++;
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      r++;
    }
  }
  if (cleared) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
  } else {
    combo = 0;
  }
  hudc.combo(combo);
  if (combo > 1) {
    hudc.comboGold(true);
    textFx('КОМБО x' + combo);
  } else {
    hudc.comboGold(false);
  }

  if (cleared) {
    const pts = [0, 100, 300, 500, 800];
    const bonus = (combo > 1) ? combo * 200 : 0;
    const gained = pts[cleared] * level + bonus;
    score += gained;
    lines += cleared;
    level = (lines / 10 | 0) + 1;
    dropInterval = Math.max(50, 1000 - (level - 1) * 80);
    let fy = rows[0];
    const cx = 150, cy = (fy + 0.5) * BLOCK;
    floatScore(cx, cy, '+' + gained, cleared >= 3);
    if (cleared === 4) {
      burst(cx, cy, '255,255,0', 120);
      burst(cx, cy, '255,0,255', 80);
      spark(cx, cy, '255,255,255', 60);
      confetti(cx, cy - 30, 70);
      ring(cx, cy);
      ring(cx, cy);
      textFx('ТЕТРИС!');
      confettiRain(40);
      flashEdge();
      slowmoT = 500;
      rgbFx();
    } else if (cleared === 3) {
      burst(cx, cy, '255,0,255', 80);
      spark(cx, cy, '255,255,0', 40);
      confetti(cx, cy - 20, 50);
      ring(cx, cy);
      flashEdge();
    } else if (cleared === 2) {
      burst(cx, cy, '0,255,255', 50);
      spark(cx, cy, '255,255,255', 25);
      confetti(cx, cy - 10, 30);
    } else {
      burst(cx, cy, GLOW_COLORS[4], 30);
      spark(cx, cy, '255,255,255', 15);
    }
    for (const row of rows) {
      for (let i = 0; i < 5; i++) {
        const px = Math.random() * 300;
        spark(px, (row + 0.5) * BLOCK, GLOW_COLORS[4], 6);
      }
    }
    sfx.line(cleared);
    if (combo > 1) sfx.combo(combo);
    if (combo > 2) {
      confetti(cx, cy - 50, combo * 10);
      textFx('КОМБО x' + combo + '!');
      flashEdge();
      const fw = Math.min(combo, 5);
      for (let i = 0; i < fw; i++) setTimeout(firework, i * 90);
      if (combo >= 4) rgbFx();
    }
    if (level > lastLevel) {
      lastLevel = level;
      flevel = level;
      textFx('УРОВЕНЬ ' + level + '!');
      confettiRain(60);
      flashEdge();
      floatScore(150, 200, 'LEVEL ' + level, true);
      hudc.levelPulse();
      sfx.level();
    }
    if (flevel > 1) {
      const bfx = document.getElementById('board-fx');
      bfx.classList.add('intense');
      clearTimeout(bfx._t);
      bfx._t = setTimeout(() => bfx.classList.remove('intense'), 1500);
    }
    flashFx();
    shake();
    canvas.classList.remove('glow');
    void canvas.offsetWidth;
    canvas.classList.add('glow');
  }
}

function rotate(piece) {
  const prevBoard = board.map(r => [...r]);
  const shape = piece.shape;
  const rotated = shape[0].map((_, i) => shape.map(r => r[i]).reverse());
  const prev = piece.shape;
  piece.shape = rotated;
  if (collides(board, piece)) {
    piece.shape = prev;
  }
  void prevBoard;
}

function drawBlock(context, x, y, color, size, glow) {
  context.fillStyle = color;
  context.fillRect(x * size, y * size, size, size);
  context.fillStyle = 'rgba(255,255,255,0.2)';
  context.fillRect(x * size, y * size, size, 2);
  context.fillRect(x * size, y * size, 2, size);
  context.fillStyle = 'rgba(0,0,0,0.25)';
  context.fillRect(x * size + size - 2, y * size, 2, size);
  context.fillRect(x * size, y * size + size - 2, size, 2);
  if (glow) {
    context.fillStyle = 'rgba(255,255,255,0.18)';
    context.fillRect(x * size + size * 0.3, y * size + size * 0.3, size * 0.4, size * 0.4);
  }
}

function draw() {
  if (!board) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0f0f3a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c]) drawBlock(ctx, c, r, COLORS[board[r][c]], BLOCK, 'rgba(' + GLOW_COLORS[board[r][c]] + ',0.6)');

  if (piece) {
    if (hardDropping) {
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 2;
      for (let c = 0; c < piece.shape[0].length; c++) {
        const lx = (piece.x + c) * BLOCK + BLOCK / 2;
        ctx.strokeStyle = 'rgba(' + GLOW_COLORS[piece.id] + ',0.8)';
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx, canvas.height);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    const ghost = { shape: piece.shape.map(r => [...r]), x: piece.x, y: piece.y };
    while (!collides(board, ghost)) ghost.y++;
    ghost.y--;
    for (let r = 0; r < ghost.shape.length; r++)
      for (let c = 0; c < ghost.shape[r].length; c++)
        if (ghost.shape[r][c] && ghost.y + r >= 0 && ghost.y + r < ROWS) {
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = COLORS[piece.id];
          ctx.fillRect((ghost.x + c) * BLOCK, (ghost.y + r) * BLOCK, BLOCK, BLOCK);
          ctx.globalAlpha = 1;
        }
    const flash = locking ? (0.3 + 0.7 * Math.abs(Math.sin(Date.now() * 0.012))) : 1;
    for (let r = 0; r < piece.shape.length; r++)
      for (let c = 0; c < piece.shape[r].length; c++)
        if (piece.shape[r][c] && piece.y + r >= 0) {
          drawBlock(ctx, piece.x + c, piece.y + r, COLORS[piece.id], BLOCK, 'rgba(' + GLOW_COLORS[piece.id] + ',0.8)');
          if (locking) {
            ctx.globalAlpha = 0.3 * flash;
            ctx.fillStyle = '#fff';
            ctx.fillRect((piece.x + c) * BLOCK, (piece.y + r) * BLOCK, BLOCK, BLOCK);
            ctx.globalAlpha = 1;
          }
        }
    if (locking && lockTimer > 50) {
      const progress = Math.min(1, lockTimer / LOCK_DELAY);
      ctx.strokeStyle = 'rgba(255,80,80,' + (0.5 + 0.5 * progress) + ')';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      for (let r = 0; r < piece.shape.length; r++)
        for (let c = 0; c < piece.shape[r].length; c++)
          if (piece.shape[r][c] && piece.y + r >= 0) {
            ctx.strokeRect((piece.x + c) * BLOCK + 1, (piece.y + r) * BLOCK + 1, BLOCK - 2, BLOCK - 2);
          }
      ctx.setLineDash([]);
    }
  }

  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (nextPiece) {
    const s = 24;
    const ox = (nextCanvas.width - nextPiece.shape[0].length * s) / 2;
    const oy = (nextCanvas.height - nextPiece.shape.length * s) / 2;
    nextCtx.shadowColor = 'rgba(' + GLOW_COLORS[nextPiece.id] + ',0.8)';
    nextCtx.shadowBlur = 10;
    for (let r = 0; r < nextPiece.shape.length; r++)
      for (let c = 0; c < nextPiece.shape[r].length; c++)
        if (nextPiece.shape[r][c]) {
          nextCtx.fillStyle = COLORS[nextPiece.id];
          nextCtx.fillRect(ox + c * s, oy + r * s, s, s);
          nextCtx.fillStyle = 'rgba(255,255,255,0.2)';
          nextCtx.fillRect(ox + c * s, oy + r * s, s, 2);
          nextCtx.fillRect(ox + c * s, oy + r * s, 2, s);
        }
    nextCtx.shadowBlur = 0;
  }

  hudc.score(score);
  hudc.level(level);
  hudc.lines(lines);
}

function drawParticles(ctx) {
  ctx.globalCompositeOperation = 'lighter';
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * partSlow;
    p.y += p.vy * partSlow;
    p.life -= p.decay * partSlow;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    ctx.globalAlpha = Math.max(0, p.life);
    switch (p.type) {
      case 1:
        p.vy += 0.12 * partSlow;
        p.vx *= 0.99;
        ctx.fillStyle = 'rgba(' + p.color + ',' + p.life + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 2:
        p.vy += 0.04 * partSlow;
        ctx.strokeStyle = 'rgba(' + p.color + ',' + p.life + ')';
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 2, p.y - p.vy * 2);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = p.life * 0.8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 3:
        p.vy += 0.02 * partSlow;
        p.vx *= 0.998;
        p.rot = (p.rot || 0) + (p.vr || 0) * partSlow;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = 'rgba(' + p.color + ',' + p.life + ')';
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
        break;
      case 4:
        p.radius += p.growth * partSlow;
        ctx.strokeStyle = 'rgba(' + p.color + ',' + p.life + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 5:
        p.vy += 0.005 * partSlow;
        p.vx *= 0.98;
        ctx.globalAlpha = Math.max(0, p.life * 0.6);
        ctx.fillStyle = 'rgba(' + p.color + ',1)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 6:
        ctx.save();
        ctx.globalAlpha = p.life * 0.5;
        const grad = ctx.createLinearGradient(0, 0, 0, 600);
        grad.addColorStop(0, 'rgba(255,255,0,0)');
        grad.addColorStop(0.3, 'rgba(255,255,0,' + (0.8 * p.life) + ')');
        grad.addColorStop(0.7, 'rgba(255,255,0,' + (0.8 * p.life) + ')');
        grad.addColorStop(1, 'rgba(255,255,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(p.x0 - 16, 0, 32, 600);
        ctx.strokeStyle = 'rgba(255,255,255,' + p.life + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x0 - 16, 0);
        ctx.lineTo(p.x0 - 16, 600);
        ctx.moveTo(p.x0 + 16, 0);
        ctx.lineTo(p.x0 + 16, 600);
        ctx.stroke();
        ctx.restore();
        break;
      case 7:
        ctx.fillStyle = 'rgba(' + p.color + ',' + (p.life * 0.28) + ')';
        ctx.fillRect(p.x - 3, p.y - 3, BLOCK + 6, BLOCK + 6);
        ctx.fillStyle = 'rgba(' + p.color + ',' + (p.life * 0.55) + ')';
        ctx.fillRect(p.x, p.y, BLOCK, BLOCK);
        break;
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

function drop() {
  if (locking) return;
  piece.y++;
  if (collides(board, piece)) {
    piece.y--;
    startLock();
  }
  dropCounter = 0;
}

function startLock() {
  if (locking) return;
  locking = true;
  lockTimer = 0;
  ring((piece.x + piece.shape[0].length / 2) * BLOCK, (piece.y + piece.shape.length) * BLOCK, GLOW_COLORS[piece.id]);
  sfx.lock();
  hitPunch();
}

function lockPlace() {
  locking = false;
  lockTimer = 0;
  let hit = false;
  for (let r = 0; r < piece.shape.length; r++)
    for (let c = 0; c < piece.shape[r].length; c++)
      if (piece.shape[r][c] && piece.y + r >= 0) {
        trail((piece.x + c) * BLOCK + BLOCK / 2, (piece.y + r) * BLOCK + BLOCK / 2, GLOW_COLORS[piece.id]);
        if (!hit) { hit = true; spark((piece.x + c) * BLOCK + BLOCK / 2, (piece.y + r) * BLOCK + BLOCK / 2, GLOW_COLORS[piece.id], 6); }
      }
  merge(board, piece);
  if (gameOver) return;
  let full = 0;
  for (let r = 0; r < ROWS; r++)
    if (board[r].every(v => v !== 0)) full++;
  if (full > 0) {
    beginBreakTease();
    return;
  }
  afterLock();
}

function afterLock() {
  piece = nextPiece;
  nextPiece = randomPiece();
  dropCounter = 0;
  if (collides(board, piece)) {
    gameOver = true;
  }
}

function beginBreakTease() {
  breakRows = [];
  for (let r = 0; r < ROWS; r++)
    if (board[r].every(v => v !== 0)) breakRows.push(r);
  aboutToBreak = true;
  breakTicker = 0;
  const n = breakRows.length;
  breakTimer = 720 + n * 160;
  slowmoT = breakTimer + 260;
  freezeT = 50 + n * 20;
  stage.style.transition = 'none';
  const rowFlash = document.getElementById('rowflash');
  rowFlash.style.top = (breakRows[0] * BLOCK - 1) + 'px';
  rowFlash.style.height = (n * BLOCK + 2) + 'px';
  try { if (musicOn) boom(0.4, 0.3, 130); } catch (e) { }
}

function tickBreakFx(realDt) {
  const rowFlash = document.getElementById('rowflash');
  const vign = document.getElementById('vignette');
  const total = 720 + breakRows.length * 160;
  const elapsed = total - breakTimer;
  const frac = Math.min(1, elapsed / total);
  const n = breakRows.length;
  const cx = 160, cy = (breakRows[0] + 0.5) * BLOCK;
  const wob = Math.sin(elapsed * 0.055) * (0.11 + n * 0.05) * frac;
  const s = 1.18 + wob + frac * frac * 0.55;
  const rot = Math.sin(elapsed * 0.08) * (1.1 + n * 0.5) * frac;
  const jx = (Math.random() - 0.5) * (2 + frac * 26);
  const jy = (Math.random() - 0.5) * (2 + frac * 26);
  stage.style.transformOrigin = cx + 'px ' + cy + 'px';
  stage.style.transform = 'translate(' + jx + 'px,' + jy + 'px) rotate(' + rot + 'deg) scale(' + s + ')';
  stage.style.filter = 'hue-rotate(' + (Math.sin(elapsed * 0.02) * 45 * frac) + 'deg) saturate(' + (1.2 + Math.sin(elapsed * 0.05) * 0.55) + ') brightness(' + (1 + 0.25 * Math.sin(elapsed * 0.06)) + ')';
  rowFlash.style.opacity = 0.3 + 0.5 * Math.abs(Math.sin(elapsed * 0.06));
  vign.style.opacity = Math.min(0.9, frac * 1.2);
  breakTicker += realDt;
  if (actx && musicOn && breakTicker > 115) {
    tone(170 + frac * 780, 0.07, 'square', 0.04, 0, 170 + frac * 1050);
    breakTicker = 0;
  }
  if (Math.random() < 0.5) {
    spark(cx + (Math.random() - 0.5) * 280, cy + (Math.random() - 0.5) * 60, '255,255,0', 2);
    if (Math.random() < 0.4) ring(cx + (Math.random() - 0.5) * 240, cy, '255,255,0');
  }
}

function performBreak() {
  const n = breakRows.length;
  const cy = (breakRows[0] + 0.5) * BLOCK;
  document.getElementById('rowflash').style.opacity = 0;
  const vign = document.getElementById('vignette');
  vign.style.opacity = 0;
  stage.style.transition = 'transform 70ms ease-out';
  stage.style.transformOrigin = '150px ' + cy + 'px';
  stage.style.transform = 'rotate(3deg) scale(1.75)';
  stage.style.filter = 'hue-rotate(140deg) saturate(2.6) brightness(1.6)';
  flashFx();
  flashEdge();
  shake();
  if (n >= 3) rgbFx();
  try { if (musicOn) { boom(0.55, 0.6, 80); noisew(0.3, 0.35); } } catch (e) { }
  removeLines();
  afterLock();
  setTimeout(() => {
    vign.style.transition = 'opacity 300ms ease-out';
    setTimeout(() => { vign.style.transition = ''; }, 320);
    stage.style.transition = 'transform 320ms cubic-bezier(.2,.9,.3,1.6), filter 320ms ease-out';
    stage.style.transform = 'scale(1)';
    stage.style.filter = '';
    setTimeout(() => {
      stage.style.transition = '';
      stage.style.transform = '';
      stage.style.transformOrigin = '';
    }, 340);
  }, 70);
}

function update(time = 0) {
  if (gameOver) {
    if (!blastDone) {
      blastDone = true;
      sfx.over();
      gameOverBlast();
      setTimeout(gameOverBlast, 400);
      rgbFx();
    }
    draw();
    drawParticles(ctx);
    if (!__goShown) { __goShown = true; hudc.gameOver(score, maxCombo); }
    animFrame = requestAnimationFrame(update);
    return;
  }
  if (!paused) {
    let dt = time - lastTime;
    lastTime = time;
    const realDt = dt;
    if (freezeT > 0) {
      freezeT -= realDt;
      dt = 0;
    } else if (slowmoT > 0) {
      slowmoT -= realDt;
      dt *= 0.16;
    }
    partSlow = (freezeT > 0) ? 0 : (slowmoT > 0 ? 0.18 : 1);
    if (aboutToBreak) {
      breakTimer -= realDt;
      if (breakTimer <= 0) {
        aboutToBreak = false;
        performBreak();
        if (gameOver) { draw(); drawParticles(ctx); }
      } else {
        tickBreakFx(realDt);
      }
    } else if (hardDropping) {
      hardDropTimer += dt;
      while (hardDropTimer >= HARD_SPEED && piece.y < hardDropTarget) {
        piece.y++;
        hardDropTimer -= HARD_SPEED;
        spawnHardTrail();
      }
      if (piece.y >= hardDropTarget || hardDropTimer > 4000) {
        hardDropping = false;
        finishHardDrop();
        if (gameOver) { draw(); drawParticles(ctx); }
      }
    } else if (locking) {
      lockTimer += dt;
      if (lockTimer >= LOCK_DELAY) {
        lockPlace();
        if (gameOver) { draw(); drawParticles(ctx); }
      }
    } else {
      dropCounter += dt;
      if (dropCounter > dropInterval) drop();
    }
    if (piece && !aboutToBreak && !locking && dropCounter > 300 && Math.random() < 0.2) {
      for (let r = 0; r < piece.shape.length; r++)
        for (let c = 0; c < piece.shape[r].length; c++)
          if (piece.shape[r][c] && piece.y + r >= 0 && Math.random() < 0.25)
            trail((piece.x + c) * BLOCK + BLOCK / 2, (piece.y + r) * BLOCK + BLOCK / 2, GLOW_COLORS[piece.id]);
    }
    if (particles.length > 700) particles.splice(0, particles.length - 700);
    if (Math.random() < 0.12) {
      const a = Math.random() * Math.PI * 2;
      embers.push({
        x: 150 + Math.cos(a) * 170,
        y: 620 + Math.random() * 20,
        r: 1 + Math.random() * 2.5,
        vy: -(0.5 + Math.random() * 1.2),
        vx: Math.sin(a) * 0.4
      });
    }
    draw();
    drawParticles(ctx);
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.x += e.vx * partSlow; e.y += e.vy * partSlow;
      if (e.y < -10) { embers.splice(i, 1); continue; }
      const a = Math.min(0.9, (620 - e.y) / 300);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(255,200,80,0.5)';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(255,230,150,1)';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (0.6 + (1 - e.y / 630)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  window.__sf = (window.__sf || 0) + 1;
  if (window.__sf % 3 === 0) sendState();
  animFrame = requestAnimationFrame(update);
}

let __goShown = false;

function startGame() {
  board = createBoard();
  score = 0; lines = 0; level = 1; combo = 0; maxCombo = 0;
  dropCounter = 0;
  dropInterval = 1000;
  lastTime = performance.now();
  paused = false;
  gameOver = false;
  locking = false;
  lockTimer = 0;
  lastLevel = 1;
  flevel = 1;
  blastDone = false;
  slowmo = 1; slowmoT = 0; freezeT = 0;
  hardDropping = false;
  hardDropTarget = -1;
  hardDropTimer = 0;
  aboutToBreak = false;
  breakRows = [];
  breakTimer = 0;
  document.getElementById('rowflash').style.opacity = 0;
  document.getElementById('vignette').style.opacity = 0;
  stage.style.transition = '';
  stage.style.transform = '';
  stage.style.filter = '';
  stage.style.transformOrigin = '';
  musicStep = 0;
  particles = [];
  meteors = [];
  embers = [];
  nebulas = [];
  piece = randomPiece();
  nextPiece = randomPiece();

  __goShown = false;
  hudc.menu(false);

  if (animFrame) cancelAnimationFrame(animFrame);
  animFrame = requestAnimationFrame(update);
}

document.addEventListener('keydown', e => {
  if (gameOver) return;
  if (!piece) return;
  initAudio();
  if (!musicOn && typeof level === 'number') startMusic();
  if (e.key === 'p' || e.key === 'P' || e.key === 'з' || e.key === 'З') {
    paused = !paused;
    if (!paused) { lastTime = performance.now(); animFrame = requestAnimationFrame(update); }
    return;
  }
  if (paused) return;
  if (hardDropping) { e.preventDefault(); return; }
  const onMove = () => {
    if (locking) {
      if (collides(board, piece)) {
        lockTimer = 0;
      } else {
        locking = false;
        lockTimer = 0;
        dropCounter = 0;
      }
    }
  };
  switch (e.key) {
    case 'ArrowLeft':
      piece.x--;
      if (collides(board, piece)) piece.x++;
      if (!collides(board, piece)) { onMove(); sfx.move(); }
      e.preventDefault();
      break;
    case 'ArrowRight':
      piece.x++;
      if (collides(board, piece)) piece.x--;
      if (!collides(board, piece)) { onMove(); sfx.move(); }
      e.preventDefault();
      break;
    case 'ArrowDown':
      drop();
      sfx.soft();
      e.preventDefault();
      break;
    case 'ArrowUp':
      rotate(piece);
      onMove();
      sfx.rotate();
      e.preventDefault();
      break;
    case ' ':
      if (hardDropping) { e.preventDefault(); break; }
      let target = piece.y;
      while (!collides(board, { shape: piece.shape, x: piece.x, y: target + 1 })) target++;
      hardDropTarget = target;
      hardDropTimer = 0;
      hardDropping = true;
      sfx.hard();
      rgbFx();
      e.preventDefault();
      break;
  }
  draw();
});

function startNewGame() { initAudio(); startMusic(); startGame(); }

function sendState() {
  if (!Net.ready()) return;
  if (!board || !piece) return;
  let gy = piece.y;
  while (!collides(board, { shape: piece.shape, x: piece.x, y: gy + 1 })) gy++;
  Net.send({
    type: 'state',
    board: board,
    piece: { shape: piece.shape, x: piece.x, y: piece.y, id: piece.id },
    gy: gy,
    score: score,
    lines: lines,
    level: level,
    over: gameOver ? 1 : 0
  });
}

const OPP_CELL = 12;
const OPP_W = 120;
const OPP_H = 240;
function drawOpp(tctx, o) {
  const now = performance.now();
  tctx.clearRect(0, 0, OPP_W, OPP_H);
  tctx.fillStyle = '#0d0d38';
  tctx.fillRect(0, 0, OPP_W, OPP_H);
  tctx.strokeStyle = 'rgba(0,255,255,0.05)';
  tctx.lineWidth = 1;
  tctx.beginPath();
  for (let g = 1; g < 10; g++) { tctx.moveTo(g * OPP_CELL, 0); tctx.lineTo(g * OPP_CELL, OPP_H); }
  for (let g = 1; g < 20; g++) { tctx.moveTo(0, g * OPP_CELL); tctx.lineTo(OPP_W, g * OPP_CELL); }
  tctx.stroke();
  if (o.board) {
    for (let r = 0; r < 20; r++)
      for (let c = 0; c < 10; c++) {
        const v = o.board[r] && o.board[r][c];
        if (!v) continue;
        tctx.fillStyle = COLORS[v] || '#fff';
        tctx.fillRect(c * OPP_CELL + 1, r * OPP_CELL + 1, OPP_CELL - 2, OPP_CELL - 2);
        tctx.fillStyle = 'rgba(255,255,255,0.18)';
        tctx.fillRect(c * OPP_CELL + 1, r * OPP_CELL + 1, OPP_CELL - 2, 2);
        tctx.fillStyle = 'rgba(0,0,0,0.2)';
        tctx.fillRect(c * OPP_CELL + 1, r * OPP_CELL + OPP_CELL - 3, OPP_CELL - 2, 2);
      }
  }
  if (o.piece && o.piece.shape) {
    const sh = o.piece.shape;
    const p = o.piece;
    if (o.lastId !== p.id) {
      o.lastId = p.id;
      o.px = p.x;
      o.py = p.y;
      o.pgy = (p.gy != null) ? p.gy : p.y;
    } else if (o.t) {
      o.px += (o.t.x - o.px) * 0.22;
      o.py += (o.t.y - o.py) * 0.22;
      if (p.gy != null) o.pgy += (p.gy - o.pgy) * 0.22;
    }
    const px = o.px, py = o.py, gy = o.pgy;
    if (p.gy != null) {
      tctx.globalAlpha = 0.22;
      for (let r = 0; r < sh.length; r++)
        for (let c = 0; c < sh[r].length; c++)
          if (sh[r][c]) {
            tctx.fillStyle = COLORS[p.id] || '#fff';
            tctx.fillRect((px + c) * OPP_CELL, (gy + r) * OPP_CELL, OPP_CELL, OPP_CELL);
          }
      tctx.globalAlpha = 1;
    }
    tctx.save();
    tctx.globalCompositeOperation = 'lighter';
    tctx.fillStyle = (COLORS[p.id] || '#fff') + '50';
    for (let r = 0; r < sh.length; r++)
      for (let c = 0; c < sh[r].length; c++)
        if (sh[r][c]) tctx.fillRect((px + c) * OPP_CELL, (py + r) * OPP_CELL, OPP_CELL, OPP_CELL);
    tctx.restore();
    for (let r = 0; r < sh.length; r++)
      for (let c = 0; c < sh[r].length; c++)
        if (sh[r][c]) {
          tctx.fillStyle = COLORS[p.id] || '#fff';
          tctx.fillRect((px + c) * OPP_CELL + 1, (py + r) * OPP_CELL + 1, OPP_CELL - 2, OPP_CELL - 2);
          tctx.fillStyle = 'rgba(255,255,255,0.3)';
          tctx.fillRect((px + c) * OPP_CELL + 1, (py + r) * OPP_CELL + 1, OPP_CELL - 2, 2);
        }
  }
  if (o.flashT && now < o.flashT) {
    const a = (o.flashT - now) / 450;
    tctx.fillStyle = 'rgba(255,255,255,' + (a * 0.45) + ')';
    tctx.fillRect(0, 0, OPP_W, OPP_H);
    tctx.strokeStyle = 'rgba(255,255,255,' + (a * 0.9) + ')';
    tctx.lineWidth = 3;
    tctx.strokeRect(0, 0, OPP_W, OPP_H);
  }
  if (o.over) {
    tctx.fillStyle = 'rgba(0,0,0,0.55)';
    tctx.fillRect(0, 0, OPP_W, OPP_H);
    tctx.fillStyle = '#ff4444';
    tctx.font = 'bold 13px monospace';
    tctx.textAlign = 'center';
    tctx.fillText('GAME OVER', OPP_W / 2, OPP_H / 2 - 4);
    tctx.fillStyle = '#fff';
    tctx.font = '10px monospace';
    tctx.fillText(o.score + ' очков', OPP_W / 2, OPP_H / 2 + 14);
  }
}

var Net = window.Net = (function () {
  var ws = null, myNick = '', myRoom = null, myId = null;
  var opps = {}, oppOrder = [];
  var subs = {};
  function on(evt, fn) { (subs[evt] = subs[evt] || []).push(fn); return function () { subs[evt] = (subs[evt] || []).filter(x => x !== fn); }; }
  function emit(evt, data) { (subs[evt] || []).forEach(function (fn) { try { fn(data); } catch (e) { } }); }
  function url() { return 'ws://' + (location.hostname || '45.143.93.41') + ':8283'; }
  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
  function ready() { return !!(ws && ws.readyState === 1 && myRoom); }
  function connect() {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    try { ws = new WebSocket(url()); } catch (e) { return; }
    emit('status', 'Подключение...');
    ws.onopen = function () { emit('status', 'Онлайн'); send({ type: 'list' }); };
    ws.onclose = function () {
      emit('status', 'Отключён');
      ws = null;
      if (myRoom) emit('room', null);
      myRoom = null;
    };
    ws.onerror = function () { try { ws.close(); } catch (e) { } };
    ws.onmessage = function (ev) { var d; try { d = JSON.parse(ev.data); } catch (e) { return; } handle(d); };
  }
  function handle(d) {
    switch (d.type) {
      case 'joined':
        myRoom = d.room; myId = d.you;
        opps = {}; oppOrder = [];
        emit('joined', d);
        send({ type: 'list' });
        break;
      case 'err':
        emit('err', d.msg);
        break;
      case 'rooms':
        emit('rooms', d.rooms || []);
        break;
      case 'room':
        emit('room', d);
        break;
      case 'chat':
        emit('chat', d);
        break;
      case 'state':
        if (d.id !== myId) {
          var o = opps[d.id];
          var prevLines = o ? o.lines : 0;
          var prevOver = o ? o.over : 0;
          var isNew = !o;
          if (!o) {
            o = { nick: d.nick, board: null, piece: null, score: 0, lines: 0, level: 1, over: 0 };
            opps[d.id] = o;
            oppOrder.push(d.id);
            while (oppOrder.length > 4) { delete opps[oppOrder.shift()]; }
          }
          o.nick = d.nick; o.board = d.board; o.piece = d.piece;
          o.score = d.score || 0; o.lines = d.lines || 0; o.level = d.level || 1;
          if (o.piece) { o.piece.gy = (d.gy == null) ? o.piece.y : d.gy; o.t = { x: o.piece.x, y: o.piece.y }; } else o.t = null;
          if (!prevOver && d.over) { o.over = performance.now(); if (typeof textFx === 'function') textFx(o.nick + ' ПРОИГРАЛ!'); }
          if (d.lines > prevLines) {
            o.flashT = performance.now() + 450;
            var delta = d.lines - prevLines;
            if (delta >= 4 && typeof textFx === 'function') textFx(o.nick + ' — ТЕТРИС!');
          }
          emit('opps', { isNew: isNew, opp: o });
        }
        break;
    }
  }
  return {
    on: on,
    send: send,
    ready: ready,
    connect: connect,
    create: function (nick) { myNick = nick; connect(); setTimeout(function () { send({ type: 'create', nick: nick }); }, 150); },
    join: function (code, nick) { myNick = nick; connect(); setTimeout(function () { send({ type: 'join', nick: nick, room: code }); }, 150); },
    refresh: function () { connect(); setTimeout(function () { send({ type: 'list' }); }, 150); },
    chat: function (msg) { if (myRoom) send({ type: 'chat', msg: msg }); },
    leave: function () { send({ type: 'leave' }); try { ws && ws.close(); } catch (e) { } },
    nick: function () { return myNick; },
    room: function () { return myRoom; },
    oppIds: function () { return oppOrder.slice(); },
    opp: function (id) { return opps[id]; }
  };
})();

// ===== ФОН: звезды, небо, радуга =====
let stars = [];
function resize() {
  bgCanvas.width = innerWidth;
  bgCanvas.height = innerHeight;
  stars = [];
  const n = Math.min(200, (bgCanvas.width * bgCanvas.height) / 5000 | 0);
  for (let i = 0; i < n; i++) {
    stars.push({
      x: Math.random() * bgCanvas.width,
      y: Math.random() * bgCanvas.height,
      r: Math.random() * 1.8 + 0.3,
      tw: Math.random() * Math.PI * 2,
      sp: 0.005 + Math.random() * 0.02
    });
  }
}
window.addEventListener('resize', resize);

let hue = 0;
function spawnMeteor() {
  meteors.push({
    x: Math.random() * bgCanvas.width,
    y: Math.random() * bgCanvas.height * 0.4,
    vx: (Math.random() * 6 + 3) * (Math.random() < 0.5 ? 1 : -1),
    vy: 2 + Math.random() * 3,
    life: 1,
    decay: 0.004 + Math.random() * 0.003,
    r: 1.5 + Math.random() * 2,
    tw: Math.random() * Math.PI * 2
  });
}
function bgLoop() {
  hue = (hue + 0.8) % 360;
  bgCtx.globalAlpha = 0.12;
  bgCtx.fillStyle = 'hsl(' + hue + ',80%,7%)';
  bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
  bgCtx.globalAlpha = 1;
  for (const s of stars) {
    s.tw += s.sp;
    bgCtx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(s.tw));
    bgCtx.fillStyle = '#fff';
    bgCtx.beginPath();
    bgCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    bgCtx.fill();
  }
  if (Math.random() < 0.02 && meteors.length < 5) spawnMeteor();
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    m.x += m.vx;
    m.y += m.vy;
    m.life -= m.decay;
    m.tw += 0.2;
    if (m.life <= 0 || m.y > bgCanvas.height) { meteors.splice(i, 1); continue; }
    bgCtx.globalAlpha = m.life;
    bgCtx.strokeStyle = 'rgba(255,255,255,0.6)';
    bgCtx.lineWidth = m.r;
    bgCtx.beginPath();
    bgCtx.moveTo(m.x - m.vx * 10, m.y - m.vy * 10);
    bgCtx.lineTo(m.x, m.y);
    bgCtx.stroke();
    bgCtx.fillStyle = '#fff';
    bgCtx.beginPath();
    bgCtx.arc(m.x, m.y, m.r * (1 - m.life * 0.3), 0, Math.PI * 2);
    bgCtx.fill();
  }
  if (nebulas.length < 3) {
    nebulas.push({
      x: Math.random() * bgCanvas.width,
      y: Math.random() * bgCanvas.height,
      r: 80 + Math.random() * 140,
      h: Math.random() * 360,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      phase: Math.random() * Math.PI * 2
    });
  }
  for (let i = nebulas.length - 1; i >= 0; i--) {
    const n = nebulas[i];
    n.x += n.vx; n.y += n.vy;
    n.phase += 0.01;
    n.h = (n.h + 0.3) % 360;
    if (n.x < -n.r * 2) n.x = bgCanvas.width + n.r;
    if (n.x > bgCanvas.width + n.r * 2) n.x = -n.r;
    if (n.y < -n.r * 2) n.y = bgCanvas.height + n.r;
    if (n.y > bgCanvas.height + n.r * 2) n.y = -n.r;
    const pulse = 0.5 + 0.5 * Math.sin(n.phase);
    const g = bgCtx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0, 'hsla(' + n.h + ',90%,60%,' + (0.12 * pulse) + ')');
    g.addColorStop(1, 'hsla(' + n.h + ',90%,60%,0)');
    bgCtx.fillStyle = g;
    bgCtx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
  }
  bgCtx.globalAlpha = 1;
  requestAnimationFrame(bgLoop);
}

const _origUpdate = update;
update = function(time) {
  try {
    _origUpdate(time);
  } catch (err) {
    if (window.__tetrisErrs === undefined) window.__tetrisErrs = 0;
    window.__tetrisErrs++;
    if (window.__tetrisErrs < 50) requestAnimationFrame(update);
  }
};

function __mountBg() { if (bgCtx) resize(); }
window.TetrisEngine = {
  setup: function (refs, hud) { setupDom(refs); setupHud(hud); resize(); requestAnimationFrame(bgLoop); },
  start: function () { startNewGame(); },
  drawOpp: drawOpp
};
})();
