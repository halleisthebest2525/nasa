import assert from 'node:assert/strict';
import test from 'node:test';

import { createUmbrielMonsters } from '../src/umbrielMonsters.js';

// No images are needed for the simulation: frames may be null.
const ASSETS = {};
const LAIR = { x: 3200, y: 2900 };
const BOSS_HP = 85;
const DT = 1 / 60;

// A player who stands where the test puts them and remembers every hit.
function makePlayer(x, y) {
  const player = {
    x, y,
    hits: [],
    pushed: 0,
    damage(amount, cause) { player.hits.push({ amount, cause }); },
    push(dx, dy) { player.x += dx; player.y += dy; player.pushed += Math.hypot(dx, dy); }
  };
  return player;
}

function run(monsters, player, seconds, each = null) {
  for (let t = 0; t < seconds; t += DT) {
    monsters.update(DT, player);
    if (each) each(t);
  }
}

// Step up to the boss (it drifts) and punch it from the left.
function hitBoss(monsters, player, damage = 1) {
  const boss = monsters.list().boss;
  player.x = boss.x - 100;
  player.y = boss.y;
  return monsters.strike({ x: player.x, y: player.y, angle: 0, range: 68, arc: 0.95, damage });
}

// Keep the player at a fixed spot left of the boss (pushes and pulls undone).
const holdAt = (monsters, player, distance) => {
  const boss = monsters.list().boss;
  player.x = boss.x - distance;
  player.y = boss.y;
};

test('Nocturnus wakes up, fights and hurts a player who stands still', () => {
  const monsters = createUmbrielMonsters(ASSETS);
  const player = makePlayer(LAIR.x - 320, LAIR.y);
  const seen = new Set();

  run(monsters, player, 25, () => {
    const info = monsters.list();
    seen.add(info.boss.state);
    for (const [name, count] of Object.entries(info.effects)) if (count > 0) seen.add(`effect:${name}`);
    // A standing player is pushed around but must never be teleported far.
    assert.ok(Math.hypot(player.x - LAIR.x, player.y - LAIR.y) < 1400);
  });

  const info = monsters.list();
  assert.equal(info.boss.alerted, true);
  assert.ok(player.hits.length > 0, 'the boss never hurt the player');
  assert.ok(seen.has('pulse') || seen.has('shard'), `phase 1 abilities never fired: ${[...seen].join(', ')}`);
  assert.ok(seen.has('effect:rings') || seen.has('effect:shards'), 'no rings or shards were created');
  // Phase 1 has no wells, blinks or eclipses.
  assert.ok(!seen.has('wellCast') && !seen.has('blinkOut') && !seen.has('eclipseCharge'), [...seen].join(', '));
});

test('phase transitions make it untouchable, summon reavers and unlock new abilities', () => {
  const phases = [];
  const eclipses = [];
  const monsters = createUmbrielMonsters(ASSETS, {
    onBossPhase: phase => phases.push(phase),
    onEclipse: () => eclipses.push(true)
  });
  const player = makePlayer(LAIR.x - 300, LAIR.y);

  run(monsters, player, 1);
  const before = monsters.list().stalkers.length;

  // Just above the 70% mark, then one more hit crosses it.
  monsters.debugSetBossHp(BOSS_HP * 0.7 + 1);
  assert.equal(monsters.list().boss.phase, 1);
  const hit = hitBoss(monsters, player, 2);
  assert.equal(hit.length, 1);
  assert.equal(hit[0].boss, true);
  assert.deepEqual(phases, [2]);
  assert.equal(monsters.list().boss.state, 'phaseShift');

  // Untouchable during the transition.
  assert.equal(hitBoss(monsters, player, 5).length, 0);
  assert.equal(monsters.list().boss.hp, Math.round((BOSS_HP * 0.7 - 1) * 10) / 10);

  // After the transition: thrown back, hurt once by the wave, reavers summoned.
  run(monsters, player, 3);
  assert.ok(player.pushed > 100, 'the transition wave did not throw the player back');
  assert.ok(player.hits.some(h => h.cause.includes('THROWN BACK')));
  assert.equal(monsters.list().stalkers.length, before + 2);
  assert.notEqual(monsters.list().boss.state, 'phaseShift');

  // Phase 2: gravity wells open under the player; stay at range and watch.
  const seen = new Set();
  run(monsters, player, 20, () => {
    seen.add(monsters.list().boss.state);
    if (monsters.list().effects.wells > 0) seen.add('effect:wells');
    holdAt(monsters, player, 420);
  });
  assert.ok(seen.has('wellCast') && seen.has('effect:wells'), `no gravity well in phase 2: ${[...seen].join(', ')}`);

  // Phase 3 and the Eclipse Collapse.
  monsters.debugSetBossHp(BOSS_HP * 0.35 + 1);
  hitBoss(monsters, player, 2);
  assert.deepEqual(phases, [2, 3]);
  run(monsters, player, 3);
  assert.equal(monsters.list().stalkers.length, before + 5);

  const states = new Set();
  let coronaChecked = false;
  run(monsters, player, 30, () => {
    const b = monsters.list().boss;
    states.add(b.state);
    if (b.state === 'eclipseCharge') {
      // Stand in the corona (330..420 from the boss): it must be safe.
      holdAt(monsters, player, 375);
      coronaChecked = true;
    } else if (b.state !== 'eclipseBurst') {
      holdAt(monsters, player, 420);
    }
  });
  assert.ok(states.has('eclipseCharge') && states.has('eclipseRecover'), `no eclipse in phase 3: ${[...states].join(', ')}`);
  assert.ok(eclipses.length >= 1);
  assert.ok(coronaChecked);
  assert.ok(!player.hits.some(h => h.cause.includes('SWALLOWED')), 'the corona was not safe');
});

