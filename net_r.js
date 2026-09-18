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