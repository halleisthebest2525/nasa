import test from 'node:test';
import assert from 'node:assert/strict';
import { createUmbrielMonsters, UMBRIEL, FRACTURE_ANGLES, inFracture,
  segmentDistance, REAVER_ANIMATIONS, NOCTURNUS_ANIMATIONS } from '../src/umbrielMonsters.js';

function seeded() {
  let seed = 127;
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}
function fixture(phase = 1, assets = null) {
  assets ??= Object.fromEntries([[REAVER_ANIMATIONS, 'umbriel_reaver'], [NOCTURNUS_ANIMATIONS, 'umbriel_boss']]
    .flatMap(([animations, prefix]) => Object.entries(animations).flatMap(([name, [count]]) =>
      Array.from({ length: count }, (_, i) => [`${prefix}_${name}_${i + 1}`, { width: 192, height: 192 }]))));
  const hits = [], phases = [], rewards = [];
  const group = createUmbrielMonsters(assets, { random: seeded(),
    onBossPhase: p => phases.push(p), onBossDefeated: (x, y) => rewards.push({ x, y }) });
  const player = { x: UMBRIEL.lair.x + 500, y: UMBRIEL.lair.y,
    damage: (amount, cause) => hits.push({ amount, cause }), push() {} };
  if (phase > 1) group.debugSetBossHp(phase === 2 ? 60 : 30);
  const step = (seconds, fps = 60) => {
    for (let i = 0; i < Math.ceil(seconds * fps); i++) group.update(1 / fps, player);
  };
  const until = (predicate, seconds = 150) => {
    for (let i = 0; i < seconds * 60; i++) {
      if (predicate(group.list())) return group.list();
      group.update(1 / 60, player);
    }
    throw Error('Requested state never became reachable: ' + JSON.stringify(group.list().boss));
  };
  return { group, player, hits, phases, rewards, step, until };
}

test('all specified frames have explicit animation timings', () => {
  assert.equal(Object.values(REAVER_ANIMATIONS).reduce((sum, a) => sum + a[0], 0), 22);
  assert.equal(Object.values(NOCTURNUS_ANIMATIONS).reduce((sum, a) => sum + a[0], 0), 50);
});

test('all final-boss attacks are reachable, with no overlapping attack families', () => {
  const f = fixture(3), states = new Set();
  let moved = false;
  for (let i = 0; i < 300 * 60; i++) {
    f.group.update(1 / 60, f.player);
    const info = f.group.list();
    states.add(info.boss.state);
    if (Math.abs(info.boss.x - UMBRIEL.lair.x) > 1) moved = true;
    assert.ok(Math.hypot(info.boss.x - UMBRIEL.lair.x, info.boss.y - UMBRIEL.lair.y) <= UMBRIEL.arena);
    assert.ok(!info.effects.fields.length || !info.effects.rings && !info.effects.shards);
    assert.ok(info.effects.particles <= 160);
    assert.ok(info.effects.echoes <= 40);
  }
  for (const state of ['pulse', 'shards', 'mirror', 'gravity', 'fracture', 'eclipse', 'exposed', 'recover']) assert.ok(states.has(state), state);
  assert.ok(moved);
});

test('phase thresholds, transitions, punches and death preserve reward timing', () => {
  const f = fixture();
  const punch = amount => {
    const b = f.group.list().boss;
    return f.group.strike({ x: b.x, y: b.y, range: 68, damage: amount });
  };
  assert.equal(punch(34)[0].boss, true);
  assert.equal(f.group.list().boss.phase, 2);
  assert.equal(f.group.list().boss.state, 'transition');
  assert.deepEqual(punch(20), []);
  f.step(1.6);
  punch(40);
  assert.equal(f.group.list().boss.phase, 3);
  f.step(1.6);
  punch(200);
  assert.equal(f.group.list().boss.state, 'die');
  assert.equal(f.group.isBossDefeated(), false);
  f.step(2.8);
  assert.equal(f.rewards.length, 0);
  const saved = f.group.save();
  const loaded = fixture(); loaded.group.load(saved);
  loaded.step(1.1);
  assert.equal(loaded.group.isBossDefeated(), true);
  assert.equal(loaded.rewards.length, 1);
  loaded.step(5);
  assert.equal(loaded.rewards.length, 1);
  loaded.group.load(loaded.group.save());
  loaded.group.respawn();
  assert.equal(loaded.group.list().boss, null);
});

