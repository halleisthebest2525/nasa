import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareUmbrielFrames, UMBRIEL_FRAME_ROWS } from '../src/umbrielSprites.js';
import { createUmbrielMonsters } from '../src/umbrielMonsters.js';

// Small raster canvas verifies the actual generated pixels, without a browser
// dependency or placeholder images that would bypass the production art path.
function canvas() {
  const result = { width: 0, height: 0 };
  result.getContext = () => result.context ??= {
    fillStyle: '#000000', pixels: new Uint32Array(result.width * result.height),
    fillRect(x, y, w, h) {
      const color = parseInt(this.fillStyle.slice(1), 16) + 0x1000000;
      for (let py = Math.max(0, y); py < Math.min(result.height, y + h); py++) {
        for (let px = Math.max(0, x); px < Math.min(result.width, x + w); px++) {
          this.pixels[py * result.width + px] = color;
        }
      }
    },
    drawImage(source) { result.source = source; }
  };
  return result;
}

test('all 72 generated frames are visible, monochrome, distinct and enable combat', () => {
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: canvas };
  try {
    const assets = {};
    assert.equal(prepareUmbrielFrames(assets), 72);
    const allowed = new Set([0, 0x1050505, 0x1151515, 0x1383838, 0x1A0A0A0, 0x1FFFFFF]);
    for (const [kind, animation, count] of UMBRIEL_FRAME_ROWS) {
      const poses = new Set();
      for (let i = 1; i <= count; i++) {
        const frame = assets[`umbriel_${kind}_${animation}_${i}`];
        assert.equal(frame.width, 192);
        assert.equal(frame.height, 192);
        assert.equal(frame.context.imageSmoothingEnabled, false);
        const pixels = frame.source.context.pixels;
        assert.ok(pixels.some(pixel => pixel !== 0), `${kind} ${animation} ${i} is blank`);
        assert.ok(pixels.every(pixel => allowed.has(pixel)), 'Unexpected color');
        poses.add(Buffer.from(pixels.buffer).toString('base64'));
      }
      assert.equal(poses.size, count, `${kind} ${animation} has duplicate frames`);
    }
    const first = assets.umbriel_boss_idle_1;
    assert.equal(prepareUmbrielFrames(assets), 0);
    assert.equal(assets.umbriel_boss_idle_1, first);
    const enemies = createUmbrielMonsters(assets);
    assert.equal(enemies.isReady(), true);
    assert.equal(enemies.list().stalkers.length, 14);
    enemies.update(0.1, { x: 3700, y: 3000, damage() {}, push() {} });
    assert.equal(enemies.list().boss.alerted, true);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
