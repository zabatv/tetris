import { PIECE_IDS } from './constants.js';
import { systemRandom } from './rng.js';

// «Мешок семи»: каждая фигура выпадает раз за цикл — без затяжных серий одного типа.
export class Bag {
  constructor(random = systemRandom) {
    this.random = random;
    this.queue = [];
  }

  refill() {
    const bag = PIECE_IDS.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    this.queue.push(...bag);
  }

  // Заглядываем вперёд, не вынимая фигуры.
  peek(count) {
    while (this.queue.length < count) this.refill();
    return this.queue.slice(0, count);
  }

  take() {
    if (!this.queue.length) this.refill();
    return this.queue.shift();
  }

  reset() {
    this.queue = [];
  }
}