test('void pulse damages at most once per ring and leaves a safe outer radius', () => {
  const f = fixture();
  f.until(info => info.boss.state === 'pulse');
  const b = f.group.list().boss;
  f.player.x = b.x + 300; f.player.y = b.y;
  f.until(info => info.boss.state === 'recover');
  assert.equal(f.hits.filter(h => h.cause.includes('VOID SHOCKWAVE')).length, 3);
  const safe = fixture();
  safe.until(info => info.boss.state === 'pulse');
  const boss = safe.group.list().boss;
  safe.player.x = boss.x + 740; safe.player.y = boss.y;
  safe.until(info => info.boss.state === 'recover');
  assert.equal(safe.hits.filter(h => h.cause.includes('VOID SHOCKWAVE')).length, 0);
});

test('gravity inversion has a warning and is cleared by expiry, phase changes and death', () => {
  for (const end of ['expiry', 'phase', 'death']) {
    const f = fixture(2);
    const info = f.until(info => info.effects.fields.some(field => field.type === 'gravity'));
    const field = info.effects.fields.find(field => field.type === 'gravity');
    assert.equal(f.group.controlMultiplier(field.x, field.y), 1);
    f.step(1.55);
    assert.equal(f.group.controlMultiplier(field.x, field.y), -1);
    assert.equal(f.group.controlMultiplier(field.x + 260, field.y), 1);
    if (end === 'expiry') f.step(2);
    else f.group.debugSetBossHp(end === 'phase' ? 30 : 0);
    assert.equal(f.group.controlMultiplier(field.x, field.y), 1);
  }
});

test('fracture leaves more than 35% safe and uses the displayed wedge bounds', () => {
  let danger = 0;
  for (let i = 0; i < 8; i += 2) danger += FRACTURE_ANGLES[i + 1] - FRACTURE_ANGLES[i];
  assert.ok(1 - danger / (Math.PI * 2) > 0.35);
  const field = { x: 0, y: 0, rotation: 0 };
  assert.equal(inFracture(400 * Math.cos(0.3), 400 * Math.sin(0.3), field), true);
  assert.equal(inFracture(400 * Math.cos(1), 400 * Math.sin(1), field), false);
  assert.equal(inFracture(0, 0, field), false);
  assert.equal(inFracture(1000, 0, field), false);
});

test('Eclipse Collapse has full warning, pull, shockwave and three-second exposure', () => {
  const f = fixture(3);
  f.until(info => info.boss.state === 'eclipse');
  const b = f.group.list().boss;
  let pull = 0; f.player.push = (x, y) => { pull += Math.hypot(x, y); };
  f.player.x = b.x + 700; f.player.y = b.y;
  f.step(1.9); assert.equal(pull, 0);
  f.step(3); assert.ok(pull > 0);
  assert.equal(f.hits.filter(h => h.amount === 30).length, 0);
  f.until(info => info.boss.state === 'exposed');
  const exposed = f.group.list().boss;
  f.group.strike({ x: exposed.x, y: exposed.y, range: 68, damage: 1 });
  assert.ok(Math.abs(f.group.list().boss.hp - (exposed.hp - 1.3)) < 0.0001);
  f.step(2.9); assert.equal(f.group.list().boss.state, 'exposed');
  f.step(0.2); assert.equal(f.group.list().boss.state, 'recover');
});

test('reavers slither, burrow safely, warn, dash and respawn outside the view', () => {
  const f = fixture(), states = new Set();
  const initial = f.group.list().stalkers[0];
  f.player.x = initial.x + 200; f.player.y = initial.y;
  for (let i = 0; i < 30 * 60; i++) {
    const m = f.group.list().stalkers[0];
    f.player.x = m.x + 200; f.player.y = m.y;
    states.add(m.state);
    const before = f.hits.length;
    f.group.update(1 / 60, f.player);
    if (m.state === 'burrowHidden') assert.equal(f.hits.length, before);
  }
  for (const state of ['move', 'burrowSink', 'burrowHidden', 'burrowWarn', 'attack', 'dashWarn', 'dash']) assert.ok(states.has(state), state);
  const m = f.group.list().stalkers[0];
  f.group.strike({ x: m.x, y: m.y, range: 60, damage: 100 });
  f.step(1.2);
  f.group.tickRespawns(31, { x: f.player.x, y: f.player.y, viewDistance: 800 });
  assert.equal(f.group.list().stalkers.length, UMBRIEL.count);
  const spawned = f.group.list().stalkers.at(-1);
  assert.ok(Math.hypot(spawned.x - f.player.x, spawned.y - f.player.y) > 800);
});

test('projectile swept collision detects fast crossings', () => {
  assert.equal(segmentDistance(5, 0, 0, 0, 10, 0), 0);
  assert.equal(segmentDistance(5, 4, 0, 0, 10, 0), 4);
});
