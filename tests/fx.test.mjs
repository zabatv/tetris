import test from 'node:test';
import assert from 'node:assert/strict';

import { TimeScale, ScreenFX } from '../src/fx/effects.js';

// Заглушка DOM-узла: эффекты пишут только в style и classList.
function stubElement() {
  return {
    style: {},
    classList: { add() {}, remove() {}, contains: () => false },
    get offsetWidth() { return 0; },
  };
}

function makeFX(overrides = {}) {
  const stage = stubElement();
  const screen = stubElement();
  const flash = stubElement();
  const glitch = stubElement();
  const vignette = stubElement();
  const fx = new ScreenFX({ stage, screen, flash, glitch, vignette, ...overrides });
  return { fx, stage, screen, flash, glitch, vignette };
}

function stageScale(stage) {
  const match = /scale\(([-\d.]+)\)/.exec(stage.style.transform || '');
  return match ? Number(match[1]) : null;
}

test('замедление держится заданное время и возвращается к единице', () => {
  const time = new TimeScale();
  time.slow(300, 0.1);
  for (let i = 0; i < 10; i++) time.update(16);
  assert.ok(time.scale < 0.6, 'внутри окна время идёт медленно');
  for (let i = 0; i < 60; i++) time.update(16);
  assert.equal(time.scale, 1, 'после окна скорость восстанавливается');
});

test('стоп-кадр полностью останавливает время и сам отпускает', () => {
  const time = new TimeScale();
  time.freeze(60);
  assert.equal(time.update(16), 0);
  assert.equal(time.update(16), 0);
  time.update(60);
  assert.ok(time.update(16) > 0, 'после стоп-кадра время идёт снова');
});

test('множитель безумия смягчается для геометрии', () => {
  const { fx } = makeFX();
  fx.setMadness(1);
  assert.equal(fx.soften, 1);
  fx.setMadness(1.7);
  assert.ok(fx.soften > 1 && fx.soften < 1.35, 'на «безумии» зум растёт, но не втрое');
  fx.setMadness(0.45);
  assert.ok(fx.soften < 1);
});

test('режим «меньше движения» выключает геометрию эффектов', () => {
  const { fx, stage, screen } = makeFX({ reducedMotion: true });
  fx.setMadness(1.7);
  assert.equal(fx.madness, 0);
  fx.shake(20, 400);
  fx.zoomPunch(0.3, 400);
  fx.setTease(1, 4, 100);
  fx.update(16);
  assert.equal(stageScale(stage), 1, 'камера стоит на месте');
  assert.equal(screen.style.filter, undefined, 'фильтр не ставился вовсе');
});

test('наезд камеры ограничен, как бы ни складывались эффекты', () => {
  const { fx, stage } = makeFX();
  fx.setMadness(1.7);
  for (let i = 0; i < 6; i++) fx.zoomPunch(0.3, 2000);
  fx.zoom(1.5, 2000);
  fx.setTease(1, 4, 100);
  for (let i = 0; i < 20; i++) fx.update(16);
  const scale = stageScale(stage);
  assert.ok(scale <= 2.1, `масштаб не выходит за предел, получили ${scale}`);
  assert.ok(scale > 1.3, 'но наезд всё-таки заметный');
});

test('экранный фильтр ставится только когда действительно меняет картинку', () => {
  const { fx, screen } = makeFX();
  fx.setMadness(1);
  fx.update(16);
  assert.ok(!screen.style.filter, 'в покое фильтр даже не трогается');
  fx.hueBurst(360, 600);
  fx.update(16);
  fx.update(16);
  assert.match(screen.style.filter, /hue-rotate/);
});

test('качество снижает размытие, а не отменяет эффект', () => {
  const blurOf = (quality) => {
    const { fx, screen } = makeFX();
    fx.setMadness(1);
    fx.setQuality(quality);
    fx.setTease(1, 4, 100);
    fx.update(16);
    const match = /blur\(([\d.]+)px\)/.exec(screen.style.filter || '');
    return match ? Number(match[1]) : 0;
  };
  assert.ok(blurOf(1) > blurOf(0.2), 'на слабой машине размытие меньше');
  assert.equal(blurOf(0), 0, 'в режиме выживания размытия нет вовсе');
});

test('тряска затухает и очищает очередь', () => {
  const { fx, stage } = makeFX();
  fx.setMadness(1);
  fx.shake(20, 200);
  fx.update(16);
  const shifted = /translate3d\((-?[\d.]+)px/.exec(stage.style.transform);
  assert.ok(Math.abs(Number(shifted[1])) > 0, 'кадр сдвинут');
  for (let i = 0; i < 20; i++) fx.update(16);
  assert.equal(fx.shakes.length, 0);
});

test('вспышка гаснет, глитч выключается сам', () => {
  const { fx, flash, glitch } = makeFX();
  fx.setMadness(1);
  fx.flash('rgba(255,255,255,1)', 100);
  fx.glitch(100, 1);
  fx.update(16);
  assert.ok(Number(flash.style.opacity) > 0);
  assert.ok(Number(glitch.style.opacity) > 0);
  for (let i = 0; i < 10; i++) fx.update(16);
  assert.equal(flash.style.opacity, '0');
  assert.equal(glitch.style.opacity, '0');
});
