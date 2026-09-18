import test from 'node:test';
import assert from 'node:assert/strict';

// Сетевой клиент писался для браузера — подставляем минимальное окружение.
class FakeSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = FakeSocket.CONNECTING;
    this.sent = [];
    FakeSocket.instances.push(this);
  }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = FakeSocket.CLOSED; if (this.onclose) this.onclose(); }
  open() { this.readyState = FakeSocket.OPEN; if (this.onopen) this.onopen(); }
  receive(payload) { if (this.onmessage) this.onmessage({ data: JSON.stringify(payload) }); }
}
FakeSocket.CONNECTING = 0;
FakeSocket.OPEN = 1;
FakeSocket.CLOSED = 3;

globalThis.WebSocket = FakeSocket;
globalThis.location = { protocol: 'http:', hostname: 'example.test' };
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };

const { Net, STATUS } = await import('../src/net/net.js');

function connected() {
  FakeSocket.instances.length = 0;
  const net = new Net();
  net.connect();
  const socket = FakeSocket.instances.at(-1);
  socket.open();
  return { net, socket };
}

test('адрес сокета строится от адреса страницы', () => {
  assert.equal(Net.defaultUrl(), 'ws://example.test:8283');
});

test('после открытия клиент запрашивает список комнат', () => {
  const { net, socket } = connected();
  assert.equal(net.status, STATUS.ONLINE);
  assert.deepEqual(socket.sent, [{ type: 'list' }]);
});

test('вход в комнату откладывается до открытия сокета', () => {
  FakeSocket.instances.length = 0;
  const net = new Net();
  net.joinRoom('12345', 'Игрок');
  const socket = FakeSocket.instances.at(-1);
  assert.deepEqual(socket.sent, [], 'до открытия ничего не ушло');
  socket.open();
  assert.deepEqual(socket.sent.at(-1), { type: 'join', nick: 'Игрок', room: '12345' });
});

test('состояние отправляется только внутри комнаты', () => {
  const { net, socket } = connected();
  const snapshot = { board: [], piece: null, ghostY: 0, score: 10, lines: 1, level: 1, combo: 0, phase: 'falling' };
  net.sendState(snapshot);
  assert.equal(socket.sent.length, 1, 'без комнаты состояние не уходит');
  socket.receive({ type: 'joined', room: '777', you: 1 });
  net.sendState(snapshot);
  assert.equal(socket.sent.at(-1).type, 'state');
  assert.equal(socket.sent.at(-1).score, 10);
});

test('атака уходит соперникам, а входящая приходит подписчику', () => {
  const { net, socket } = connected();
  socket.receive({ type: 'joined', room: '777', you: 1 });
  net.sendAttack(0);
  assert.notEqual(socket.sent.at(-1).type, 'attack', 'пустая атака не отправляется');
  net.sendAttack(4);
  assert.deepEqual(socket.sent.at(-1), { type: 'attack', lines: 4 });

  const received = [];
  net.on('attack', (payload) => received.push(payload));
  socket.receive({ type: 'attack', id: 2, nick: 'Сосед', lines: 3 });
  socket.receive({ type: 'attack', id: 1, nick: 'Я сам', lines: 9 });
  assert.deepEqual(received, [{ lines: 3, from: 'Сосед' }], 'свою же атаку игнорируем');
});

test('состояние соперника обновляется и отмечает выбывших', () => {
  const { net, socket } = connected();
  socket.receive({ type: 'joined', room: '777', you: 1 });

  const events = [];
  net.on('opponentOut', (e) => events.push(['out', e.nick]));
  net.on('opponentTetris', (e) => events.push(['tetris', e.nick]));

  socket.receive({ type: 'state', id: 2, nick: 'Сосед', board: [], piece: null, lines: 0, score: 0 });
  assert.equal(net.opponentList().length, 1);

  socket.receive({ type: 'state', id: 2, nick: 'Сосед', board: [], piece: null, lines: 4, score: 800 });
  socket.receive({ type: 'state', id: 2, nick: 'Сосед', board: [], piece: null, lines: 4, score: 800, over: 1 });

  assert.deepEqual(events, [['tetris', 'Сосед'], ['out', 'Сосед']]);
  assert.equal(net.opponentList()[0].score, 800);
});

test('разрыв связи чистит комнату и переводит статус', () => {
  const { net, socket } = connected();
  socket.receive({ type: 'joined', room: '777', you: 1 });
  socket.receive({ type: 'state', id: 2, nick: 'Сосед', board: [], piece: null });
  assert.equal(net.opponents.size, 1);
  socket.close();
  assert.equal(net.room, null);
  assert.equal(net.opponents.size, 0);
  assert.equal(net.status, STATUS.LOST);
  net.disconnect();
});
