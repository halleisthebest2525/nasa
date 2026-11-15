// ==========================================
// UMBRIEL MONSTERS
// Void Reaver (regular): Idle 4 · Move 4 · Run/Charge 4 · Attack 4 · Hurt 2 · Die 4
// Nocturnus, the Void Sovereign (final boss):
//   Idle/Hover 6 · Move/Drift 7 · Void Pulse 4 · Shard Barrage 4 · Gravity Well 6
//   Eclipse Collapse 8 · Hurt 2 · Phase Transition 6 · Death 8
//
// Umbriel is a monochrome world, so every effect here is white or grey.
// Nocturnus floats (bobs, never walks) and is the hardest fight in the game:
//   A. VOID PULSE      a ring that races outwards from its body. Be outside
//                      the circle (or in the tiny eye next to it) when it fires.
//                      Phase 3 fires a second, echo ring.
//   B. SHARD BARRAGE   a fan of void shards. From phase 2 they curve after you.
//   C. GRAVITY WELL    a well opens UNDER YOU (not at the boss) and pulls you
//                      into its centre. Phase 3 opens two at once.
//   D. VOID STEP       stay glued to it and it blinks away, then fires shards.
//   E. ECLIPSE COLLAPSE (phase 3) the whole arena goes dark; only the bright
//                      ring of the corona is safe. Afterwards its core is exposed.
//   PHASE TRANSITION   at 70% and 35% it becomes untouchable, throws you back
//                      and calls Void Reavers to its side.
// Touching its body burns. It shrugs off most hits (it rarely flinches).
// Effects are drawn by code, never part of the boss sprite. Sprites face RIGHT.
// ==========================================

const SURFACE_RADIUS = 6400;      // Umbriel
const SHIP_SAFE_RADIUS = 300;     // nobody chases you next to the ship

// ---------- VOID REAVER ----------
const REAVER = {
  count: 14,
  scale: 1.55,
  hp: 14,                // Titan crawler: 10
  walkSpeed: 135,
  runSpeed: 215,         // the player walks 190 and runs 228
  runDistance: 230,
  acceleration: 5,
  sightRange: 620,
  sightHalfAngle: Math.PI / 3,
  noticeRange: 300,
  giveUpRange: 1000,
  packRange: 380,        // an alerted reaver wakes the reavers around it
  attackRange: 64,
  hitRange: 96,          // the void lash reaches far
  damage: 24,
  attackCooldown: 1.0,
  damageFrame: 3,        // the crescent slash frame
  // VOID CHARGE: from mid range it locks on, then dashes in a straight line.
  // The direction is fixed when the dash starts, so a side-step dodges it.
  charge: { minRange: 260, maxRange: 560, windup: 0.35, speed: 420, time: 0.55, hitRange: 58, damage: 16, cooldown: 6 },
  bodyRadius: 26,
  respawnDelay: 28,
  minSpawnDistance: 700
};

const REAVER_ANIMS = {
  idle:   { frames: 4, time: 0.2, loop: true },
  move:   { frames: 4, time: 0.11, loop: true },
  run:    { frames: 4, time: 0.075, loop: true },
  attack: { frames: 4, time: 0.09, loop: false },
  hurt:   { frames: 2, time: 0.12, loop: false },
  die:    { frames: 4, time: 0.15, loop: false }
};

// States that reuse another state's frames.
const REAVER_STATE_ANIMS = { ...REAVER_ANIMS, chargeWind: REAVER_ANIMS.run, charge: REAVER_ANIMS.run };

// ---------- NOCTURNUS (BOSS) ----------
const BOSS = {
  lairX: 3200,           // guards the bottom-right of Umbriel
  lairY: 2900,
  scale: 3,
  hp: 85,                // Titan Wraith: 66 (was 120: too long a fight)
  // Phase 2 below 70% HP, phase 3 below 35%.
  phaseAt: [0.7, 0.35],
  moveSpeed: [60, 90, 110],
  aggroRange: 680,
  leashRange: 1400,
  arenaRadius: 700,      // Void Step never leaves this circle around the lair
  bodyRadius: 80,
  keepDistance: 270,     // it hovers at range instead of charging in
  // Touching the body burns.
  contact: { damage: 4, tick: 0.8 },
  // It only flinches now and then (seconds between flinches, per phase).
  flinchCooldown: [1.2, 2.0, 2.8],

  // A. Void Pulse: a ring races outwards. Safe beyond it, or inside the eye.
  pulse: { windup: 1.1, radius: 340, eye: 60, speed: 520, damage: 14, push: 150, cooldown: [6.5, 5.5, 4.5], echoDelay: 0.55 },
  // B. Shard Barrage: a fan of shards; from phase 2 they curve after the player.
  shard: { range: 760, count: [5, 7, 9], spread: 0.26, speed: 380, life: 2.4, radius: 18, damage: 7, homing: [0, 1.1, 1.6], homingTime: 1.1, cooldown: [5, 4.2, 3.4] },
  // C. Gravity Well: opens under the player, then pulls (slower than walking).
  well: { range: 640, warn: 1.0, time: 4.2, radius: 290, pull: 150, core: 68, tick: 0.5, damage: 5, cooldown: [0, 10, 8.5], twin: 260 },
  // D. Void Step: when the player clings to it, it blinks away.
  blink: { nearRange: 170, nearTime: 1.8, out: 0.25, back: 0.25, cooldown: [0, 9, 7], minFromPlayer: 320, maxFromPlayer: 430 },
  // Phase transition: untouchable, a throw-back wave and summoned reavers.
  transition: { time: 2.4, waveAt: 1.2, waveRadius: 230, damage: 8, push: 260, summon: [0, 2, 3] }
};

// ECLIPSE COLLAPSE (phase 3 only)
const ECLIPSE = {
  cooldown: 26,
  firstUse: 6,           // seconds after phase 3 starts
  chargeTime: 3,         // the arena darkens; the safe corona ring shows
  radius: 560,           // everything inside is hit, except the corona
  safeInner: 330,        // the corona: a ring 330..420 from the boss
  safeOuter: 420,
  burstTime: 0.7,
  damage: 34,
  push: 200,
  recoverTime: 3,
  vulnerableMultiplier: 1.5
};

const BOSS_ANIMS = {
  idle:    { frames: 6, time: 0.16, loop: true },
  move:    { frames: 7, time: 0.13, loop: true },
  pulse:   { frames: 4, time: 0.24, loop: false },
  shard:   { frames: 4, time: 0.15, loop: false },
  well:    { frames: 6, time: 0.15, loop: false },
  eclipse: { frames: 8, time: 0.2, loop: false },
  hurt:    { frames: 2, time: 0.12, loop: false },
  phase:   { frames: 6, time: 0.4, loop: false },
  die:     { frames: 8, time: 0.2, loop: false, asset: 'death' }
};

const BOSS_STATE_ANIMS = { ...BOSS_ANIMS, pulseFire: BOSS_ANIMS.pulse, wellCast: BOSS_ANIMS.well };

const DEATH_FADE = 0.8;

function loadFrames(assets, prefix, anims) {
  const frames = {};

  for (const [name, anim] of Object.entries(anims)) {
    frames[name] = [];
    for (let i = 1; i <= anim.frames; i++) {
      frames[name].push(assets[`${prefix}_${anim.asset || name}_${i}`] || null);
    }
  }

  return frames;
}

const angleDifference = (a, b) => {
  const d = a - b;
  return Math.atan2(Math.sin(d), Math.cos(d));
};

