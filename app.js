(function () {
  const h = React.createElement;
  const el = (t, p) => h(t, p);

  function Spotlight({ className, children, style }) {
    const ref = React.useRef(null);
    function onMove(e) {
      const n = e.currentTarget;
      const r = n.getBoundingClientRect();
      n.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      n.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }
    return h('div', { ref, className: 'spotcard ' + (className || ''), style: style || null, onMouseMove: onMove }, children);
  }

  function Mag({ cls, txt, title, onClick }) {
    const ref = React.useRef(null);
    const mv = e => {
      const n = ref.current; if (!n) return;
      const r = n.getBoundingClientRect();
      const dx = (e.clientX - r.left - r.width / 2) / r.width;
      const dy = (e.clientY - r.top - r.height / 2) / r.height;
      n.style.transform = 'translate(' + (dx * 18) + 'px,' + (dy * 18) + 'px)';
    };
    const ml = () => { if (ref.current) ref.current.style.transform = ''; };
    return h('button', { ref, title: title || null, className: cls, onClick: onClick, onMouseMove: mv, onMouseLeave: ml }, txt);
  }

  function OppPanel() {
    const [, force] = React.useReducer(x => x + 1, 0);
    React.useEffect(() => {
      const us = [Net.on('opps', force), Net.on('oppjoin', force), Net.on('joined', force), Net.on('room', force)];
      return () => us.forEach(u => u());
    }, []);
    React.useEffect(() => {
      let raf;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const wrap = document.getElementById('opponents');
        if (!wrap) return;
        const cvs = wrap.querySelectorAll('canvas.op');
        for (let i = 0; i < cvs.length; i++) {
          const o = Net.opp(cvs[i].dataset.id);
          if (o) window.TetrisEngine.drawOpp(cvs[i].getContext('2d'), o);
        }
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }, []);
    const ids = Net.oppIds();
    return h('div', { id: 'opponents' },
      ids.map(id => {
        const o = Net.opp(id);
        if (!o) return null;
        return h('div', { key: id, className: 'opp' },
          h('div', { className: 'nick' }, o.nick + ' · ' + o.score),
          h('canvas', { className: 'op', width: 120, height: 240, 'data-id': String(id) })
        );
      })
    );
  }

  function HudPanel({ hud, nextRef }) {
    return h('div', { id: 'sidebar' },
      h(Spotlight, { className: 'panel' }, h('h3', null, 'Очки'), h('div', { id: 'score', className: 'value', key: 'sv' + hud.score }, hud.score)),
      h(Spotlight, { className: 'panel' }, h('h3', null, 'Уровень'), h('div', { id: 'level', className: 'value', key: 'lv' + hud.level + '_' + hud.lp }, hud.level)),
      h(Spotlight, { className: 'panel' }, h('h3', null, 'Линии'), h('div', { id: 'lines', className: 'value', key: 'ln' + hud.lines }, hud.lines)),
      h(Spotlight, { className: 'panel' }, h('h3', null, 'Комбо'), h('div', { id: 'combo', className: 'value ' + (hud.comboGold && hud.combo > 1 ? 'gold' : ''), key: 'cb' + hud.combo }, 'x' + hud.combo)),
      h(Spotlight, { className: 'panel' }, h('h3', null, 'Следующая'), el('canvas', { id: 'next-canvas', ref: nextRef, width: 96, height: 80 })),
      h(Spotlight, { className: 'panel' },
        h('div', { className: 'controls' },
          h('em', null),
          h('div', null, h('kbd', null, '←→'), ' движение, ', h('kbd', null, '↑'), ' поворот, ', h('kbd', null, '↓'), ' вниз, ', h('kbd', null, 'пробел'), ' хард-дроп, ', h('kbd', null, 'P'), ' пауза')
        )
      )
    );
  }

  function Lobby() {
    const [status, setStatus] = React.useState('Не подключён');
    const [rooms, setRooms] = React.useState([]);
    const [chat, setChat] = React.useState([]);
    const [roomInfo, setRoomInfo] = React.useState(null);
    const [err, setErr] = React.useState('');
    const [nick, setNick] = React.useState('');
    const [code, setCode] = React.useState('');
    const [msg, setMsg] = React.useState('');

    React.useEffect(() => {
      const us = [];
      us.push(Net.on('status', s => setStatus(s)));
      us.push(Net.on('rooms', r => setRooms(r)));
      us.push(Net.on('room', r => setRoomInfo(r)));
      us.push(Net.on('joined', d => setRoomInfo({ code: d.room, players: [Net.nick().toString()] })));
      us.push(Net.on('err', e => { setErr(e); setTimeout(() => setErr(''), 4000); }));
      us.push(Net.on('chat', c => setChat(arr => { const n = arr.concat([c]); return n.length > 120 ? n.slice(n.length - 120) : n; })));
      Net.connect();
      return () => us.forEach(u => u());
    }, []);

    function doCreate() { setErr(''); Net.create(nick || 'Игрок'); }
    function doJoin(c) { setErr(''); Net.join((c || code).trim() || prompt('Код комнаты:'), nick || 'Игрок'); }

    return h('div', { id: 'menu', className: 'spotcard rb-lobby' },
      h('div', { className: 'rb-title' }, 'МУЛЬТИПЛЕЕР'),
      h('label', null, 'Никнейм'),
      h('input', { type: 'text', maxLength: 16, placeholder: 'Твой ник', value: nick, onChange: e => setNick(e.target.value) }),
      h('div', { className: 'row' },
        h('button', { onClick: doCreate, className: 'mbtn' }, 'Создать комнату')
      ),
      h('div', { className: 'mrow' },
        h('input', { type: 'text', maxLength: 6, placeholder: 'Код комнаты', value: code, onChange: e => setCode(e.target.value) }),
        h('button', { onClick: () => doJoin(), className: 'mbtn' }, 'Зайти')
      ),
      h('button', { className: 'secondary mbtn', onClick: () => Net.refresh() }, 'Обновить комнаты'),
      h('div', { id: 'roomlist' },
        rooms.length === 0
          ? h('div', { className: 'rl-empty' }, 'Комнат пока нет')
          : rooms.map(r => h('div', { key: r.code, className: 'rl-item spotcard mbtn', onClick: () => doJoin(r.code) },
            h('span', { className: 'rl-code' }, '#' + r.code),
            h('span', { className: 'rl-ps' }, r.players + '/8')
          ))
      ),
      h('div', { id: 'status' },
        err ? '⚠ ' + err + ' ' : '',
        roomInfo && roomInfo.code ? 'Комната ' + roomInfo.code : status
      ),
      h('div', { id: 'chatwin' },
        h('div', { id: 'chatmsgs' },
          chat.length === 0
            ? h('div', { className: 'rl-empty' }, '—')
            : chat.map((c, i) => c.sys
              ? h('div', { key: i, className: 'sys' }, c.msg)
              : h('div', { key: i }, h('span', { className: 'nm' }, c.nick + ': '), c.msg))
        ),
        h('input', { type: 'text', id: 'chat-input', placeholder: 'Сообщение...', maxLength: 200, value: msg,
          onChange: e => setMsg(e.target.value),
          onKeyDown: e => { if (e.key === 'Enter' && e.target.value.trim()) { Net.chat(e.target.value.trim()); setMsg(''); } }
        })
      )
    );
  }

  function Game() {
    const boardRef = React.useRef(null);
    const nextRef = React.useRef(null);
    const stageRef = React.useRef(null);
    const wrapRef = React.useRef(null);
    const bgRef = React.useRef(null);
    const [goVisible, setGoVisible] = React.useState(false);
    const [goScore, setGoScore] = React.useState(0);
    const [goMax, setGoMax] = React.useState(0);
    const [startVisible, setStartVisible] = React.useState(true);
    const [hud, setHud] = React.useState({ score: 0, level: 1, lines: 0, combo: 0, comboGold: false, lp: 0 });

    React.useEffect(() => {
      window.TetrisEngine.setup({
        board: boardRef.current,
        nextCanvas: nextRef.current,
        stage: stageRef.current,
        wrapper: wrapRef.current,
        bg: bgRef.current
      }, {
        score: v => setHud(s => ({ ...s, score: v })),
        level: v => setHud(s => ({ ...s, level: v })),
        lines: v => setHud(s => ({ ...s, lines: v })),
        combo: v => setHud(s => ({ ...s, combo: v })),
        comboGold: b => setHud(s => ({ ...s, comboGold: b })),
        levelPulse: () => setHud(s => ({ ...s, lp: s.lp + 1 })),
        menu: b => setStartVisible(b),
        gameOver: (sc, mx) => { setGoScore(sc); setGoMax(mx); setGoVisible(true); }
      });
    }, []);

    function play() {
      setGoVisible(false);
      setStartVisible(false);
      window.TetrisEngine.start();
    }

    return h('div', { className: 'rb-root' },
      el('canvas', { id: 'bg', ref: bgRef, width: 800, height: 600 }),
      h('div', { id: 'scanlines' }),
      h('div', { id: 'bar-ar' }),
      h('div', { id: 'vignette' }),
      h('div', { id: 'rgbflash' }),
      h(Lobby),
      h('div', { id: 'game-wrapper', ref: wrapRef },
        h(HudPanel, { hud: hud, nextRef: nextRef }),
        h('div', { id: 'stage', ref: stageRef },
          h('div', { id: 'flash' }),
          h('div', { id: 'rowflash' }),
          h('div', { id: 'textfx' }),
          h('div', { id: 'lightning' }),
          h('div', { id: 'board-fx' }),
          h('div', { id: 'floats' }),
          el('canvas', { id: 'board-canvas', ref: boardRef, width: 300, height: 600 })
        ),
        h(OppPanel)
      ),
      startVisible && h('div', { id: 'overlay' },
        h('h1', null, 'ТЕТРИС'),
        h('p', null, 'Мультиплеер · комнаты · чат · React Bits'),
        h(Mag, { cls: 'btn mbtn', txt: 'ИГРАТЬ', onClick: play })
      ),
      goVisible && h('div', { id: 'go-overlay' },
        h('h1', null, 'GAME OVER'),
        h('div', { className: 'final-score' }, 'Очки: ' + goScore),
        h('div', { className: 'combo-hit' }, 'Макс. комбо: x' + goMax),
        h(Mag, { cls: 'btn mbtn', txt: 'ИГРАТЬ СНОВА', onClick: play })
      )
    );
  }

  const rootEl = document.getElementById('root');
  ReactDOM.createRoot(rootEl).render(h(Game));
})();