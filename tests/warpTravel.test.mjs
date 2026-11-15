import assert from 'node:assert/strict';
import test from 'node:test';

// The renderer creates one offscreen canvas when imported.
globalThis.document = { createElement: () => ({ getContext: () => ({}) }) };
const { createWarpTravel, travelProgress } = await import('../src/warpTravel.js');
const ready = () => new Promise(resolve => setImmediate(resolve));
const options = (id = 'moon') => ({
  id, ship: { x: 0, y: 0, angle: -0.5, vx: 0, vy: 0 },
  from: { x: 0, y: 0 }, to: { x: 12000, y: -18000 },
  images: [], scenery: [], onComplete() {}
});

test('progress accelerates and decelerates smoothly at phase boundaries', () => {
  assert.equal(travelProgress(0), 0);
  assert.equal(travelProgress(7.5), 1);
  let last = 0;
  for (let t = 0; t <= 7.5; t += 0.001) {
    const p = travelProgress(t);
    assert.ok(p >= last && p <= 1);
    last = p;
  }
  const velocity = t => (travelProgress(t + 0.0001) - travelProgress(t)) / 0.0001;
  for (const t of [1, 6]) assert.ok(Math.abs(velocity(t - 0.0001) - velocity(t)) < 0.0001);
  assert.ok(velocity(0) < 0.0001);
  assert.ok(velocity(7.4999) < 0.0001);
});

test('every destination completes once with the same endpoint at different frame rates', async () => {
  for (const id of ['earth', 'moon', 'mars', 'europa', 'titan', 'umbriel']) {
    for (const fps of [30, 60, 144]) {
      const travel = createWarpTravel(), trip = options(id);
      let completed = 0;
      trip.onComplete = () => completed++;
      const stats = { health: 42, inventory: ['engine'], progress: { moon: true } };
      trip.ship.stats = stats;
      assert.equal(travel.start(trip), true);
      assert.equal(travel.start(options('earth')), false);
      await ready();
      for (let frame = 0; frame < Math.ceil(7.5 * fps) + 1; frame++) travel.update(1 / fps);
      assert.equal(travel.isActive(), false);
      assert.equal(completed, 1);
      assert.equal(trip.ship.x, trip.to.x);
      assert.equal(trip.ship.y, trip.to.y);
      assert.equal(trip.ship.angle, -0.5);
      assert.equal(trip.ship.stats, stats);
      assert.deepEqual(stats, { health: 42, inventory: ['engine'], progress: { moon: true } });
      travel.update(1);
      assert.equal(completed, 1);
      assert.equal(travel.start(options()), true);
    }
  }
});

test('arrival waits for decoded assets and tolerates missing image fallbacks', async () => {
  const travel = createWarpTravel(), trip = options();
  let decode;
  trip.images = [{ decode: () => new Promise(resolve => { decode = resolve; }) },
    { decode: () => Promise.reject(Error('missing optional backdrop')) }];
  travel.start(trip);
  travel.update(10);
  assert.equal(travel.isActive(), true);
  assert.equal(trip.ship.x, trip.to.x * travelProgress(6));
  decode();
  await ready();
  travel.update(1.5);
  assert.equal(travel.isActive(), false);
});

test('ship sprite stays opaque and keeps its proportions while engines fade', async () => {
  const travel = createWarpTravel(), trip = options();
  const sprite = { complete: true, naturalWidth: 100, naturalHeight: 200 };
  trip.sprite = sprite;
  trip.world = { moon: { x: 12000, y: -18000, radius: 150 } };
  trip.departure = { id: 'earth', body: { x: 0, y: 200, radius: 140 } };
  const stack = [], draws = [];
  const state = {
    globalAlpha: 1,
    save() { stack.push(this.globalAlpha); },
    restore() { this.globalAlpha = stack.pop(); },
    createRadialGradient() { return { addColorStop() {} }; },
    drawImage(image, x, y, w, h) {
      if (image === sprite) draws.push({ alpha: this.globalAlpha, w, h });
    }
  };
  const ctx = new Proxy(state, { get: (obj, key) => key in obj ? obj[key] : () => {} });
  travel.start(trip);
  await ready();
  let previous = 0;
  for (const time of [0, 0.1, 0.5, 1, 3, 6, 6.5, 7.2]) {
    travel.update(time - previous);
    travel.draw(ctx, 1280, 800, { draw: () => true }, 1 / 60);
    previous = time;
  }
  assert.equal(draws.length, 8);
  for (const draw of draws) {
    assert.equal(draw.alpha, 1);
    assert.equal(draw.w / draw.h, 0.5);
  }
  assert.equal(stack.length, 0);
});