// callbacks = { onBossDefeated(x, y), onBossPhase(phase), onEclipse() }
export function createUmbrielMonsters(assets, callbacks = {}) {
  const reaverFrames = loadFrames(assets, 'umbriel_reaver', REAVER_ANIMS);
  const bossFrames = loadFrames(assets, 'umbriel_boss', BOSS_ANIMS);

  let reavers = [];
  let respawnTimers = [];
  let boss = null;
  let bossDefeated = false;

  // Effects left in the world.
  let rings = [];        // void pulses: { x, y, time, radius, damage, hit }
  let shards = [];       // { x, y, vx, vy, age, homing }
  let wells = [];        // { x, y, age }  (warn phase, then pulling)
  let waves = [];        // visual shockwaves: { x, y, radius, time, duration }
  let wellTick = 0;      // one damage tick for ALL wells together (no stacking)
  let clock = 0;

  // ---------- shared helpers ----------
  function setState(m, state) {
    if (m.state === state) return;
    m.state = state;
    m.frame = 0;
    m.frameTimer = 0;
    m.damageDone = false;
  }

  // Returns true when a non-looping animation has finished.
  function animate(m, anims, dt) {
    const anim = anims[m.state];
    m.frameTimer += dt;

    while (m.frameTimer >= anim.time) {
      m.frameTimer -= anim.time;

      if (m.frame < anim.frames - 1) m.frame += 1;
      else if (anim.loop) m.frame = 0;
      else return true;
    }

    return false;
  }

  function steer(m, tx, ty, dt, rate = REAVER.acceleration) {
    const blend = Math.min(1, rate * dt);
    m.vx += (tx - m.vx) * blend;
    m.vy += (ty - m.vy) * blend;
  }

  function randomPoint(px, py, minFromPlayer) {
    let x = 0;
    let y = 0;

    for (let tries = 0; tries < 300; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * SURFACE_RADIUS * 0.85;
      x = Math.cos(a) * r;
      y = Math.sin(a) * r;

      if (
        Math.hypot(x, y) >= 600 &&
        Math.hypot(x - px, y - py) >= minFromPlayer &&
        Math.hypot(x - BOSS.lairX, y - BOSS.lairY) >= 850
      ) break;
    }

    return { x, y };
  }

  const bossPhase = b => (b.hp <= BOSS.hp * BOSS.phaseAt[1] ? 2 : b.hp <= BOSS.hp * BOSS.phaseAt[0] ? 1 : 0);

  // While blinking or changing phase the boss cannot be hit.
  const bossUntouchable = b => b.state === 'blinkOut' || b.state === 'blinkIn' || b.state === 'phaseShift';
  const bossGone = b => b.state === 'blinkOut' && b.timer < BOSS.blink.out * 0.3;

  // ROAMING: a reaver that is not hunting slithers to a nearby spot, waits
  // a few seconds, then picks another. Returns true while moving.
  function wander(m, dt) {
    m.wanderTimer = (m.wanderTimer ?? Math.random() * 5) - dt;

    if (!m.wanderTarget) {
      if (m.wanderTimer > 0) return false;

      const angle = Math.random() * Math.PI * 2;
      const reach = 160 + Math.random() * 260;

      m.wanderTarget = { x: m.x + Math.cos(angle) * reach, y: m.y + Math.sin(angle) * reach };
      m.wanderTimer = 9;
    }

    const dx = m.wanderTarget.x - m.x;
    const dy = m.wanderTarget.y - m.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 24 || m.wanderTimer <= 0) {
      m.wanderTarget = null;
      m.wanderTimer = 2 + Math.random() * 5;
      return false;
    }

    const speed = REAVER.walkSpeed * 0.55;

    steer(m, dx / distance * speed, dy / distance * speed, dt);
    m.lookAngle = Math.atan2(dy, dx);
    m.lookTarget = m.lookAngle;
    return true;
  }

  // ---------- spawning ----------
  function createReaver(x, y, alerted = false) {
    const look = Math.random() * Math.PI * 2;

    return {
      x, y, vx: 0, vy: 0,
      hp: REAVER.hp,
      state: 'idle',
      frame: Math.floor(Math.random() * 4),
      frameTimer: Math.random() * 0.2,
      facing: Math.cos(look) < 0 ? -1 : 1,
      lookAngle: look,
      lookTarget: look,
      lookTimer: 2 + Math.random() * 3,
      alerted,
      cooldown: 0,
      chargeCooldown: 2 + Math.random() * 3,
      chargeDir: 0,
      timer: 0,
      damageDone: false,
      deathDone: false,
      fade: 1
    };
  }

  function createBoss() {
    return {
      x: BOSS.lairX, y: BOSS.lairY, vx: 0, vy: 0,
      hp: BOSS.hp,
      state: 'idle',
      frame: 0,
      frameTimer: 0,
      facing: -1,
      alerted: false,
      phase: 0,
      pulseCooldown: 2.5,
      shardCooldown: 1.5,
      wellCooldown: 5,
      blinkCooldown: 4,
      eclipseCooldown: ECLIPSE.firstUse,
      flinchTimer: 0,
      contactTick: 0,
      nearTimer: 0,          // how long the player has clung to it
      timer: 0,              // time left in the current ability step
      blinkTarget: null,
      wellTargets: null,
      pendingPhase: 0,
      damageDone: false,
      waveDone: false,
      deathDone: false,
      fade: 1
    };
  }

  function spawnAll(playerX = 0, playerY = 0) {
    reavers = [];
    respawnTimers = [];
    rings = [];
    shards = [];
    wells = [];
    waves = [];

    for (let i = 0; i < REAVER.count; i++) {
      const p = randomPoint(playerX, playerY, REAVER.minSpawnDistance);
      reavers.push(createReaver(p.x, p.y));
    }

    boss = bossDefeated ? null : createBoss();
  }

  // CONTINUOUS SPAWNING: a while after a kill a new reaver appears out of
  // the player's view, so Umbriel always has the same number.
  function tickRespawns(dt, player) {
    if (!respawnTimers.length) return;

    respawnTimers = respawnTimers.map(t => t - dt);

    while (respawnTimers.length && respawnTimers[0] <= 0) {
      respawnTimers.shift();
      if (reavers.length >= REAVER.count) continue;

      const min = Math.max(REAVER.minSpawnDistance, (player.viewDistance || 0) + 250);
      const p = randomPoint(player.x, player.y, min);
      reavers.push(createReaver(p.x, p.y));
    }
  }

  // ---------- VOID REAVER AI ----------
  function updateReaver(s, dt, player, playerSafe) {
    s.cooldown = Math.max(0, s.cooldown - dt);
    s.chargeCooldown = Math.max(0, s.chargeCooldown - dt);

    const dx = player.x - s.x;
    const dy = player.y - s.y;
    const distance = Math.hypot(dx, dy) || 0.01;

    if (s.state === 'die') {
      steer(s, 0, 0, dt);
      if (s.deathDone) s.fade = Math.max(0, s.fade - dt / DEATH_FADE);
      else if (animate(s, REAVER_STATE_ANIMS, dt)) s.deathDone = true;
      return;
    }

    if (s.state === 'hurt') {
      steer(s, 0, 0, dt * 0.6);
      if (animate(s, REAVER_STATE_ANIMS, dt)) setState(s, 'idle');
      return;
    }

    if (s.state === 'attack') {
      steer(s, 0, 0, dt);

      // Damage on the slash frame, once per attack.
      if (s.frame === REAVER.damageFrame && !s.damageDone) {
        s.damageDone = true;
        if (distance <= REAVER.hitRange) player.damage(REAVER.damage, 'LASHED BY A VOID REAVER');
      }

      if (animate(s, REAVER_STATE_ANIMS, dt)) {
        s.cooldown = REAVER.attackCooldown;
        setState(s, 'idle');
      }
      return;
    }

    // VOID CHARGE: lock on (coiled, facing the player), then dash straight.
    if (s.state === 'chargeWind') {
      steer(s, 0, 0, dt);
      s.timer -= dt;
      s.facing = dx < 0 ? -1 : 1;
      s.chargeDir = Math.atan2(dy, dx);
      s.frame = 0;

      if (s.timer <= 0) {
        setState(s, 'charge');
        s.timer = REAVER.charge.time;
        s.vx = Math.cos(s.chargeDir) * REAVER.charge.speed;
        s.vy = Math.sin(s.chargeDir) * REAVER.charge.speed;
      }
      return;
    }

    if (s.state === 'charge') {
      s.timer -= dt;
      animate(s, REAVER_STATE_ANIMS, dt);

      if (!s.damageDone && distance <= REAVER.charge.hitRange) {
        s.damageDone = true;
        player.damage(REAVER.charge.damage, 'RUN DOWN BY A VOID REAVER');
        s.timer = Math.min(s.timer, 0.1);
      }

      if (s.timer <= 0) {
        s.chargeCooldown = REAVER.charge.cooldown;
        s.cooldown = Math.max(s.cooldown, 0.4);
        s.vx *= 0.3;
        s.vy *= 0.3;
        setState(s, 'idle');
      }
      return;
    }

    // IDLE / MOVE / RUN: spot the player (sight cone, or always when close).
    if (!s.alerted && !playerSafe) {
      const inCone =
        distance <= REAVER.sightRange &&
        Math.abs(angleDifference(Math.atan2(dy, dx), s.lookAngle)) <= REAVER.sightHalfAngle;

      if (distance <= REAVER.noticeRange || inCone) s.alerted = true;
    }

    if (s.alerted && (distance > REAVER.giveUpRange || playerSafe)) s.alerted = false;

    if (s.alerted) {
      s.lookAngle = Math.atan2(dy, dx);
      if (Math.abs(dx) > 8) s.facing = dx < 0 ? -1 : 1;
    } else {
      // Idle: look around now and then.
      s.lookTimer -= dt;
      if (s.lookTimer <= 0) {
        s.lookTarget = s.lookAngle + (Math.random() - 0.5) * Math.PI * 1.6;
        s.lookTimer = 2 + Math.random() * 3;
      }
      const step = 2 * dt;
      const diff = angleDifference(s.lookTarget, s.lookAngle);
      s.lookAngle += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
      if (Math.abs(Math.cos(s.lookAngle)) > 0.2) s.facing = Math.cos(s.lookAngle) < 0 ? -1 : 1;
    }

    if (s.alerted && distance <= REAVER.attackRange && s.cooldown <= 0) {
      s.facing = dx < 0 ? -1 : 1;
      setState(s, 'attack');
    } else if (
      s.alerted && s.chargeCooldown <= 0 &&
      distance >= REAVER.charge.minRange && distance <= REAVER.charge.maxRange
    ) {
      setState(s, 'chargeWind');
      s.timer = REAVER.charge.windup;
    } else if (s.alerted && distance > REAVER.attackRange * 0.8) {
      const running = distance > REAVER.runDistance;
      const speed = running ? REAVER.runSpeed : REAVER.walkSpeed;

      steer(s, dx / distance * speed, dy / distance * speed, dt);
      setState(s, running ? 'run' : 'move');
    } else if (!s.alerted && wander(s, dt)) {
      setState(s, 'move');
    } else {
      steer(s, 0, 0, dt);
      if (Math.hypot(s.vx, s.vy) < 12) setState(s, 'idle');
    }

    animate(s, REAVER_STATE_ANIMS, dt);
  }

  // ---------- NOCTURNUS: abilities ----------
  // Pulls the player towards (cx, cy). Slower than walking, so moving
  // away always wins.
  function pullPlayer(player, cx, cy, strength, radius, dt) {
    const dx = cx - player.x;
    const dy = cy - player.y;
    const distance = Math.hypot(dx, dy);

    if (distance > radius || distance < 12) return distance;

    const step = Math.min(distance, strength * dt);
    player.push(dx / distance * step, dy / distance * step);
    return distance;
  }

  // Throws the player straight away from (cx, cy).
  function throwPlayer(player, cx, cy, amount) {
    const dx = player.x - cx;
    const dy = player.y - cy;
    const distance = Math.hypot(dx, dy) || 1;
    player.push(dx / distance * amount, dy / distance * amount);
  }

  // A valid place to reappear: near the player, inside the arena and the planet.
  function pickBlinkTarget(player) {
    for (let tries = 0; tries < 60; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const reach = BOSS.blink.minFromPlayer + Math.random() * (BOSS.blink.maxFromPlayer - BOSS.blink.minFromPlayer);
      const x = player.x + Math.cos(angle) * reach;
      const y = player.y + Math.sin(angle) * reach;

      if (
        Math.hypot(x - BOSS.lairX, y - BOSS.lairY) <= BOSS.arenaRadius &&
        Math.hypot(x, y) <= SURFACE_RADIUS - 200 &&
        Math.hypot(x, y) >= SHIP_SAFE_RADIUS + 200
      ) return { x, y };
    }

    return { x: BOSS.lairX, y: BOSS.lairY };   // nothing valid: go home
  }

  function startStep(b, state, time) {
    b.state = state;
    b.frame = 0;
    b.frameTimer = 0;
    b.timer = time;
    b.damageDone = false;
    b.vx = 0;
    b.vy = 0;
  }

  function fireShards(b, player, phase) {
    const aim = Math.atan2(player.y - b.y, player.x - b.x);
    const count = BOSS.shard.count[phase];

    for (let i = 0; i < count; i++) {
      const angle = aim + (i - (count - 1) / 2) * BOSS.shard.spread;

      shards.push({
        x: b.x + Math.cos(angle) * 70,
        y: b.y - 120 + Math.sin(angle) * 70,
        vx: Math.cos(angle) * BOSS.shard.speed,
        vy: Math.sin(angle) * BOSS.shard.speed,
        age: 0,
        homing: BOSS.shard.homing[phase]
      });
    }
  }

  function firePulse(b, phase) {
    rings.push({ x: b.x, y: b.y, time: 0, radius: BOSS.pulse.radius, damage: BOSS.pulse.damage, hit: false });
    // Phase 3: an echo ring a moment later, for anyone who stepped back in.
    if (phase >= 2) rings.push({ x: b.x, y: b.y, time: -BOSS.pulse.echoDelay, radius: BOSS.pulse.radius, damage: BOSS.pulse.damage, hit: false });
  }

  function summonReavers(b, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.PI / 2 + (i - (count - 1) / 2) * 0.9;
      reavers.push(createReaver(b.x + Math.cos(angle) * 200, b.y + Math.sin(angle) * 120, true));
    }
  }

  function updateBoss(b, dt, player, playerSafe) {
    const dx = player.x - b.x;
    const dy = player.y - b.y;
    const distance = Math.hypot(dx, dy) || 0.01;
    const phase = b.phase;

    b.pulseCooldown = Math.max(0, b.pulseCooldown - dt);
    b.shardCooldown = Math.max(0, b.shardCooldown - dt);
    b.wellCooldown = Math.max(0, b.wellCooldown - dt);
    b.blinkCooldown = Math.max(0, b.blinkCooldown - dt);
    b.flinchTimer = Math.max(0, b.flinchTimer - dt);
    b.contactTick = Math.max(0, b.contactTick - dt);
    if (b.alerted && phase >= 2) b.eclipseCooldown = Math.max(0, b.eclipseCooldown - dt);

    // Clinging to the boss (for Void Step).
    if (b.alerted && distance <= BOSS.blink.nearRange) b.nearTimer += dt;
    else b.nearTimer = 0;

    if (b.state === 'die') {
      steer(b, 0, 0, dt);

      if (b.deathDone) {
        b.fade = Math.max(0, b.fade - dt / DEATH_FADE);
      } else if (animate(b, BOSS_STATE_ANIMS, dt)) {
        b.deathDone = true;
        bossDefeated = true;
        if (callbacks.onBossDefeated) callbacks.onBossDefeated(b.x, b.y);
      }
      return;
    }

    // Its body burns: the player is pushed out and hurt.
    if (b.state !== 'blinkOut' && b.state !== 'blinkIn' && distance < BOSS.bodyRadius + 14) {
      throwPlayer(player, b.x, b.y, BOSS.bodyRadius + 14 - distance);

      if (b.contactTick <= 0) {
        b.contactTick = BOSS.contact.tick;
        player.damage(BOSS.contact.damage, 'BURNED BY THE VOID SOVEREIGN');
      }
    }

    if (b.state === 'hurt') {
      steer(b, 0, 0, dt);
      if (animate(b, BOSS_STATE_ANIMS, dt)) setState(b, 'idle');
      return;
    }

    // ----- PHASE TRANSITION -----
    if (b.state === 'phaseShift') {
      b.timer -= dt;
      const progress = 1 - Math.max(0, b.timer) / BOSS.transition.time;
      b.frame = Math.min(5, Math.floor(progress * 6));

      if (!b.waveDone && progress >= BOSS.transition.waveAt / BOSS.transition.time) {
        b.waveDone = true;

        waves.push({ x: b.x, y: b.y, radius: BOSS.transition.waveRadius, time: 0, duration: 0.4 });

        if (distance <= BOSS.transition.waveRadius) {
          player.damage(BOSS.transition.damage, 'THROWN BACK BY THE VOID SOVEREIGN');
          throwPlayer(player, b.x, b.y, BOSS.transition.push);
        }

        summonReavers(b, BOSS.transition.summon[b.phase]);
      }

      if (b.timer <= 0) {
        // Fresh pressure right after the transition.
        b.shardCooldown = Math.min(b.shardCooldown, 1);
        b.pulseCooldown = Math.min(b.pulseCooldown, 2.5);
        b.state = 'phaseShift';
        setState(b, 'idle');
      }
      return;
    }

    // ----- A. VOID PULSE -----
    if (b.state === 'pulse') {
      steer(b, 0, 0, dt);
      b.timer -= dt;
      // Wind-up frames 1 -> 2 while the warning circle fills.
      b.frame = b.timer > BOSS.pulse.windup / 2 ? 0 : 1;

      if (b.timer <= 0) {
        firePulse(b, phase);
        setState(b, 'pulseFire');
        b.frame = 2;
      }
      return;
    }

    if (b.state === 'pulseFire') {
      if (animate(b, BOSS_STATE_ANIMS, dt)) {
        b.pulseCooldown = BOSS.pulse.cooldown[phase];
        setState(b, 'idle');
      }
      return;
    }

    // ----- B. SHARD BARRAGE -----
    if (b.state === 'shard') {
      steer(b, 0, 0, dt);

      // Frame 2: the shards leave the crown, fanned out towards the player.
      if (b.frame >= 1 && !b.damageDone) {
        b.damageDone = true;
        fireShards(b, player, phase);
      }

      if (animate(b, BOSS_STATE_ANIMS, dt)) {
        b.shardCooldown = BOSS.shard.cooldown[phase];
        setState(b, 'idle');
      }
      return;
    }

    // ----- C. GRAVITY WELL -----
    if (b.state === 'wellCast') {
      steer(b, 0, 0, dt);

      // Frame 3: the wells open where the player stood when the cast began.
      if (b.frame >= 2 && !b.damageDone) {
        b.damageDone = true;
        for (const target of b.wellTargets) wells.push({ x: target.x, y: target.y, age: 0 });
      }

      if (animate(b, BOSS_STATE_ANIMS, dt)) {
        b.wellCooldown = BOSS.well.cooldown[phase];
        b.wellTargets = null;
        setState(b, 'idle');
      }
      return;
    }

    // ----- D. VOID STEP -----
    if (b.state === 'blinkOut') {
      b.timer -= dt;

      if (b.timer <= 0) {
        b.x = b.blinkTarget.x;
        b.y = b.blinkTarget.y;
        b.facing = player.x < b.x ? -1 : 1;
        startStep(b, 'blinkIn', BOSS.blink.back);
      }
      return;
    }

    if (b.state === 'blinkIn') {
      b.timer -= dt;

      if (b.timer <= 0) {
        b.blinkCooldown = BOSS.blink.cooldown[phase];
        b.blinkTarget = null;
        b.nearTimer = 0;
        // Punishes the chase: shards follow at once.
        b.shardCooldown = Math.min(b.shardCooldown, 0.3);
        b.state = 'blinkIn';
        setState(b, 'idle');
      }
      return;
    }

    // ----- E. ECLIPSE COLLAPSE -----
    if (b.state === 'eclipseCharge') {
      b.timer -= dt;
      const progress = 1 - Math.max(0, b.timer) / ECLIPSE.chargeTime;
      b.frame = Math.min(3, Math.floor(progress * 4));

      if (b.timer <= 0) {
        const d = Math.hypot(player.x - b.x, player.y - b.y);
        const inCorona = d >= ECLIPSE.safeInner && d <= ECLIPSE.safeOuter;

        if (d < ECLIPSE.radius && !inCorona) {
          player.damage(ECLIPSE.damage, 'SWALLOWED BY THE ECLIPSE');
          throwPlayer(player, b.x, b.y, ECLIPSE.push);
        }

        waves.push({ x: b.x, y: b.y, radius: ECLIPSE.radius, time: 0, duration: ECLIPSE.burstTime });
        startStep(b, 'eclipseBurst', ECLIPSE.burstTime);
      }
      return;
    }

    if (b.state === 'eclipseBurst') {
      b.timer -= dt;
      b.frame = 4 + Math.min(3, Math.floor((1 - Math.max(0, b.timer) / ECLIPSE.burstTime) * 4));
      if (b.timer <= 0) startStep(b, 'eclipseRecover', ECLIPSE.recoverTime);
      return;
    }

    if (b.state === 'eclipseRecover') {
      b.timer -= dt;

      if (b.timer <= 0) {
        b.eclipseCooldown = ECLIPSE.cooldown;
        b.state = 'eclipseRecover';
        setState(b, 'idle');
      }
      return;
    }

    // ----- IDLE / DRIFT: decide what to do -----
    const fromLair = Math.hypot(b.x - BOSS.lairX, b.y - BOSS.lairY);
    const playerFromLair = Math.hypot(player.x - BOSS.lairX, player.y - BOSS.lairY);

    if (!playerSafe && distance <= BOSS.aggroRange) b.alerted = true;
    if (playerFromLair > BOSS.leashRange || playerSafe) b.alerted = false;

    if (b.alerted) {
      if (Math.abs(dx) > 10) b.facing = dx < 0 ? -1 : 1;

      if (phase >= 2 && b.eclipseCooldown <= 0 && distance <= ECLIPSE.radius + 150) {
        wells = [];   // nothing pulls you out of the corona
        startStep(b, 'eclipseCharge', ECLIPSE.chargeTime);
        if (callbacks.onEclipse) callbacks.onEclipse();
        return;
      }

      if (phase >= 1 && b.blinkCooldown <= 0 && b.nearTimer >= BOSS.blink.nearTime) {
        b.blinkTarget = pickBlinkTarget(player);
        startStep(b, 'blinkOut', BOSS.blink.out);
        return;
      }

      if (phase >= 1 && b.wellCooldown <= 0 && distance <= BOSS.well.range) {
        const targets = [{ x: player.x, y: player.y }];

        if (phase >= 2) {
          // A second well between the player and the boss: no easy retreat that way.
          targets.push({ x: player.x - dx / distance * BOSS.well.twin, y: player.y - dy / distance * BOSS.well.twin });
        }

        b.wellTargets = targets;
        setState(b, 'wellCast');
        return;
      }

      if (b.pulseCooldown <= 0 && distance <= BOSS.pulse.radius + 40) {
        startStep(b, 'pulse', BOSS.pulse.windup);
        return;
      }

      if (b.shardCooldown <= 0 && distance <= BOSS.shard.range) {
        setState(b, 'shard');
        return;
      }

      // Drift: come closer when far, back away when the player is too near.
      const speed = BOSS.moveSpeed[phase];

      if (distance > BOSS.keepDistance + 60) {
        steer(b, dx / distance * speed, dy / distance * speed, dt, 2);
        setState(b, 'move');
      } else if (distance < BOSS.keepDistance - 80 && fromLair < BOSS.arenaRadius) {
        steer(b, -dx / distance * speed * 0.7, -dy / distance * speed * 0.7, dt, 2);
        setState(b, 'move');
      } else {
        steer(b, 0, 0, dt, 2);
        if (Math.hypot(b.vx, b.vy) < 10) setState(b, 'idle');
      }
    } else if (fromLair > 30) {
      // Drift back to guard the lair.
      const speed = BOSS.moveSpeed[0];
      steer(b, (BOSS.lairX - b.x) / fromLair * speed, (BOSS.lairY - b.y) / fromLair * speed, dt, 2);
      if (Math.abs(b.vx) > 5) b.facing = b.vx < 0 ? -1 : 1;
      setState(b, 'move');
    } else {
      steer(b, 0, 0, dt, 2);
      if (Math.hypot(b.vx, b.vy) < 10) setState(b, 'idle');
    }

    if (b.state === 'idle' || b.state === 'move') animate(b, BOSS_STATE_ANIMS, dt);
  }

  // ---------- world effects ----------
  function updateEffects(dt, player) {
    // VOID PULSE rings: hurt once, when the ring front reaches the player.
    // The eye right next to the boss is safe (but its body burns).
    for (const ring of rings) {
      ring.time += dt;
      if (ring.time < 0) continue;

      const front = Math.min(ring.radius, ring.time * BOSS.pulse.speed);
      const d = Math.hypot(player.x - ring.x, player.y - ring.y);

      if (!ring.hit && d <= front && d > BOSS.pulse.eye) {
        ring.hit = true;
        player.damage(ring.damage, 'STRUCK BY A VOID PULSE');
        throwPlayer(player, ring.x, ring.y, BOSS.pulse.push);
      }
    }

    rings = rings.filter(ring => ring.time * BOSS.pulse.speed < ring.radius + 80);

    // SHARDS: fly, curve a little towards the player (phase 2+), hit once.
    for (const shard of shards) {
      shard.age += dt;

      if (shard.homing > 0 && shard.age < BOSS.shard.homingTime) {
        const wanted = Math.atan2(player.y - shard.y, player.x - shard.x);
        const current = Math.atan2(shard.vy, shard.vx);
        const diff = angleDifference(wanted, current);
        const turn = Math.sign(diff) * Math.min(Math.abs(diff), shard.homing * dt);
        const angle = current + turn;
        shard.vx = Math.cos(angle) * BOSS.shard.speed;
        shard.vy = Math.sin(angle) * BOSS.shard.speed;
      }

      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;

      if (!shard.hit && Math.hypot(player.x - shard.x, player.y - shard.y) <= BOSS.shard.radius + 14) {
        shard.hit = true;
        player.damage(BOSS.shard.damage, 'PIERCED BY A VOID SHARD');
      }
    }

    shards = shards.filter(shard => !shard.hit && shard.age < BOSS.shard.life && Math.hypot(shard.x, shard.y) < SURFACE_RADIUS);

    // GRAVITY WELLS: after the warning they pull; only the centre hurts.
    // One damage tick for all wells together, so two wells never stack.
    let inCore = false;

    for (const well of wells) {
      well.age += dt;
      if (well.age < BOSS.well.warn) continue;

      const d = pullPlayer(player, well.x, well.y, BOSS.well.pull, BOSS.well.radius, dt);
      if (d <= BOSS.well.core) inCore = true;
    }

    wells = wells.filter(well => well.age < BOSS.well.warn + BOSS.well.time);

    wellTick = Math.max(0, wellTick - dt);

    if (inCore && wellTick <= 0) {
      wellTick = BOSS.well.tick;
      player.damage(BOSS.well.damage, 'CRUSHED IN A GRAVITY WELL');
    }

    for (const wave of waves) wave.time += dt;
    waves = waves.filter(wave => wave.time < wave.duration + 0.35);
  }

  // player = { x, y, damage(amount, cause), push(dx, dy) }
  function update(dt, player) {
    clock += dt;

    const playerSafe = Math.hypot(player.x, player.y) < SHIP_SAFE_RADIUS;

    for (const s of reavers) {
      updateReaver(s, dt, player, playerSafe);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }

    // PACK HUNTERS: a hunting reaver wakes the reavers around it.
    if (!playerSafe) {
      for (const s of reavers) {
        if (!s.alerted || s.state === 'die') continue;
        for (const t of reavers) {
          if (!t.alerted && t.state !== 'die' && Math.hypot(t.x - s.x, t.y - s.y) <= REAVER.packRange) t.alerted = true;
        }
      }
    }

    if (boss) {
      updateBoss(boss, dt, player, playerSafe);
      boss.x += boss.vx * dt;
      boss.y += boss.vy * dt;

      if (boss.fade <= 0) boss = null;
    }

    updateEffects(dt, player);

    // Reavers push apart, stay on the surface and out of the ship zone.
    for (let i = 0; i < reavers.length; i++) {
      const a = reavers[i];

      for (let j = i + 1; j < reavers.length; j++) {
        const b = reavers[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);

        if (d > 0.01 && d < REAVER.bodyRadius * 2) {
          const push = (REAVER.bodyRadius * 2 - d) / 2;
          a.x -= dx / d * push; a.y -= dy / d * push;
          b.x += dx / d * push; b.y += dy / d * push;
        }
      }

      const r = Math.hypot(a.x, a.y);
      if (r > SURFACE_RADIUS - 60) { a.x *= (SURFACE_RADIUS - 60) / r; a.y *= (SURFACE_RADIUS - 60) / r; }
      if (r < SHIP_SAFE_RADIUS && r > 0.01) { a.x *= SHIP_SAFE_RADIUS / r; a.y *= SHIP_SAFE_RADIUS / r; }
    }

    reavers = reavers.filter(s => s.fade > 0);
  }

  // ---------- being hit by the player (martialArts.js) ----------
  // arc = half-angle of the attack cone (Math.PI = all around).
  // energy = an energy technique (the boss resists those: 60% damage).
  // hitSet (optional): monsters already hit by this attack are skipped.
  // Returns one entry per monster hit: { x, y, killed, boss }.
  const BOSS_REACH = 70;
  const BOSS_ENERGY_RESIST = 0.6;

  function strike({ x, y, angle = 0, range, arc = Math.PI, damage = 1, knockback = 190, energy = false, hitSet = null }) {
    const results = [];
    const inArc = (dx, dy, distance) =>
      arc >= Math.PI || distance <= 30 || Math.abs(angleDifference(Math.atan2(dy, dx), angle)) <= arc;

    for (const s of reavers) {
      if (s.state === 'die') continue;
      if (hitSet && hitSet.has(s)) continue;

      const dx = s.x - x;
      const dy = s.y - y;
      const distance = Math.hypot(dx, dy);

      if (distance > range + REAVER.bodyRadius * 0.5 || !inArc(dx, dy, distance)) continue;

      if (hitSet) hitSet.add(s);

      s.hp -= damage;
      s.alerted = true;
      s.vx = dx / (distance || 1) * knockback;
      s.vy = dy / (distance || 1) * knockback;

      if (s.hp <= 0) {
        setState(s, 'die');
        respawnTimers.push(REAVER.respawnDelay);
      } else {
        s.state = 'idle';
        setState(s, 'hurt');
      }

      results.push({ x: s.x, y: s.y, killed: s.hp <= 0, boss: false });
    }

    // The boss cannot be hit while blinking or changing phase.
    if (boss && boss.state !== 'die' && !bossUntouchable(boss) && !(hitSet && hitSet.has(boss))) {
      const dx = boss.x - x;
      const dy = boss.y - y;
      const distance = Math.hypot(dx, dy);

      if (distance <= range + BOSS_REACH && inArc(dx, dy, Math.max(0, distance - BOSS_REACH))) {
        if (hitSet) hitSet.add(boss);

        let dealt = damage * (energy ? BOSS_ENERGY_RESIST : 1);

        // Core exposed after the Eclipse: 50% more damage.
        if (boss.state === 'eclipseRecover') dealt *= ECLIPSE.vulnerableMultiplier;

        boss.hp -= dealt;
        boss.alerted = true;

        const phase = bossPhase(boss);

        if (boss.hp <= 0) {
          boss.state = 'idle';
          setState(boss, 'die');
        } else if (phase > boss.phase) {
          // PHASE TRANSITION: untouchable, then a wave and summoned reavers.
          boss.phase = phase;
          boss.waveDone = false;
          boss.wellTargets = null;
          boss.blinkTarget = null;
          boss.nearTimer = 0;
          if (phase >= 2) boss.eclipseCooldown = ECLIPSE.firstUse;
          startStep(boss, 'phaseShift', BOSS.transition.time);
          if (callbacks.onBossPhase) callbacks.onBossPhase(phase + 1);
        } else if ((boss.state === 'idle' || boss.state === 'move') && boss.flinchTimer <= 0) {
          // It flinches only now and then, and never mid-ability.
          boss.flinchTimer = BOSS.flinchCooldown[boss.phase];
          boss.state = 'idle';
          setState(boss, 'hurt');
        }

        results.push({ x: boss.x, y: boss.y, killed: boss.hp <= 0, boss: true });
      }
    }

    return results;
  }

  // ---------- drawing ----------
  function drawFrame(ctx, image, x, y, scale, facing, alpha = 1) {
    if (!image || !image.complete || image.naturalWidth === 0) return;

    const w = Math.round(image.naturalWidth * scale);
    const h = Math.round(image.naturalHeight * scale);

    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;   // crisp pixels, never blurred
    ctx.scale(facing, 1);
    // Bottom-centre anchor = the ground line shared by all frames.
    ctx.drawImage(image, -w / 2, -h + 6, w, h);
    ctx.restore();
  }

  function drawShadow(ctx, x, y, rx, ry, alpha = 0.35) {
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y) + 3, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // A chunky pixel-art ring: short blocks placed around a circle.
  function drawPixelRing(ctx, x, y, radius, color, block = 4, gapEvery = 0, turn = 0) {
    if (radius < 2) return;

    const count = Math.max(12, Math.floor(radius * Math.PI * 2 / (block * 1.6)));

    ctx.fillStyle = color;

    for (let i = 0; i < count; i++) {
      if (gapEvery && i % gapEvery === 0) continue;

      const a = i / count * Math.PI * 2 + turn;
      ctx.fillRect(
        Math.round((x + Math.cos(a) * radius) / 2) * 2 - block / 2,
        Math.round((y + Math.sin(a) * radius) / 2) * 2 - block / 2,
        block, block
      );
    }
  }

  // Rotating arcs: the vortex of a gravity well. strength 0..1 = denser.
  function drawVortex(ctx, x, y, radius, strength, color, speed = 2.4) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;

    for (let ring = 0; ring < 4; ring++) {
      const r = radius * (0.28 + ring * 0.24);
      const turn = clock * speed * (1 + ring * 0.15) + ring * 1.3;

      ctx.globalAlpha = (0.25 + 0.5 * strength) * (1 - ring * 0.15);

      for (let arm = 0; arm < 3; arm++) {
        const start = turn + arm * Math.PI * 2 / 3;
        ctx.beginPath();
        ctx.arc(x, y, r, start, start + 1.1);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // A soft white glow (drawn additively, so sprites stay untouched).
  function drawGlowSpot(ctx, x, y, inner, outer, alpha) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(x, y, inner, x, y, outer);
    glow.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    glow.addColorStop(0.5, `rgba(190, 196, 206, ${alpha * 0.4})`);
    glow.addColorStop(1, 'rgba(190, 196, 206, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - outer, y - outer, outer * 2, outer * 2);
    ctx.restore();
  }

  function drawReaver(ctx, s, x, y) {
    if (s.state !== 'die') drawShadow(ctx, x, y, 30, 8);

    // Charging: two fading after-images behind it.
    if (s.state === 'charge') {
      const speed = Math.hypot(s.vx, s.vy) || 1;
      for (let i = 1; i <= 2; i++) {
        drawFrame(ctx, reaverFrames.run[s.frame], x - s.vx / speed * 22 * i, y - s.vy / speed * 22 * i, REAVER.scale, s.facing, 0.3 / i);
      }
    }

    // Attack frame 4 already contains the reaver and its crescent slash.
    drawFrame(ctx, reaverFrames[REAVER_STATE_ANIMS[s.state] === REAVER_ANIMS.run ? 'run' : s.state][s.frame], x, y, REAVER.scale, s.facing, s.fade);
  }

  // The boss floats: it bobs gently and its shadow stays on the ground.
  const hover = () => Math.sin(clock * 2.1) * 9 - 26;

  // Which frame set and frame the boss shows in each state.
  function bossImage(b) {
    switch (b.state) {
      case 'pulse': case 'pulseFire': return bossFrames.pulse[b.frame];
      case 'shard': return bossFrames.shard[b.frame];
      case 'wellCast': return bossFrames.well[b.frame];
      case 'eclipseCharge': case 'eclipseBurst': return bossFrames.eclipse[b.frame];
      case 'phaseShift': return bossFrames.phase[b.frame];
      case 'eclipseRecover': return bossFrames.hurt[Math.floor(clock * 2.5) % 2];
      case 'blinkOut': case 'blinkIn': return bossFrames.idle[0];
      default: return bossFrames[b.state][b.frame];
    }
  }

  function drawBoss(ctx, b, x, y) {
    const by = y + hover();

    if (b.state === 'blinkOut' || b.state === 'blinkIn') {
      // Fades out, is gone for a moment, fades in elsewhere.
      const total = b.state === 'blinkOut' ? BOSS.blink.out : BOSS.blink.back;
      const left = Math.max(0, b.timer) / total;
      const alpha = b.state === 'blinkOut' ? left : 1 - left;

      drawShadow(ctx, x, y, 110, 22, 0.25 * alpha);
      drawFrame(ctx, bossImage(b), x, by, BOSS.scale, b.facing, alpha);
      return;
    }

    if (b.state !== 'die') drawShadow(ctx, x, y, 120, 24, 0.3);

    const alpha = b.state === 'eclipseRecover' ? 0.85 : b.fade;
    drawFrame(ctx, bossImage(b), x, by, BOSS.scale, b.facing, alpha);
  }

  function draw(ctx, cameraX, cameraY, width, height) {
    const onScreen = (x, y, margin) =>
      x > -margin && y > -margin && x < width + margin && y < height + margin;

    // Monsters from back to front (higher on screen first).
    const all = reavers.map(s => ({ m: s, isBoss: false }));
    if (boss) all.push({ m: boss, isBoss: true });
    all.sort((a, b) => a.m.y - b.m.y);

    for (const { m, isBoss } of all) {
      const x = cameraX + m.x;
      const y = cameraY + m.y;

      if (!onScreen(x, y, isBoss ? 520 : 200)) continue;

      if (isBoss) drawBoss(ctx, m, x, y);
      else drawReaver(ctx, m, x, y);
    }
  }

  // Drawn AFTER the darkness: warnings, rings, shards and wells glow in
  // the dark, so every boss attack can be seen coming.
  function drawGlow(ctx, cameraX, cameraY, width, height) {
    const onScreen = (x, y, margin) =>
      x > -margin && y > -margin && x < width + margin && y < height + margin;

    const pulse = 0.5 + 0.5 * Math.sin(clock * 20);

    // Gravity wells: a warning circle, then a vortex with a bright centre.
    for (const well of wells) {
      const x = cameraX + well.x;
      const y = cameraY + well.y;
      if (!onScreen(x, y, BOSS.well.radius)) continue;

      if (well.age < BOSS.well.warn) {
        const charge = well.age / BOSS.well.warn;
        ctx.save();
        ctx.fillStyle = `rgba(255, 255, 255, ${0.06 + 0.06 * pulse})`;
        ctx.beginPath();
        ctx.arc(x, y, BOSS.well.radius * charge, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        drawPixelRing(ctx, x, y, BOSS.well.radius, `rgba(255, 255, 255, ${0.45 + 0.4 * pulse})`, 6, 2);
        drawPixelRing(ctx, x, y, BOSS.well.radius * charge, '#ffffff', 4);
      } else {
        const left = BOSS.well.warn + BOSS.well.time - well.age;
        const fade = Math.min(1, left * 1.5);
        ctx.save();
        ctx.globalAlpha = fade;
        drawVortex(ctx, x, y, BOSS.well.radius, 0.6, '#d7dce3');
        drawPixelRing(ctx, x, y, BOSS.well.radius, 'rgba(230, 234, 240, 0.7)', 4, 3, clock * 0.8);
        drawPixelRing(ctx, x, y, BOSS.well.core, `rgba(255, 255, 255, ${0.5 + 0.4 * pulse})`, 4, 2, -clock * 2);
        ctx.restore();
        drawGlowSpot(ctx, x, y, 4, 60, 0.35 * fade);
      }
    }

    // Void pulse rings.
    for (const ring of rings) {
      if (ring.time < 0) continue;
      const x = cameraX + ring.x;
      const y = cameraY + ring.y;
      if (!onScreen(x, y, ring.radius)) continue;

      const front = Math.min(ring.radius, ring.time * BOSS.pulse.speed);
      const fade = front < ring.radius ? 1 : Math.max(0, 1 - (ring.time * BOSS.pulse.speed - ring.radius) / 80);

      ctx.save();
      ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.arc(x, y, front, 0, Math.PI * 2);
      ctx.fill();
      drawPixelRing(ctx, x, y, front, '#ffffff', 8);
      drawPixelRing(ctx, x, y, front - 12, '#c9ced6', 6);
      drawPixelRing(ctx, x, y, front - 24, 'rgba(140, 148, 160, 0.75)', 4, 2);
      ctx.restore();
    }

    // Shards: bright diamonds with a short trail.
    ctx.save();
    for (const shard of shards) {
      const x = cameraX + shard.x;
      const y = cameraY + shard.y;
      if (!onScreen(x, y, 60)) continue;

      const speed = Math.hypot(shard.vx, shard.vy) || 1;
      const ux = shard.vx / speed;
      const uy = shard.vy / speed;

      ctx.fillStyle = 'rgba(200, 206, 214, 0.5)';
      for (let i = 1; i <= 3; i++) {
        ctx.fillRect(Math.round(x - ux * 10 * i) - 2, Math.round(y - uy * 10 * i) - 2, 4, 4);
      }

      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(Math.atan2(uy, ux));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(0, 7);
      ctx.lineTo(-12, 0);
      ctx.lineTo(0, -7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // Shockwaves (phase transition, eclipse burst).
    for (const wave of waves) {
      const x = cameraX + wave.x;
      const y = cameraY + wave.y;
      if (!onScreen(x, y, wave.radius)) continue;

      const progress = Math.min(1, wave.time / wave.duration);
      const fade = wave.time <= wave.duration ? 1 : Math.max(0, 1 - (wave.time - wave.duration) / 0.35);
      const radius = wave.radius * progress;

      ctx.save();
      ctx.globalAlpha = fade;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.25 * (1 - progress * 0.6)})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      drawPixelRing(ctx, x, y, radius, '#ffffff', 8);
      drawPixelRing(ctx, x, y, radius - 14, 'rgba(200, 206, 214, 0.8)', 6);
      ctx.restore();
    }

    if (!boss) return;

    const b = boss;
    const x = cameraX + b.x;
    const y = cameraY + b.y;

    if (!onScreen(x, y, 720)) return;

    const coreY = y + hover() - 150;

    if (b.state === 'pulse') {
      // Warning: the circle fills up; when full, the ring races out.
      const charge = 1 - Math.max(0, b.timer) / BOSS.pulse.windup;

      ctx.save();
      ctx.fillStyle = `rgba(255, 255, 255, ${0.07 + 0.07 * pulse})`;
      ctx.beginPath();
      ctx.arc(x, y, BOSS.pulse.radius * charge, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      drawPixelRing(ctx, x, y, BOSS.pulse.radius, `rgba(255, 255, 255, ${0.55 + 0.4 * pulse})`, 6, 2);
      drawPixelRing(ctx, x, y, BOSS.pulse.radius * charge, '#ffffff', 4);
      drawPixelRing(ctx, x, y, BOSS.pulse.eye, 'rgba(255, 255, 255, 0.6)', 3, 3, clock * 2);
      drawGlowSpot(ctx, x, coreY, 6, 90 + 40 * charge, 0.3 + 0.4 * charge);
    } else if (b.state === 'blinkOut' || b.state === 'blinkIn') {
      // Where it will reappear: a ring that closes in, with falling motes.
      const target = b.state === 'blinkIn' ? { x: b.x, y: b.y } : b.blinkTarget;

      if (target) {
        const tx = cameraX + target.x;
        const ty = cameraY + target.y;
        const closing = b.state === 'blinkOut' ? Math.max(0, b.timer) / BOSS.blink.out : 0;

        drawPixelRing(ctx, tx, ty, 70 + closing * 90, `rgba(255, 255, 255, ${0.5 + 0.4 * pulse})`, 4, 2, clock * 3);
        drawPixelRing(ctx, tx, ty, 70, 'rgba(255, 255, 255, 0.75)', 3, 3, -clock * 2);

        ctx.fillStyle = '#e6e9ee';
        for (let i = 0; i < 10; i++) {
          const fall = (clock * 0.9 + i * 0.21) % 1;
          const a = i * 2.399;
          ctx.fillRect(Math.round(tx + Math.cos(a) * 50), Math.round(ty + Math.sin(a) * 30 - 90 + fall * 90), 3, 3);
        }
      }
    } else if (b.state === 'phaseShift') {
      // Untouchable: a bright cage of rings around the body.
      drawPixelRing(ctx, x, coreY, 120 + 10 * pulse, 'rgba(255, 255, 255, 0.8)', 5, 2, clock * 2.5);
      drawPixelRing(ctx, x, coreY, 150, 'rgba(200, 206, 214, 0.6)', 4, 3, -clock * 1.8);
      drawGlowSpot(ctx, x, coreY, 8, 120, 0.4 + 0.3 * pulse);
    } else if (b.state === 'eclipseCharge') {
      const charge = 1 - Math.max(0, b.timer) / ECLIPSE.chargeTime;

      // The arena goes dark: everything inside the circle is swallowed...
      ctx.save();
      ctx.fillStyle = `rgba(0, 0, 0, ${0.3 + 0.45 * charge})`;
      ctx.beginPath();
      ctx.arc(x, y, ECLIPSE.radius, 0, Math.PI * 2);
      ctx.fill();

      // ...except the corona: a bright ring band, the only safe place.
      ctx.fillStyle = `rgba(255, 255, 255, ${0.16 + 0.14 * pulse})`;
      ctx.beginPath();
      ctx.arc(x, y, ECLIPSE.safeOuter, 0, Math.PI * 2);
      ctx.arc(x, y, ECLIPSE.safeInner, 0, Math.PI * 2, true);
      ctx.fill();
      ctx.restore();

      drawPixelRing(ctx, x, y, ECLIPSE.radius, `rgba(255, 255, 255, ${0.6 + 0.4 * pulse})`, 6, 2);
      drawPixelRing(ctx, x, y, ECLIPSE.radius * charge, '#ffffff', 4);
      drawPixelRing(ctx, x, y, ECLIPSE.safeInner, '#ffffff', 4, 0, clock);
      drawPixelRing(ctx, x, y, ECLIPSE.safeOuter, '#ffffff', 4, 0, -clock);

      // Motes drawn into the core, faster as it builds.
      ctx.fillStyle = '#e6e9ee';
      for (let i = 0; i < 26; i++) {
        const travel = (clock * (0.7 + charge * 0.9) + i * 0.137) % 1;
        const a = i * 2.399 + travel * 2.2;
        const r = ECLIPSE.radius * (1 - travel) * 0.92 + 20;
        ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(coreY + Math.sin(a) * r * 0.85), 3, 3);
      }

      drawGlowSpot(ctx, x, coreY, 6, 110 + 50 * pulse, 0.3 + 0.6 * charge);
    } else if (b.state === 'eclipseBurst') {
      const done = 1 - Math.max(0, b.timer) / ECLIPSE.burstTime;
      ctx.save();
      ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * (1 - done)})`;
      ctx.beginPath();
      ctx.arc(x, y, ECLIPSE.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawGlowSpot(ctx, x, coreY, 10, 160 + 120 * done, 0.9 * (1 - done));
    } else if (b.state === 'eclipseRecover') {
      // Exposed core: a steady glow marks the moment to strike.
      drawGlowSpot(ctx, x, coreY, 4, 80, 0.5 + 0.3 * pulse);
      drawPixelRing(ctx, x, coreY, 40 + 6 * pulse, 'rgba(255, 255, 255, 0.9)', 4, 2, clock * 4);
    } else if (b.phase >= 2 && b.state !== 'die') {
      // Phase 3: the crown burns brighter and rings orbit the core.
      drawVortex(ctx, x, coreY, 150, 0.25, '#d7dce3', 3.2);
      drawGlowSpot(ctx, x, coreY, 4, 60, 0.25);
    } else if (b.phase >= 1 && b.state !== 'die') {
      drawGlowSpot(ctx, x, coreY, 4, 50, 0.18);
    }
  }

  function drawSwing() {}   // kept for the surface's draw call (attacks are drawn by martialArts.js)

  // Boss health bar (screen space), shown while the boss is near / fighting.
  function drawBossBar(ctx, width, playerX, playerY) {
    if (!boss) return;

    const near = Math.hypot(boss.x - playerX, boss.y - playerY) < 900;
    if (!near && !boss.alerted) return;

    const barWidth = Math.min(440, width - 80);
    const x = (width - barWidth) / 2;
    const y = 168;
    const ratio = Math.max(0, boss.hp / BOSS.hp);

    const PHASE_NAMES = ['VOID SOVEREIGN', 'SHATTERED CROWN', 'ECLIPSE'];
    let status = `PHASE ${boss.phase + 1} · ${PHASE_NAMES[boss.phase]}`;
    let statusColor = '#c9ced6';

    if (boss.state === 'eclipseCharge') { status = 'ECLIPSE COLLAPSE · STAND IN THE BRIGHT RING'; statusColor = '#ffffff'; }
    else if (boss.state === 'eclipseBurst') { status = 'ECLIPSE'; statusColor = '#ffffff'; }
    else if (boss.state === 'eclipseRecover') { status = 'CORE EXPOSED · ATTACK NOW (+50%)'; statusColor = '#ffffff'; }
    else if (boss.state === 'phaseShift') { status = 'UNTOUCHABLE · IT CALLS ITS REAVERS'; statusColor = '#ffffff'; }
    else if (boss.state === 'pulse') { status = 'VOID PULSE · GET OUT OF THE CIRCLE'; statusColor = '#ffffff'; }
    else if (boss.state === 'wellCast') { status = 'GRAVITY WELL · MOVE AWAY FROM WHERE YOU STAND'; statusColor = '#ffffff'; }
    else if (boss.state === 'shard') { status = 'SHARD BARRAGE · SIDESTEP'; statusColor = '#ffffff'; }
    else if (boss.state === 'blinkOut' || boss.state === 'blinkIn') { status = 'VOID STEP · CANNOT BE HIT'; statusColor = '#c9ced6'; }

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(x - 10, y - 22, barWidth + 20, 44);
    ctx.strokeStyle = '#6a7079';
    ctx.strokeRect(x - 10, y - 22, barWidth + 20, 44);

    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('NOCTURNUS', x, y - 7);

    ctx.textAlign = 'right';
    ctx.fillStyle = statusColor;
    ctx.font = 'bold 10px monospace';
    ctx.fillText(status, x + barWidth, y - 7);

    ctx.fillStyle = '#15171b';
    ctx.fillRect(x, y, barWidth, 10);
    ctx.fillStyle = boss.state === 'eclipseRecover' ? '#ffffff' : ['#aab1bb', '#d7dce3', '#f4f6f8'][boss.phase];
    ctx.fillRect(x, y, barWidth * ratio, 10);

    // Phase markers at 70% and 35%.
    ctx.fillStyle = '#ffffff';
    for (const mark of BOSS.phaseAt) ctx.fillRect(x + barWidth * mark - 1, y - 2, 2, 14);
    ctx.restore();
  }

  spawnAll();

  return {
    update,
    draw,
    drawSwing,
    drawGlow,
    drawBossBar,
    strike,
    tickRespawns,
    respawn: spawnAll,
    isBossDefeated: () => bossDefeated,
    lair: { x: BOSS.lairX, y: BOSS.lairY },
    save: () => ({ bossDefeated }),
    load(data) {
      bossDefeated = Boolean(data && data.bossDefeated);
      if (bossDefeated) boss = null;
      else if (!boss) boss = createBoss();
    },
    // Read-only debug info ("stalkers" = the regular monsters, same name
    // as on the other worlds so shared code can read all of them).
    list: () => ({
      stalkers: reavers.map(s => ({ x: Math.round(s.x), y: Math.round(s.y), state: s.state, hp: s.hp, alerted: s.alerted })),
      boss: boss ? {
        x: Math.round(boss.x), y: Math.round(boss.y), state: boss.state,
        hp: Math.round(boss.hp * 10) / 10, phase: boss.phase + 1, alerted: boss.alerted
      } : null,
      bossDefeated,
      effects: { rings: rings.length, shards: shards.length, wells: wells.length, waves: waves.length }
    }),

  };
}
