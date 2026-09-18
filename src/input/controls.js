import { DAS, ARR, SOFT_DROP_RATE } from '../core/constants.js';

// Коды клавиш не зависят от раскладки — русская работает без отдельных веток.
const BINDINGS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowDown: 'soft', KeyS: 'soft',
  ArrowUp: 'rotateCW', KeyX: 'rotateCW', KeyW: 'rotateCW',
  KeyZ: 'rotateCCW', ControlLeft: 'rotateCCW', ControlRight: 'rotateCCW',
  KeyQ: 'rotate180',
  Space: 'hardDrop',
  KeyC: 'hold', ShiftLeft: 'hold', ShiftRight: 'hold',
  KeyP: 'pause', Escape: 'pause',
  KeyR: 'restart',
  KeyM: 'mute',
};

const REPEATABLE = new Set(['left', 'right', 'soft']);

/**
 * Клавиатура с автоповтором (DAS/ARR) и жесты для телефона.
 * Обработчики действий передаются снаружи — модуль не знает про игру.
 */
export class Controls {
  constructor(actions, { target = window, touchTarget = null } = {}) {
    this.actions = actions;
    this.target = target;
    this.touchTarget = touchTarget;
    this.held = new Map();
    this.direction = 0;
    this.onKeyDown = this.handleKeyDown.bind(this);
    this.onKeyUp = this.handleKeyUp.bind(this);
    this.touch = null;
  }

  attach() {
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
    this.target.addEventListener('blur', () => this.releaseAll());
    if (this.touchTarget) this.attachTouch(this.touchTarget);
  }

  detach() {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.releaseAll();
  }

  releaseAll() {
    this.held.clear();
    this.direction = 0;
  }

  fire(action) {
    const fn = this.actions[action];
    if (fn) fn();
  }

  handleKeyDown(event) {
    if (event.target && /^(INPUT|TEXTAREA)$/.test(event.target.tagName)) return;
    const action = BINDINGS[event.code];
    if (!action) return;
    event.preventDefault();
    if (event.repeat) return;

    if (REPEATABLE.has(action)) {
      // Противоположные направления: побеждает нажатая последней.
      if (action === 'left' || action === 'right') {
        this.direction = action === 'left' ? -1 : 1;
      }
      this.held.set(action, { delay: action === 'soft' ? 0 : DAS, timer: 0, started: true });
    }
    this.fire(action);
  }

  handleKeyUp(event) {
    const action = BINDINGS[event.code];
    if (!action) return;
    this.held.delete(action);
    if (action === 'left' && this.direction === -1) this.direction = this.held.has('right') ? 1 : 0;
    if (action === 'right' && this.direction === 1) this.direction = this.held.has('left') ? -1 : 0;
  }

  /** Автоповтор: сначала задержка DAS, потом частые шаги ARR. */
  update(dt) {
    for (const [action, state] of this.held) {
      if (action === 'left' && this.direction !== -1) continue;
      if (action === 'right' && this.direction !== 1) continue;
      state.timer += dt;
      const interval = action === 'soft' ? SOFT_DROP_RATE : ARR;
      if (state.started) {
        if (state.timer < state.delay) continue;
        state.started = false;
        state.timer = 0;
      }
      while (state.timer >= interval) {
        state.timer -= interval;
        this.fire(action);
      }
    }
  }

  // --- сенсорное управление --------------------------------------------------

  attachTouch(el) {
    const SWIPE = 26;
    el.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      this.touch = { x: t.clientX, y: t.clientY, startX: t.clientX, startY: t.clientY, time: performance.now(), moved: false };
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      if (!this.touch) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - this.touch.x;
      const dy = t.clientY - this.touch.y;
      if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy)) {
        this.fire(dx > 0 ? 'right' : 'left');
        this.touch.x = t.clientX;
        this.touch.moved = true;
      } else if (dy > SWIPE && Math.abs(dy) > Math.abs(dx)) {
        this.fire('soft');
        this.touch.y = t.clientY;
        this.touch.moved = true;
      }
      e.preventDefault();
    }, { passive: false });

    el.addEventListener('touchend', (e) => {
      if (!this.touch) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - this.touch.startX;
      const dy = t.clientY - this.touch.startY;
      const elapsed = performance.now() - this.touch.time;
      const flick = Math.abs(dy) > 60 && elapsed < 260;
      if (flick && dy > 0) this.fire('hardDrop');
      else if (flick && dy < 0) this.fire('hold');
      else if (!this.touch.moved && Math.abs(dx) < 14 && Math.abs(dy) < 14) this.fire('rotateCW');
      this.touch = null;
    }, { passive: true });
  }
}

export const KEY_BINDINGS = BINDINGS;
