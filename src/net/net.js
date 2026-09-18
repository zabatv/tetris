/**
 * Клиент мультиплеера. Держит соединение, рассылает события подписчикам
 * и хранит состояние соперников. Об игровых правилах ничего не знает.
 */

const MAX_OPPONENTS = 5;
const RECONNECT_STEPS = [800, 1600, 3200, 6000];

export const STATUS = {
  OFFLINE: 'Не подключён',
  CONNECTING: 'Подключение…',
  ONLINE: 'Онлайн',
  LOST: 'Связь потеряна',
};

export class Net {
  constructor({ url = null } = {}) {
    this.url = url || Net.defaultUrl();
    this.ws = null;
    this.nick = '';
    this.room = null;
    this.selfId = null;
    this.players = [];
    this.opponents = new Map();
    this.status = STATUS.OFFLINE;
    this.subscribers = new Map();
    this.attempts = 0;
    this.reconnectTimer = null;
    this.wantConnection = false;
    this.pendingJoin = null;
  }

  static defaultUrl() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const host = location.hostname || 'localhost';
    return `${proto}://${host}:8283`;
  }

  on(event, handler) {
    if (!this.subscribers.has(event)) this.subscribers.set(event, new Set());
    this.subscribers.get(event).add(handler);
    return () => this.subscribers.get(event).delete(handler);
  }

  emit(event, payload) {
    const set = this.subscribers.get(event);
    if (!set) return;
    for (const handler of set) {
      try { handler(payload); } catch (err) { console.error('[net]', event, err); }
    }
  }

  setStatus(status) {
    this.status = status;
    this.emit('status', status);
  }

  get connected() {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  get inRoom() {
    return this.connected && !!this.room;
  }

  connect() {
    this.wantConnection = true;
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) return;
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.setStatus(STATUS.CONNECTING);
    this.ws.onopen = () => {
      this.attempts = 0;
      this.setStatus(STATUS.ONLINE);
      this.send({ type: 'list' });
      if (this.pendingJoin) {
        this.send(this.pendingJoin);
        this.pendingJoin = null;
      }
    };
    this.ws.onclose = () => {
      this.ws = null;
      this.room = null;
      this.opponents.clear();
      this.emit('opponents', this.opponentList());
      this.setStatus(this.wantConnection ? STATUS.LOST : STATUS.OFFLINE);
      if (this.wantConnection) this.scheduleReconnect();
    };
    this.ws.onerror = () => { try { this.ws.close(); } catch { /* уже закрыт */ } };
    this.ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      this.handle(data);
    };
  }

  /** Переподключение с растущей паузой — сервер мог просто перезапуститься. */
  scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = RECONNECT_STEPS[Math.min(this.attempts, RECONNECT_STEPS.length - 1)];
    this.attempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.wantConnection) this.connect();
    }, delay);
  }

  disconnect() {
    this.wantConnection = false;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) { try { this.ws.close(); } catch { /* уже закрыт */ } }
  }

  send(message) {
    if (!this.connected) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  /** Отправляет сразу или откладывает до открытия сокета. */
  queue(message) {
    this.connect();
    if (!this.send(message)) this.pendingJoin = message;
  }

  createRoom(nick) {
    this.nick = nick;
    this.queue({ type: 'create', nick });
  }

  joinRoom(code, nick) {
    this.nick = nick;
    this.queue({ type: 'join', nick, room: String(code).trim() });
  }

  leaveRoom() {
    this.send({ type: 'leave' });
    this.room = null;
    this.opponents.clear();
    this.emit('opponents', this.opponentList());
    this.emit('room', null);
  }

  refresh() {
    this.queue({ type: 'list' });
  }

  chat(message) {
    if (this.room) this.send({ type: 'chat', msg: message });
  }

  sendState(snapshot) {
    if (!this.inRoom) return;
    this.send({
      type: 'state',
      board: snapshot.board,
      piece: snapshot.piece,
      gy: snapshot.ghostY,
      score: snapshot.score,
      lines: snapshot.lines,
      level: snapshot.level,
      combo: snapshot.combo,
      over: snapshot.phase === 'over' ? 1 : 0,
    });
  }

  sendAttack(lines) {
    if (!this.inRoom || lines <= 0) return;
    this.send({ type: 'attack', lines });
  }

  opponentList() {
    return [...this.opponents.entries()].map(([id, opp]) => ({ id, ...opp }));
  }

  handle(data) {
    switch (data.type) {
      case 'joined':
        this.room = data.room;
        this.selfId = data.you;
        this.opponents.clear();
        this.emit('joined', data);
        this.emit('opponents', this.opponentList());
        this.send({ type: 'list' });
        break;

      case 'room':
        this.players = data.players || [];
        this.emit('room', data);
        break;

      case 'rooms':
        this.emit('rooms', data.rooms || []);
        break;

      case 'err':
        this.emit('error', data.msg);
        break;

      case 'chat':
        this.emit('chat', data);
        break;

      case 'attack':
        if (data.id !== this.selfId) this.emit('attack', { lines: data.lines || 0, from: data.nick });
        break;

      case 'state':
        this.updateOpponent(data);
        break;
    }
  }

  updateOpponent(data) {
    if (data.id === this.selfId) return;
    let opp = this.opponents.get(data.id);
    const isNew = !opp;
    if (!opp) {
      opp = { nick: data.nick, score: 0, lines: 0, level: 1, over: 0 };
      this.opponents.set(data.id, opp);
      // Держим ограниченное число досок — рисовать больше всё равно некуда.
      while (this.opponents.size > MAX_OPPONENTS) {
        this.opponents.delete(this.opponents.keys().next().value);
      }
    }
    const previousLines = opp.lines;
    const wasOver = opp.over;

    opp.nick = data.nick;
    opp.board = data.board;
    opp.piece = data.piece ? { ...data.piece, gy: data.gy == null ? data.piece.y : data.gy } : null;
    opp.score = data.score || 0;
    opp.lines = data.lines || 0;
    opp.level = data.level || 1;
    opp.combo = data.combo || 0;

    if (opp.lines > previousLines) {
      opp.flashUntil = performance.now() + 450;
      const delta = opp.lines - previousLines;
      if (delta >= 4) this.emit('opponentTetris', { nick: opp.nick });
    }
    if (!wasOver && data.over) {
      opp.over = performance.now();
      this.emit('opponentOut', { nick: opp.nick, score: opp.score });
    } else if (!data.over) {
      opp.over = 0;
    }

    if (isNew) this.emit('opponentJoin', { nick: opp.nick });
    this.emit('opponents', this.opponentList());
  }
}
