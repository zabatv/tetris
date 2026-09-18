import { Panel, MagneticButton, Counter, Stat } from './primitives.js';
import { Lobby } from './Lobby.js';
import { Session } from '../app/session.js';
import { PHASE } from '../core/game.js';
import { OPP_W, OPP_H } from '../render/opponent-view.js';

const { createElement: h, useState, useEffect, useRef, Fragment } = React;

const numberFormat = (value) => new Intl.NumberFormat('ru-RU').format(value);

function TopBar({ state, session, onToggleLobby, lobbyOpen }) {
  return h('header', { className: 'topbar' },
    h('div', { className: 'brand' },
      h('div', { className: 'brand__mark' }, 'ТЕТРИС'),
      h('div', { className: 'brand__tag' }, 'neon edition'),
    ),
    h('div', { className: 'topbar__tools' },
      state.best > 0 ? h('div', { className: 'badge' }, `Рекорд ${numberFormat(state.best)}`) : null,
      state.opponents.length > 0
        ? h('div', { className: 'badge badge--live' }, h('span', { className: 'badge__dot' }), `${state.opponents.length} рядом`)
        : null,
      h('button', {
        className: `btn btn--icon ${state.muted ? '' : 'btn--active'}`,
        onClick: () => session.toggleMute(),
        title: state.muted ? 'Включить звук (M)' : 'Выключить звук (M)',
      }, state.muted ? '🔇' : '🔊'),
      h('button', {
        className: `btn btn--icon ${state.music ? 'btn--active' : ''}`,
        onClick: () => session.toggleMusic(),
        title: 'Музыка',
      }, '♪'),
      h('button', {
        className: 'btn btn--icon',
        onClick: () => session.togglePause(),
        title: 'Пауза (P)',
        disabled: !state.started || state.phase === PHASE.OVER,
      }, state.paused ? '▶' : '❚❚'),
      h('button', {
        className: `btn ${lobbyOpen ? 'btn--active' : ''}`,
        onClick: onToggleLobby,
      }, 'Мультиплеер'),
    ),
  );
}

function Controls() {
  const rows = [
    ['Движение', '← →'],
    ['Поворот', '↑ / Z'],
    ['Разворот', 'Q'],
    ['Ускорить', '↓'],
    ['Сбросить', 'Space'],
    ['Удержать', 'C'],
    ['Пауза', 'P'],
  ];
  return h(Panel, { className: 'panel--keys' },
    h('div', { className: 'panel__label' }, 'Управление'),
    h('div', { className: 'keys' },
      rows.map(([name, key]) => h('div', { className: 'keys__row', key: name },
        h('span', null, name),
        h('kbd', null, key),
      )),
    ),
  );
}

function Opponents({ state, session }) {
  return h(Panel, null,
    h('div', { className: 'panel__label' }, 'Соперники'),
    state.opponents.length === 0
      ? h('div', { className: 'empty-hint' }, 'Никого рядом. Открой мультиплеер и позови друзей.')
      : h('div', { className: 'opponents' },
        state.opponents.map((opp) => h('div', { className: 'opponent', key: opp.id },
          h('div', { className: 'opponent__head' },
            h('span', { className: 'opponent__nick' }, opp.nick),
            h('span', { className: 'opponent__score' }, numberFormat(opp.score || 0)),
          ),
          h('canvas', {
            width: OPP_W,
            height: OPP_H,
            style: { width: `${OPP_W}px`, height: `${OPP_H}px` },
            ref: (node) => session.registerOpponentCanvas(opp.id, node),
          }),
        )),
      ),
  );
}

function StartOverlay({ onPlay }) {
  return h('div', { className: 'overlay' },
    h('h1', { className: 'overlay__title' }, 'ТЕТРИС'),
    h('p', { className: 'overlay__subtitle' },
      'Удержание фигуры, очередь из пяти, T-спины, back-to-back и мусорные ряды соперникам. ' +
      'Слом рядов идёт в замедлении — не моргай.',
    ),
    h(MagneticButton, { className: 'btn btn--primary', onClick: onPlay, autoFocus: true }, 'Играть'),
    h('div', { className: 'overlay__hint' }, '← → двигать · ↑ поворот · Space сбросить · C удержать · P пауза'),
  );
}

function GameOverOverlay({ summary, onRestart }) {
  const stats = [
    ['Очки', numberFormat(summary.score)],
    ['Линии', summary.lines],
    ['Уровень', summary.level],
    ['Комбо', `×${summary.maxCombo}`],
  ];
  const record = summary.score >= summary.best && summary.score > 0;
  return h('div', { className: 'overlay' },
    h('h1', { className: 'overlay__title overlay__title--over' }, 'Игра окончена'),
    record ? h('div', { className: 'record' }, '★ Новый рекорд' ) : h('div', { className: 'overlay__hint' }, `Рекорд: ${numberFormat(summary.best)}`),
    h('div', { className: 'overlay__stats' },
      stats.map(([label, value]) => h('div', { className: 'overlay__stat', key: label },
        h('b', null, value),
        h('span', null, label),
      )),
    ),
    h(MagneticButton, { className: 'btn btn--primary', onClick: onRestart, autoFocus: true }, 'Ещё раз'),
    h('div', { className: 'overlay__hint' }, 'R — быстрый рестарт'),
  );
}

