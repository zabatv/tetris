import { Panel, MagneticButton } from './primitives.js';
import { STATUS } from '../net/net.js';

const { createElement: h, useState, useEffect, useRef } = React;

/** Панель мультиплеера: комнаты, игроки, чат. */
export function Lobby({ net, open, onClose }) {
  const [status, setStatus] = useState(net.status);
  const [rooms, setRooms] = useState([]);
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  const [nick, setNick] = useState(() => {
    try { return localStorage.getItem('tetris.nick') || ''; } catch { return ''; }
  });
  const [code, setCode] = useState('');
  const [draft, setDraft] = useState('');
  const logRef = useRef(null);

  useEffect(() => {
    const off = [
      net.on('status', setStatus),
      net.on('rooms', setRooms),
      net.on('room', setRoom),
      net.on('joined', (data) => setRoom({ code: data.room, players: [] })),
      net.on('error', (message) => {
        setError(message);
        setTimeout(() => setError(''), 4000);
      }),
      net.on('chat', (message) => setMessages((list) => [...list, message].slice(-120))),
    ];
    return () => off.forEach((fn) => fn());
  }, [net]);

  useEffect(() => {
    if (open) net.connect();
  }, [open, net]);

  useEffect(() => {
    // Лог всегда прокручен к последнему сообщению.
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages]);

  const remember = (value) => {
    setNick(value);
    try { localStorage.setItem('tetris.nick', value); } catch { /* приватный режим */ }
  };

  const playerName = () => nick.trim() || 'Игрок';

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    net.chat(text);
    setDraft('');
  };

  const online = status === STATUS.ONLINE;

  return h('aside', { className: `lobby ${open ? 'is-open' : ''}`, 'aria-hidden': !open },
    h('div', { className: 'lobby__head' },
      h('div', { className: 'lobby__title' }, 'Мультиплеер'),
      h('button', { className: 'btn btn--icon btn--ghost', onClick: onClose, title: 'Закрыть' }, '✕'),
    ),

    h('div', { className: `badge ${online ? 'badge--live' : 'badge--warn'}` },
      h('span', { className: 'badge__dot' }),
      room && room.code ? `Комната ${room.code}` : status,
    ),

    h(Panel, { className: 'field' },
      h('span', { className: 'field__label' }, 'Никнейм'),
      h('input', {
        className: 'input',
        maxLength: 16,
        placeholder: 'Как тебя зовут',
        value: nick,
        onChange: (e) => remember(e.target.value),
      }),
      h('div', { className: 'row', style: { marginTop: '8px' } },
        h(MagneticButton, {
          className: 'btn',
          style: { flex: 1 },
          onClick: () => net.createRoom(playerName()),
        }, 'Создать'),
        h(MagneticButton, {
          className: 'btn',
          style: { flex: 1 },
          onClick: () => net.joinRoom(code, playerName()),
          disabled: !code.trim(),
        }, 'Войти'),
      ),
      h('div', { className: 'row', style: { marginTop: '8px' } },
        h('input', {
          className: 'input',
          maxLength: 6,
          placeholder: 'Код комнаты',
          value: code,
          onChange: (e) => setCode(e.target.value.replace(/\D/g, '')),
        }),
        h('button', { className: 'btn btn--sm', onClick: () => net.refresh(), title: 'Обновить список' }, '⟳'),
      ),
    ),

    h('div', { className: 'roomlist' },
      rooms.length === 0
        ? h('div', { className: 'empty-hint' }, 'Открытых комнат нет — создай свою')
        : rooms.map((item) => h('div', {
          key: item.code,
          className: 'room-item',
          onClick: () => net.joinRoom(item.code, playerName()),
        },
          h('span', { className: 'room-item__code' }, `#${item.code}`),
          h('span', { className: 'badge' }, `${item.players}/8`),
        )),
    ),

    error ? h('div', { className: 'status-line status-line--error' }, `⚠ ${error}`) : null,

    h('div', { className: 'chat' },
      h('div', { className: 'chat__log', ref: logRef },
        messages.length === 0
          ? h('div', { className: 'empty-hint' }, 'Чат пуст')
          : messages.map((message, index) => message.nick === '*'
            ? h('div', { key: index, className: 'chat__sys' }, message.msg)
            : h('div', { key: index },
              h('span', { className: 'chat__nick' }, `${message.nick}: `),
              message.msg,
            )),
      ),
      h('div', { className: 'row' },
        h('input', {
          className: 'input',
          placeholder: room ? 'Сообщение…' : 'Сначала войди в комнату',
          maxLength: 200,
          value: draft,
          disabled: !room,
          onChange: (e) => setDraft(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter') send(); },
        }),
        h('button', { className: 'btn btn--sm', onClick: send, disabled: !room }, '➤'),
      ),
    ),
  );
}
