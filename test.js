const fs = require('fs');

function makeCtx() {
  const noopFn = () => {};
  return new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'canvas') return { width: 300, height: 600 };
      return noopFn;
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

function makeEl(id) {
  const el = {
    id, style: new Proxy({}, {
      set(t, k, v) { t[k] = v; return true; },
      get(t, k) { return k in t ? t[k] : undefined; }
    }),
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); },
      contains(c) { return this._s.has(c); }
    },
    dataset: {},
    offsetHeight: 600,
    width: 300, height: 600,
    textContent: '',
    children: [],
    getContext: makeCtx,
    appendChild(c) { this.children.push(c); },
    setProperty() {},
    addEventListener() {},
    querySelectorAll() { return []; }
  };
  return el;
}

const els = {};
global.scratch = {};
global.document = {
  getElementById(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
  createElement(tag) { const e = makeEl('x-' + Math.random()); e.getContext = makeCtx; return e; },
  addEventListener() {},
  body: makeEl('body')
};
global.window = global;
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.setInterval = () => {};
global.clearInterval = () => {};
global.location = { hostname: '45.143.93.41' };
global.performance = { now: () => Date.now() };
global.innerWidth = 1400;
global.innerHeight = 900;
global.requestAnimationFrame = () => 1;
global.cancelAnimationFrame = () => {};
global.WebSocket = class { constructor() { this.readyState = 0; } };
global.AudioContext = undefined;

const src = fs.readFileSync('engine_r.js', 'utf8');
try {
  eval(src);
  console.log('engine eval: OK');
} catch (e) {
  console.log('engine eval: THREW ->', e.message);
  console.log((e.stack || '').split('\n').slice(0, 4).join('\n'));
  process.exit(1);
}

const boardEl = global.document.getElementById('board-canvas');
const nextEl = global.document.getElementById('next-canvas');
const stageEl = global.document.getElementById('stage');
const wrapEl = global.document.getElementById('game-wrapper');
const bgEl = global.document.getElementById('bg');

try {
  global.TetrisEngine.setup({
    board: boardEl, nextCanvas: nextEl, stage: stageEl, wrapper: wrapEl, bg: bgEl
  }, {
    score() {}, level() {}, lines() {}, combo() {}, comboGold() {}, levelPulse() {},
    menu() {}, gameOver() {}
  });
  console.log('engine setup: OK');
} catch (e) {
  console.log('engine setup: THREW ->', e.message);
  process.exit(1);
}

try {
  global.TetrisEngine.start();
  console.log('engine start: OK');
} catch (e) {
  console.log('engine start: THREW ->', e.message);
  process.exit(1);
}

// simulate a few frames
const update = (global.TetrisEngine._upd);
try {
  for (let i = 0; i < 200; i++) {
    global.document.getElementById('score').textContent = String(i);
  }
  console.log('engine has exports:', Object.keys(global.TetrisEngine));
} catch (e) {
  console.log('iter: THREW ->', e.message);
}

// Net module smoke
try {
  global.Net.connect();
  console.log('net connect: OK (stub ws)');
  global.Net.create('Тест');
  console.log('net create: OK (stub ws)');
} catch (e) {
  console.log('net: THREW ->', e.message);
  process.exit(1);
}

// app.js in node: stub React/ReactDOM UMD
global.React = require('/tmp/tetris/react.production.min.js');
global.ReactDOM = require('/tmp/tetris/react-dom.production.min.js');
console.log('React loaded:', typeof global.React.createElement, '| ReactDOM:', typeof global.ReactDOM);
global.ReactDOM.createRoot = (el) => ({ render: (vnode) => { console.log('root render: OK'); } });
try {
  eval(fs.readFileSync('app.js', 'utf8'));
  console.log('app eval: OK');
} catch (e) {
  console.log('app eval: THREW ->', e.message);
  console.log(e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : '');
  process.exit(1);
}
console.log('ALL CHECKS PASSED');