export function App() {
  const refs = {
    board: useRef(null),
    fx: useRef(null),
    stage: useRef(null),
    flash: useRef(null),
    text: useRef(null),
    floats: useRef(null),
    chroma: useRef(null),
    background: useRef(null),
    next: useRef(null),
    hold: useRef(null),
  };
  const [session, setSession] = useState(null);
  const [state, setState] = useState(null);
  const [lobbyOpen, setLobbyOpen] = useState(false);

  useEffect(() => {
    const instance = new Session({
      refs: Object.fromEntries(Object.entries(refs).map(([key, ref]) => [key, ref.current])),
      onState: setState,
    });
    setSession(instance);
    // Отладочная ручка: из консоли удобно смотреть состояние и гонять сценарии.
    window.tetris = instance;
    // Размеры канвасов зависят от разложенного макета — пересчитываем после вёрстки.
    requestAnimationFrame(() => instance.resize());
    return () => instance.destroy();
  }, []);

  const ready = session && state;
  const showStart = ready && !state.started;
  const showOver = ready && state.phase === PHASE.OVER && state.summary;

  return h(Fragment, null,
    h('canvas', { id: 'bg-canvas', ref: refs.background }),

    h('div', { className: 'app' },
      ready
        ? h(TopBar, {
          state, session, lobbyOpen,
          onToggleLobby: () => setLobbyOpen((open) => !open),
        })
        : null,

      h('div', { className: 'playfield' },
        h('div', { className: 'rail rail--left' },
          h(Stat, { label: 'Очки', value: state ? state.score : 0, tone: 'panel__value--accent', format: numberFormat }),
          h('div', { className: 'stat-row' },
            h(Stat, { label: 'Уровень', value: state ? state.level : 1 }),
            h(Stat, { label: 'Линии', value: state ? state.lines : 0 }),
          ),
          h(Panel, null,
            h('div', { className: 'panel__label' }, 'Комбо · серия'),
            h(Counter, {
              value: state ? state.combo : 0,
              className: state && state.combo > 1 ? 'panel__value--gold' : '',
              format: (v) => `×${v}`,
            }),
            h('div', { className: 'progress' },
              h('div', { className: 'progress__fill', style: { width: `${(state ? state.levelProgress : 0) * 100}%` } }),
            ),
            state && state.b2b > 0 ? h('div', { className: 'badge badge--live', style: { marginTop: '8px' } }, `B2B ×${state.b2b}`) : null,
            state && state.pending > 0 ? h('div', { className: 'badge badge--warn', style: { marginTop: '8px' } }, `Входящие ${state.pending}`) : null,
          ),
          h(Panel, null,
            h('div', { className: 'panel__label' }, 'Удержание'),
            h('canvas', {
              ref: refs.hold,
              className: `preview ${state && state.holdLocked ? 'preview--empty' : ''}`,
            }),
            state && !state.hold ? h('div', { className: 'empty-hint' }, 'C — отложить фигуру') : null,
          ),
          h(Controls),
        ),

        h('div', { className: 'stage-column' },
          h('div', { className: 'stage', ref: refs.stage },
            h('div', { className: 'well' },
              h('canvas', { id: 'board-canvas', ref: refs.board }),
              h('canvas', { id: 'fx-canvas', ref: refs.fx }),
              h('div', { className: 'fx-layer', id: 'fx-flash', ref: refs.flash }),
              h('div', { className: 'fx-layer', id: 'fx-floats', ref: refs.floats }),
              h('div', { className: 'fx-layer', id: 'fx-text', ref: refs.text }),
              h('div', { className: 'fx-layer', id: 'fx-chroma', ref: refs.chroma }),
              state && state.paused
                ? h('div', { className: 'pause-note' },
                  h('div', null, 'Пауза'),
                  h(MagneticButton, { className: 'btn btn--sm', onClick: () => session.togglePause() }, 'Продолжить'),
                )
                : null,
            ),
          ),
          h('div', { className: 'touchpad' },
            h('button', { className: 'btn', onClick: () => session && session.game.move(-1) }, '←'),
            h('button', { className: 'btn', onClick: () => session && session.game.rotate(1) }, '⟳'),
            h('button', { className: 'btn', onClick: () => session && session.game.hardDrop() }, '⤓'),
            h('button', { className: 'btn', onClick: () => session && session.game.holdPiece() }, '⇄'),
            h('button', { className: 'btn', onClick: () => session && session.game.move(1) }, '→'),
          ),
        ),

        h('div', { className: 'rail rail--right' },
          h(Panel, null,
            h('div', { className: 'panel__label' }, 'Следующие'),
            h('canvas', { ref: refs.next, className: 'preview preview--queue' }),
          ),
          ready ? h(Opponents, { state, session }) : null,
        ),
      ),
    ),

    ready ? h(Lobby, {
      net: session.net,
      open: lobbyOpen,
      onClose: () => setLobbyOpen(false),
    }) : null,

    showStart ? h(StartOverlay, { onPlay: () => session.start() }) : null,
    showOver ? h(GameOverOverlay, { summary: state.summary, onRestart: () => session.start() }) : null,
  );
}