test('standing inside the eclipse (outside the corona) hurts and exposes the core', () => {
  const monsters = createUmbrielMonsters(ASSETS);
  const player = makePlayer(LAIR.x - 300, LAIR.y);
  run(monsters, player, 0.5);
  monsters.debugSetBossHp(BOSS_HP * 0.35 + 1);
  hitBoss(monsters, player, 2);
  run(monsters, player, 3);

  let swallowed = false;
  let exposedDamage = 0;
  run(monsters, player, 40, () => {
    const b = monsters.list().boss;
    if (b.state === 'eclipseCharge') holdAt(monsters, player, 200);
    else if (b.state === 'eclipseRecover' && !exposedDamage) {
      const hpBefore = b.hp;
      hitBoss(monsters, player, 10);
      exposedDamage = Math.round((hpBefore - monsters.list().boss.hp) * 10) / 10;
    } else if (b.state !== 'eclipseBurst') holdAt(monsters, player, 420);
    if (player.hits.some(h => h.cause.includes('SWALLOWED'))) swallowed = true;
  });
  assert.ok(swallowed, 'the eclipse never hit a player standing in the dark');
  assert.equal(exposedDamage, 15, 'the exposed core should take +50% damage');
});

test('the boss dies, rewards once, and its state survives save/load', () => {
  const defeated = [];
  const monsters = createUmbrielMonsters(ASSETS, { onBossDefeated: (x, y) => defeated.push({ x, y }) });
  const player = makePlayer(LAIR.x - 300, LAIR.y);
  run(monsters, player, 0.2);

  let guard = 0;
  while (monsters.list().boss && monsters.list().boss.state !== 'die' && guard++ < 3000) {
    hitBoss(monsters, player, 3);
    run(monsters, player, 0.1);
  }
  assert.equal(monsters.list().boss.state, 'die');

  run(monsters, player, 4);
  assert.equal(monsters.isBossDefeated(), true);
  assert.equal(monsters.list().boss, null);
  assert.equal(defeated.length, 1);
  assert.deepEqual(monsters.save(), { bossDefeated: true });

  // A defeated boss stays gone after a sleep/respawn and a load.
  monsters.respawn(0, 0);
  assert.equal(monsters.list().boss, null);
  monsters.load({ bossDefeated: false });
  assert.notEqual(monsters.list().boss, null);
  assert.equal(monsters.list().boss.hp, BOSS_HP);
});

test('Void Reavers hunt in packs and charge from mid range', () => {
  const monsters = createUmbrielMonsters(ASSETS);
  const first = monsters.list().stalkers[0];
  // Close enough to be noticed without being seen.
  const player = makePlayer(first.x + 250, first.y);
  const states = new Set();

  run(monsters, player, 12, () => {
    const stalkers = monsters.list().stalkers;
    for (const s of stalkers) states.add(s.state);

    // Once hunted, stay 400 from the nearest hunter so charges keep coming.
    const hunter = stalkers.filter(s => s.alerted).reduce((a, s) => {
      const d = Math.hypot(s.x - player.x, s.y - player.y);
      return d < a.d ? { d, s } : a;
    }, { d: Infinity, s: null }).s;

    if (hunter) {
      const angle = Math.atan2(player.y - hunter.y, player.x - hunter.x);
      player.x = hunter.x + Math.cos(angle) * 400;
      player.y = hunter.y + Math.sin(angle) * 400;
    }
  });

  assert.ok(monsters.list().stalkers.some(s => s.alerted), 'no reaver noticed the player');
  assert.ok(states.has('chargeWind') || states.has('charge'), `no charge seen: ${[...states].join(', ')}`);
  assert.ok(monsters.list().stalkers.every(s => Math.hypot(s.x, s.y) <= 6400));
});
