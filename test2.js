const fs = require('fs');
const { JSDOM } = require('./testenv/node_modules/jsdom');

function makeCtxStub() {
  const noop = () => {};
  const grad = { addColorStop: noop };
  const stub = {};
  const proxy = new Proxy(stub, {
    get(t, k) {
      if (k === 'canvas') return { width: 300, height: 600 };
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'measureText') return () => ({ width: 0 });
      if (k === 'getImageData') return () => ({ data: [], width: 0, height: 0 });
      if (k in t) return t[k];
      return noop;
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  return proxy;
}

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
  url: 'http://tetris.test:6767/',
  pretendToBeVisual: true,
  runScripts: 'outside-only'
});
const w = dom.window;
const d = w.document;

// canvas 2d stub so engine/drawOpp don't crash
w.HTMLCanvasElement.prototype.getContext = function () { return makeCtxStub(); };

// websocket stub: instantly "connect" via Net (auto-open + fake join), capture frames
w.WebSocket = class {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    w.__wsFrames = w.__wsFrames || [];
    const self = this;
    setTimeout(() => {
      self.readyState = 1;
      if (self.onopen) self.onopen();
      setTimeout(() => {
        if (self.onmessage) self.onmessage({ data: JSON.stringify({ type: 'joined', room: '12345', you: 7 }) });
      }, 20);
    }, 0);
  }
  send(payload) { w.__wsFrames.push(payload); }
  close() { this.readyState = 3; }
};

const frames = () => w.__wsFrames || [];

function evalInWindow(code) {
  const r = w.eval(code);
  return r;
}

const react = fs.readFileSync('react.production.min.js', 'utf8');
const reactDom = fs.readFileSync('react-dom.production.min.js', 'utf8');
const engine = fs.readFileSync('engine_r.js', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');

try { evalInWindow(react); console.log('react loaded:', typeof w.React, typeof w.React.createElement); } catch (e) { console.log('react FAIL', e.message); process.exit(1); }
try { evalInWindow(reactDom); console.log('react-dom loaded:', typeof w.ReactDOM); } catch (e) { console.log('react-dom FAIL', e.message); process.exit(1); }
try { evalInWindow(engine); console.log('engine loaded:', typeof w.TetrisEngine, typeof w.Net); } catch (e) { console.log('engine FAIL', e.message); console.log(e.stack); process.exit(1); }
try { evalInWindow(app); console.log('app loaded'); } catch (e) { console.log('app FAIL', e.message); console.log(e.stack); process.exit(1); }

const wait = (ms) => new Promise(res => setTimeout(res, ms));

(async () => {
  await wait(300);
  const errBox = d.getElementById('js-error');
  if (errBox) { console.log('JS ERROR BANNER:', errBox.textContent); process.exit(1); }

  // overlay visible?
  let overlay = d.getElementById('overlay');
  console.log('start overlay present:', !!overlay);
  console.log('menu present:', !!d.getElementById('menu'));
  console.log('sidebar present:', !!d.getElementById('sidebar'));
  console.log('stage present:', !!d.getElementById('stage'));

  // start game via button
  const startBtn = overlay && overlay.querySelector('button');
  console.log('start button found:', !!startBtn);
  if (startBtn) startBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  await wait(400);
  overlay = d.getElementById('overlay');
  console.log('overlay hidden after start:', !overlay);

  // keyboard: move & rotate
  for (let i = 0; i < 6; i++) {
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await wait(16);
  }
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  await wait(1200);

  // HUD via React state
  const scoreEl = d.getElementById('score');
  console.log('HUD score el text:', scoreEl ? scoreEl.textContent : null);

  // net auto-joined via stub; chat should now send a frame
  await wait(150);
  const chatInput = d.getElementById('chat-input');
  if (chatInput) {
    chatInput.value = 'привет всем';
    chatInput.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }
  await wait(100);
  const msgs = frames();
  console.log('ws frames types:', msgs.map(m => { try { return JSON.parse(m).type; } catch (e) { return '?' } }));
  console.log('frame count:', msgs.length);
  const errBox2 = d.getElementById('js-error');
  if (errBox2) { console.log('JS ERROR BANNER after interactions:', errBox2.textContent); process.exit(1); }
  console.log('INTEGRATION OK');
  process.exit(0);
})().catch(e => { console.log('test harness error:', e.message); process.exit(1); });

setTimeout(() => { console.log('HARNESS TIMEOUT'); process.exit(1); }, 45000);
