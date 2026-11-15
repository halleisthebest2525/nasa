// ==========================================
// EUROPA MONSTERS
// Frost Skitter (regular):    Idle 4 · Walk 4 · Run 4 · Attack 4 · Hurt 2 · Die 4
// Cryolith Leviathan (boss):  Idle 4 · Move 4 · Ice Slam 4 · Ice Spire 4 · Hurt 2 · Die 6
//
// Effect frames (no monster in them, drawn ON TOP of the monster):
//   skitter attack 4 = ice slash, boss slam 4 = ice burst,
//   boss spire 4 = ice spire (appears under the player, also used for
//   the Ice Prison pillars).
// All frames of one monster share one canvas size and ground line,
// so they never jump or change size. Sprites face RIGHT.
//
// Boss special: ABSOLUTE ZERO · FROZEN DOMINION (see ZERO below).
// The shockwave, frozen ground and glow are drawn by code; the monster
// sprites themselves are never stretched or recoloured.
// ==========================================

const SURFACE_RADIUS = 5600;      // Europa
const SHIP_SAFE_RADIUS = 300;     // nobody chases you next to the ship

// ---------- FROST SKITTER ----------
const SKITTER = {
  count: 12,
  scale: 0.8,            // body is ~52 px wide
  hp: 8,                 // Mars stalker: 6
  walkSpeed: 135,
  runSpeed: 215,         // fast: the player walks 190 and runs 228
  runDistance: 200,
  acceleration: 5,
  sightRange: 600,
  sightHalfAngle: Math.PI / 3,
  noticeRange: 320,
  giveUpRange: 950,
  attackRange: 54,
  hitRange: 72,
  damage: 22,            // Mars stalker: 18
  attackCooldown: 0.8,
  damageFrame: 3,        // the slash frame
  bodyRadius: 22,
  slashOffset: 96,       // slash sits this far in front (sheet pixels)
  respawnDelay: 30,
  minSpawnDistance: 700
};

const SKITTER_ANIMS = {
  idle:   { frames: 4, time: 0.18, loop: true },
  walk:   { frames: 4, time: 0.11, loop: true },
  run:    { frames: 4, time: 0.075, loop: true },
  attack: { frames: 4, time: 0.1, loop: false },
  hurt:   { frames: 2, time: 0.12, loop: false },
  die:    { frames: 4, time: 0.14, loop: false }
};

// ---------- CRYOLITH LEVIATHAN (BOSS) ----------
const BOSS = {
  lairX: 2900,           // guards the top-right of Europa
  lairY: -2700,
  scale: 2.2,            // body ~275 px wide: about 5-6x a Frost Skitter
  hp: 54,                // a bit harder than 42 (was 110 at first)
  // Phase 2 below 60% HP (adds Ice Spires), phase 3 below 30% (faster, double spires).
  phaseAt: [0.6, 0.3],
  moveSpeed: [55, 75, 95],
  aggroRange: 620,
  leashRange: 1300,      // won't follow you farther than this from its lair
  bodyRadius: 110,
  // Ice Slam: a shockwave ring around the boss.
  slam: { range: 185, radius: 215, damage: 13, cooldown: [3.7, 3.1, 2.5] },
  // Ice Spire: crystals erupt where the player WAS standing.
  spire: { minRange: 200, maxRange: 640, radius: 80, damage: 16, cooldown: [0, 5.5, 4] }
};

// ABSOLUTE ZERO · FROZEN DOMINION
const ZERO = {
  cooldown: 20,
  firstUse: 8,           // seconds into the fight before the first one
  chargeTime: 1.5,       // boss stands still, crystals glow, warning circle
  radius: 340,           // shockwave / frozen ground size
  waveTime: 0.45,        // shockwave expands over this long
  damage: 18,
  groundTime: 5,         // frozen ground lasts this long
  slow: 0.35,            // player is 35% slower on frozen ground
  pillarCount: 3,
  pillarDistance: 78,    // pillars stand this far from where the player was
  pillarRadius: 24,      // solid part of a pillar (gaps between them stay open)
  pillarTime: 5,
  recoverTime: 2,        // boss is vulnerable afterwards
  vulnerableMultiplier: 1.5
};

const BOSS_ANIMS = {
  idle:  { frames: 4, time: 0.22, loop: true },
  move:  { frames: 4, time: 0.18, loop: true },
  slam:  { frames: 4, time: 0.16, loop: false },
  spire: { frames: 4, time: 0.22, loop: false },
  hurt:  { frames: 2, time: 0.12, loop: false },
  die:   { frames: 6, time: 0.17, loop: false }
};

const DEATH_FADE = 0.7;

// Player melee (same feel as on the Moon and Mars).
const PLAYER_ATTACK_RANGE = 80;
const PLAYER_ATTACK_ARC = Math.PI / 2.4;
const PLAYER_ATTACK_COOLDOWN = 0.4;
const SWING_TIME = 0.15;

function loadFrames(assets, prefix, anims) {
  const frames = {};

  for (const [name, anim] of Object.entries(anims)) {
    frames[name] = [];
    for (let i = 1; i <= anim.frames; i++) {
      frames[name].push(assets[`${prefix}_${name}_${i}`] || null);
    }
  }

  return frames;
}

const angleDifference = (a, b) => {
  const d = a - b;
  return Math.atan2(Math.sin(d), Math.cos(d));
};

// callbacks = { onBossDefeated(x, y), onBossPhase(phase), onAbsoluteZero() }
export function createEuropaMonsters(assets, callbacks = {}) {
  const skitterFrames = loadFrames(assets, 'europa_skitter', SKITTER_ANIMS);
  const bossFrames = loadFrames(assets, 'europa_boss', BOSS_ANIMS);

  let skitters = [];
  let respawnTimers = [];
  let boss = null;
  let bossDefeated = false;

  // Effects left in the world by the boss.
  let shockwaves = [];   // { x, y, radius, time, duration, damage, hit, cause }
  let frozenGround = []; // { x, y, radius, time }
  let pillars = [];      // { x, y, time }
  let lastPlayer = null; // player position after the previous frame

  let playerCooldown = 0;
  let swingTimer = 0;
  let swingAngle = 0;
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

  function steer(m, tx, ty, dt, rate = SKITTER.acceleration) {
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
        Math.hypot(x - BOSS.lairX, y - BOSS.lairY) >= 700
      ) break;
    }

    return { x, y };
  }

  const bossPhase = b => (b.hp <= BOSS.hp * BOSS.phaseAt[1] ? 2 : b.hp <= BOSS.hp * BOSS.phaseAt[0] ? 1 : 0);


  // ROAMING: a monster that is not chasing anyone walks to a nearby spot,
  // waits a few seconds, then picks another. Returns true while walking.
  function wander(m, dt) {
    m.wanderTimer = (m.wanderTimer ?? Math.random() * 5) - dt;

    if (!m.wanderTarget) {
      if (m.wanderTimer > 0) return false;   // still resting

      const angle = Math.random() * Math.PI * 2;
      const reach = 160 + Math.random() * 260;

      m.wanderTarget = { x: m.x + Math.cos(angle) * reach, y: m.y + Math.sin(angle) * reach };
      m.wanderTimer = 9;                      // gives up if it takes too long
    }

    const dx = m.wanderTarget.x - m.x;
    const dy = m.wanderTarget.y - m.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 24 || m.wanderTimer <= 0) {
      m.wanderTarget = null;
      m.wanderTimer = 2 + Math.random() * 5;  // rest before the next walk
      return false;
    }

    const speed = SKITTER.walkSpeed * 0.55;

    steer(m, dx / distance * speed, dy / distance * speed, dt);

    // Looks where it is going (so its sight cone moves with it).
    m.lookAngle = Math.atan2(dy, dx);
    m.lookTarget = m.lookAngle;
    return true;
  }

  // ---------- spawning ----------
  function createSkitter(x, y) {
    const look = Math.random() * Math.PI * 2;

    return {
      x, y, vx: 0, vy: 0,
      hp: SKITTER.hp,
      state: 'idle',
      frame: Math.floor(Math.random() * 4),
      frameTimer: Math.random() * 0.18,
      facing: Math.cos(look) < 0 ? -1 : 1,
      lookAngle: look,
      lookTarget: look,
      lookTimer: 2 + Math.random() * 3,
      alerted: false,
      cooldown: 0,
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
      facing: 1,
      alerted: false,
      phase: 0,
      slamCooldown: 1.5,
      spireCooldown: 2,
      zeroCooldown: ZERO.firstUse,
      zeroTimer: 0,          // time left in the current Absolute Zero step
      targets: [],           // spire targets [{ x, y }]
      damageDone: false,
      deathDone: false,
      fade: 1
    };
  }

  function spawnAll(playerX = 0, playerY = 0) {
    skitters = [];
    respawnTimers = [];
    shockwaves = [];
    frozenGround = [];
    pillars = [];

    for (let i = 0; i < SKITTER.count; i++) {
      const p = randomPoint(playerX, playerY, SKITTER.minSpawnDistance);
      skitters.push(createSkitter(p.x, p.y));
    }

    boss = bossDefeated ? null : createBoss();
  }

  // 30 s after a kill, a new skitter appears out of the player's view.
  function tickRespawns(dt, player) {
    if (!respawnTimers.length) return;

    respawnTimers = respawnTimers.map(t => t - dt);

    while (respawnTimers.length && respawnTimers[0] <= 0) {
      respawnTimers.shift();
      if (skitters.length >= SKITTER.count) continue;

      const min = Math.max(SKITTER.minSpawnDistance, (player.viewDistance || 0) + 250);
      const p = randomPoint(player.x, player.y, min);
      skitters.push(createSkitter(p.x, p.y));
    }
  }

  // ---------- FROST SKITTER AI ----------
  function updateSkitter(s, dt, player, playerSafe) {
    s.cooldown = Math.max(0, s.cooldown - dt);

    const dx = player.x - s.x;
    const dy = player.y - s.y;
    const distance = Math.hypot(dx, dy) || 0.01;

    if (s.state === 'die') {
      steer(s, 0, 0, dt);
      if (s.deathDone) s.fade = Math.max(0, s.fade - dt / DEATH_FADE);
      else if (animate(s, SKITTER_ANIMS, dt)) s.deathDone = true;
      return;
    }

    if (s.state === 'hurt') {
      steer(s, 0, 0, dt * 0.6);
      if (animate(s, SKITTER_ANIMS, dt)) setState(s, 'idle');
      return;
    }

    if (s.state === 'attack') {
      steer(s, 0, 0, dt);

      // Damage on the slash frame, once per attack.
      if (s.frame === SKITTER.damageFrame && !s.damageDone) {
        s.damageDone = true;
        if (distance <= SKITTER.hitRange) player.damage(SKITTER.damage, 'SLASHED BY A FROST SKITTER');
      }

      if (animate(s, SKITTER_ANIMS, dt)) {
        s.cooldown = SKITTER.attackCooldown;
        setState(s, 'idle');
      }
      return;
    }

    // IDLE / WALK / RUN: spot the player (sight cone, or always when close).
    if (!s.alerted && !playerSafe) {
      const inCone =
        distance <= SKITTER.sightRange &&
        Math.abs(angleDifference(Math.atan2(dy, dx), s.lookAngle)) <= SKITTER.sightHalfAngle;

      if (distance <= SKITTER.noticeRange || inCone) s.alerted = true;
    }

    if (s.alerted && (distance > SKITTER.giveUpRange || playerSafe)) s.alerted = false;

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

    if (s.alerted && distance <= SKITTER.attackRange && s.cooldown <= 0) {
      s.facing = dx < 0 ? -1 : 1;
      setState(s, 'attack');
    } else if (s.alerted && distance > SKITTER.attackRange * 0.8) {
      // Run when far, walk when close (smooth speed change).
      const running = distance > SKITTER.runDistance;
      const speed = running ? SKITTER.runSpeed : SKITTER.walkSpeed;

      steer(s, dx / distance * speed, dy / distance * speed, dt);
      setState(s, running ? 'run' : 'walk');
    } else if (!s.alerted && wander(s, dt)) {
      setState(s, 'walk');
    } else {
      steer(s, 0, 0, dt);
      if (Math.hypot(s.vx, s.vy) < 12) setState(s, 'idle');
    }

    animate(s, SKITTER_ANIMS, dt);
  }

  // ---------- ABSOLUTE ZERO ----------
  function startAbsoluteZero(b) {
    b.state = 'zeroCharge';
    b.frame = 0;
    b.frameTimer = 0;
    b.zeroTimer = ZERO.chargeTime;
    b.vx = 0;
    b.vy = 0;

    if (callbacks.onAbsoluteZero) callbacks.onAbsoluteZero();
  }

  function releaseAbsoluteZero(b, player) {
    // 2. Explosion: a shockwave that expands from the boss.
    shockwaves.push({
      x: b.x, y: b.y,
      radius: ZERO.radius,
      time: 0,
      duration: ZERO.waveTime,
      damage: ZERO.damage,
      hit: false,
      cause: 'FROZEN BY ABSOLUTE ZERO',
      big: true
    });

    // 3. Frozen ground where the shockwave went.
    frozenGround.push({ x: b.x, y: b.y, radius: ZERO.radius, time: ZERO.groundTime });

    // 4. Ice Prison: three pillars AROUND the player (never on top of them),
    //    evenly spaced so there is a gap between every pair.
    const start = Math.random() * Math.PI * 2;

    for (let i = 0; i < ZERO.pillarCount; i++) {
      const angle = start + i * Math.PI * 2 / ZERO.pillarCount;

      pillars.push({
        x: player.x + Math.cos(angle) * ZERO.pillarDistance,
        y: player.y + Math.sin(angle) * ZERO.pillarDistance,
        time: ZERO.pillarTime
      });
    }

    // 5. Recovery: the boss is vulnerable.
    b.state = 'zeroRecover';
    b.frame = 0;
    b.frameTimer = 0;
    b.zeroTimer = ZERO.recoverTime;
  }

  // ---------- CRYOLITH LEVIATHAN AI ----------
  function updateBoss(b, dt, player, playerSafe) {
    const dx = player.x - b.x;
    const dy = player.y - b.y;
    const distance = Math.hypot(dx, dy) || 0.01;
    const phase = b.phase;

    b.slamCooldown = Math.max(0, b.slamCooldown - dt);
    b.spireCooldown = Math.max(0, b.spireCooldown - dt);
    if (b.alerted) b.zeroCooldown = Math.max(0, b.zeroCooldown - dt);

    if (b.state === 'die') {
      steer(b, 0, 0, dt);

      if (b.deathDone) {
        b.fade = Math.max(0, b.fade - dt / DEATH_FADE);
      } else if (animate(b, BOSS_ANIMS, dt)) {
        b.deathDone = true;
        bossDefeated = true;
        if (callbacks.onBossDefeated) callbacks.onBossDefeated(b.x, b.y);
      }
      return;
    }

    if (b.state === 'zeroCharge') {
      // 1. Charging: stands still for 1.5 s (glow + warning circle are drawn).
      b.vx = 0;
      b.vy = 0;
      b.zeroTimer -= dt;
      if (b.zeroTimer <= 0) releaseAbsoluteZero(b, player);
      return;
    }

    if (b.state === 'zeroRecover') {
      b.vx = 0;
      b.vy = 0;
      b.zeroTimer -= dt;

      if (b.zeroTimer <= 0) {
        b.zeroCooldown = ZERO.cooldown;
        b.state = 'zeroRecover';
        setState(b, 'idle');
      }
      return;
    }

    if (b.state === 'hurt') {
      steer(b, 0, 0, dt);
      if (animate(b, BOSS_ANIMS, dt)) setState(b, 'idle');
      return;
    }

    if (b.state === 'slam') {
      steer(b, 0, 0, dt);

      // Frame 4 = the ice burst: an ice shockwave spreads from the boss.
      if (b.frame === 3 && !b.damageDone) {
        b.damageDone = true;
        shockwaves.push({
          x: b.x, y: b.y,
          radius: BOSS.slam.radius,
          time: 0,
          duration: 0.3,
          damage: BOSS.slam.damage,
          hit: false,
          cause: 'CRUSHED BY THE CRYOLITH LEVIATHAN',
          big: false
        });
      }

      if (animate(b, BOSS_ANIMS, dt)) {
        b.slamCooldown = BOSS.slam.cooldown[phase];
        setState(b, 'idle');
      }
      return;
    }

    if (b.state === 'spire') {
      steer(b, 0, 0, dt);

      // Frame 4 = spires burst out where the player WAS (dodge them!).
      if (b.frame === 3 && !b.damageDone) {
        b.damageDone = true;

        if (b.targets.some(t => Math.hypot(player.x - t.x, player.y - t.y) <= BOSS.spire.radius)) {
          player.damage(BOSS.spire.damage, 'IMPALED BY AN ICE SPIRE');
        }
      }

      if (animate(b, BOSS_ANIMS, dt)) {
        b.spireCooldown = BOSS.spire.cooldown[phase];
        b.targets = [];
        setState(b, 'idle');
      }
      return;
    }

    // IDLE / MOVE
    const fromLair = Math.hypot(b.x - BOSS.lairX, b.y - BOSS.lairY);
    const playerFromLair = Math.hypot(player.x - BOSS.lairX, player.y - BOSS.lairY);

    if (!playerSafe && distance <= BOSS.aggroRange) b.alerted = true;
    if (playerFromLair > BOSS.leashRange || playerSafe) b.alerted = false;

    if (b.alerted) {
      if (Math.abs(dx) > 10) b.facing = dx < 0 ? -1 : 1;

      if (b.zeroCooldown <= 0 && distance <= ZERO.radius + 160) {
        startAbsoluteZero(b);
        return;
      }

      if (distance <= BOSS.slam.range && b.slamCooldown <= 0) {
        setState(b, 'slam');
      } else if (
        phase >= 1 &&
        b.spireCooldown <= 0 &&
        distance >= BOSS.spire.minRange &&
        distance <= BOSS.spire.maxRange
      ) {
        b.targets = [{ x: player.x, y: player.y }];

        // Phase 3: a second spire where the player is heading.
        if (phase >= 2 && lastPlayer) {
          const mvx = (player.x - lastPlayer.x) / Math.max(dt, 0.001);
          const mvy = (player.y - lastPlayer.y) / Math.max(dt, 0.001);
          const speed = Math.hypot(mvx, mvy);

          if (speed > 40) {
            b.targets.push({ x: player.x + mvx / speed * 170, y: player.y + mvy / speed * 170 });
          }
        }

        setState(b, 'spire');
      } else if (distance > BOSS.slam.range * 0.75) {
        const speed = BOSS.moveSpeed[phase];
        steer(b, dx / distance * speed, dy / distance * speed, dt, 2.5);
        setState(b, 'move');
      } else {
        steer(b, 0, 0, dt, 2.5);
        if (Math.hypot(b.vx, b.vy) < 10) setState(b, 'idle');
      }
    } else if (fromLair > 30) {
      // Walk back to guard the lair.
      const speed = BOSS.moveSpeed[0];
      steer(b, (BOSS.lairX - b.x) / fromLair * speed, (BOSS.lairY - b.y) / fromLair * speed, dt, 2.5);
      if (Math.abs(b.vx) > 5) b.facing = b.vx < 0 ? -1 : 1;
      setState(b, 'move');
    } else {
      steer(b, 0, 0, dt, 2.5);
      if (Math.hypot(b.vx, b.vy) < 10) setState(b, 'idle');
    }

    if (b.state === 'idle' || b.state === 'move') animate(b, BOSS_ANIMS, dt);
  }

  // ---------- world effects ----------
  function updateEffects(dt, player) {
    // Shockwaves hurt the player once, when the ring reaches them.
    for (const wave of shockwaves) {
      wave.time += dt;

      const front = wave.radius * Math.min(1, wave.time / wave.duration);
      const distance = Math.hypot(player.x - wave.x, player.y - wave.y);

      if (!wave.hit && distance <= front) {
        wave.hit = true;
        player.damage(wave.damage, wave.cause);
      }
    }

    shockwaves = shockwaves.filter(wave => wave.time < wave.duration + 0.35);

    // Frozen ground: the player moves 35% slower on it. This takes back 35%
    // of the distance they moved this frame, so no other system is changed.
    let onIce = false;

    for (const ground of frozenGround) {
      ground.time -= dt;
      if (Math.hypot(player.x - ground.x, player.y - ground.y) <= ground.radius) onIce = true;
    }

    frozenGround = frozenGround.filter(ground => ground.time > 0);

    let px = player.x;
    let py = player.y;

    if (onIce && lastPlayer) {
      const backX = -(px - lastPlayer.x) * ZERO.slow;
      const backY = -(py - lastPlayer.y) * ZERO.slow;

      // Ignore teleports (entering the ship, admin buttons).
      if (Math.hypot(backX, backY) < 12) {
        player.push(backX, backY);
        px += backX;
        py += backY;
      }
    }

    // Ice Prison pillars are solid: push the player out of them.
    for (const pillar of pillars) {
      pillar.time -= dt;

      const dx = px - pillar.x;
      const dy = py - pillar.y;
      const distance = Math.hypot(dx, dy);
      const minimum = ZERO.pillarRadius + 10;

      if (distance > 0.01 && distance < minimum) {
        const push = minimum - distance;
        player.push(dx / distance * push, dy / distance * push);
        px += dx / distance * push;
        py += dy / distance * push;
      }
    }

    pillars = pillars.filter(pillar => pillar.time > 0);

    lastPlayer = { x: px, y: py };
  }

  // player = { x, y, damage(amount, cause), push(dx, dy) }
  function update(dt, player) {
    clock += dt;
    playerCooldown = Math.max(0, playerCooldown - dt);
    swingTimer = Math.max(0, swingTimer - dt);

    const playerSafe = Math.hypot(player.x, player.y) < SHIP_SAFE_RADIUS;

    for (const s of skitters) {
      updateSkitter(s, dt, player, playerSafe);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }

    if (boss) {
      updateBoss(boss, dt, player, playerSafe);
      boss.x += boss.vx * dt;
      boss.y += boss.vy * dt;

      // The boss is solid: push the player out of its body.
      if (boss.state !== 'die') {
        const dx = player.x - boss.x;
        const dy = player.y - boss.y;
        const distance = Math.hypot(dx, dy);
        const minimum = BOSS.bodyRadius * 0.6;

        if (distance > 0.01 && distance < minimum) {
          player.push(dx / distance * (minimum - distance), dy / distance * (minimum - distance));
        }
      }

      if (boss.fade <= 0) boss = null;
    }

    updateEffects(dt, player);

    // Skitters push apart, stay on the surface and out of the ship zone.
    for (let i = 0; i < skitters.length; i++) {
      const a = skitters[i];

      for (let j = i + 1; j < skitters.length; j++) {
        const b = skitters[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);

        if (d > 0.01 && d < SKITTER.bodyRadius * 2) {
          const push = (SKITTER.bodyRadius * 2 - d) / 2;
          a.x -= dx / d * push; a.y -= dy / d * push;
          b.x += dx / d * push; b.y += dy / d * push;
        }
      }

      const r = Math.hypot(a.x, a.y);
      if (r > SURFACE_RADIUS - 60) { a.x *= (SURFACE_RADIUS - 60) / r; a.y *= (SURFACE_RADIUS - 60) / r; }
      if (r < SHIP_SAFE_RADIUS && r > 0.01) { a.x *= SHIP_SAFE_RADIUS / r; a.y *= SHIP_SAFE_RADIUS / r; }
    }

    skitters = skitters.filter(s => s.fade > 0);
  }

  // ---------- player attack ----------
  function hitTest(m, px, py, angle, reach) {
    const dx = m.x - px;
    const dy = m.y - py;
    const distance = Math.hypot(dx, dy);

    if (distance > reach) return false;
    if (distance > 30 + (reach - PLAYER_ATTACK_RANGE) &&
        Math.abs(angleDifference(Math.atan2(dy, dx), angle)) > PLAYER_ATTACK_ARC) return false;

    return { dx, dy, distance };
  }

  function playerAttack(px, py, angle, damage = 1) {
    if (playerCooldown > 0) return false;

    playerCooldown = PLAYER_ATTACK_COOLDOWN;
    swingTimer = SWING_TIME;
    swingAngle = angle;

    for (const s of skitters) {
      if (s.state === 'die') continue;

      const hit = hitTest(s, px, py, angle, PLAYER_ATTACK_RANGE);
      if (!hit) continue;

      s.hp -= damage;
      s.alerted = true;
      s.vx = hit.dx / (hit.distance || 1) * 190;
      s.vy = hit.dy / (hit.distance || 1) * 190;

      if (s.hp <= 0) {
        setState(s, 'die');
        respawnTimers.push(SKITTER.respawnDelay);
      } else {
        s.state = 'idle';
        setState(s, 'hurt');
      }
    }

    if (boss && boss.state !== 'die') {
      // The boss is big: it can be hit from farther away.
      const hit = hitTest(boss, px, py, angle, PLAYER_ATTACK_RANGE + 75);

      if (hit) {
        // Extra damage while it recovers from Absolute Zero.
        boss.hp -= damage * (boss.state === 'zeroRecover' ? ZERO.vulnerableMultiplier : 1);
        boss.alerted = true;
        boss.hitFlash = 0.12;

        const phase = bossPhase(boss);

        if (phase > boss.phase) {
          boss.phase = phase;
          if (callbacks.onBossPhase) callbacks.onBossPhase(phase + 1);
        }

        if (boss.hp <= 0) {
          setState(boss, 'die');
        } else if (boss.state === 'idle' || boss.state === 'move') {
          // Only flinches when not in the middle of an attack.
          boss.state = 'idle';
          setState(boss, 'hurt');
        }
      }
    }

    return true;
  }

  // Generic hit used by the martial-arts system (martialArts.js).
  // arc = half-angle of the attack cone (Math.PI = all around).
  // energy = an energy technique (the boss resists those: 60% damage).
  // hitSet (optional): monsters already hit by this attack are skipped.
  // Returns one entry per monster hit: { x, y, killed, boss }.
  const BOSS_REACH = 75;          // the boss is big: it can be hit from farther away
  const BOSS_ENERGY_RESIST = 0.6;

  function strike({ x, y, angle = 0, range, arc = Math.PI, damage = 1, knockback = 190, energy = false, hitSet = null }) {
    const results = [];
    const inArc = (dx, dy, distance) =>
      arc >= Math.PI || distance <= 30 || Math.abs(angleDifference(Math.atan2(dy, dx), angle)) <= arc;

    for (const s of skitters) {
      if (s.state === 'die') continue;
      if (hitSet && hitSet.has(s)) continue;

      const dx = s.x - x;
      const dy = s.y - y;
      const distance = Math.hypot(dx, dy);

      if (distance > range + SKITTER.bodyRadius * 0.5 || !inArc(dx, dy, distance)) continue;

      if (hitSet) hitSet.add(s);

      s.hp -= damage;
      s.alerted = true;
      s.vx = dx / (distance || 1) * knockback;
      s.vy = dy / (distance || 1) * knockback;

      if (s.hp <= 0) {
        setState(s, 'die');
        respawnTimers.push(SKITTER.respawnDelay);
      } else {
        s.state = 'idle';
        setState(s, 'hurt');
      }

      results.push({ x: s.x, y: s.y, killed: s.hp <= 0, boss: false });
    }

    if (boss && boss.state !== 'die' && !(hitSet && hitSet.has(boss))) {
      const dx = boss.x - x;
      const dy = boss.y - y;
      const distance = Math.hypot(dx, dy);

      if (distance <= range + BOSS_REACH && inArc(dx, dy, Math.max(0, distance - BOSS_REACH))) {
        if (hitSet) hitSet.add(boss);

        let dealt = damage * (energy ? BOSS_ENERGY_RESIST : 1);

        // Extra damage while it recovers from Absolute Zero.
        if (boss.state === 'zeroRecover') dealt *= ZERO.vulnerableMultiplier;

        boss.hp -= dealt;
        boss.alerted = true;

        const phase = bossPhase(boss);

        if (phase > boss.phase) {
          boss.phase = phase;
          if (callbacks.onBossPhase) callbacks.onBossPhase(phase + 1);
        }

        if (boss.hp <= 0) {
          setState(boss, 'die');
        } else if (boss.state === 'idle' || boss.state === 'move') {
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
    ctx.imageSmoothingEnabled = false;
    ctx.scale(facing, 1);
    // Bottom-centre anchor = the ground line shared by all frames.
    ctx.drawImage(image, -w / 2, -h + 6, w, h);
    ctx.restore();
  }

  function drawShadow(ctx, x, y, rx, ry) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y) + 3, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // A chunky pixel-art ring: short blocks placed around a circle.
  function drawPixelRing(ctx, x, y, radius, color, block = 4, gapEvery = 0) {
    if (radius < 2) return;

    const count = Math.max(12, Math.floor(radius * Math.PI * 2 / (block * 1.6)));

    ctx.fillStyle = color;

    for (let i = 0; i < count; i++) {
      if (gapEvery && i % gapEvery === 0) continue;

      const a = i / count * Math.PI * 2;
      ctx.fillRect(
        Math.round((x + Math.cos(a) * radius) / 2) * 2 - block / 2,
        Math.round((y + Math.sin(a) * radius) / 2) * 2 - block / 2,
        block, block
      );
    }
  }

  function drawFrozenGround(ctx, ground, x, y) {
    // Fades in quickly, fades out over the last second.
    const alpha = Math.min(1, ground.time, (ZERO.groundTime - ground.time) * 4);

    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.fillStyle = 'rgba(150, 215, 245, 0.22)';
    ctx.beginPath();
    ctx.arc(x, y, ground.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(205, 240, 255, 0.12)';
    ctx.beginPath();
    ctx.arc(x, y, ground.radius * 0.62, 0, Math.PI * 2);
    ctx.fill();

    // Cracks in the ice (always the same, so they do not flicker).
    ctx.strokeStyle = 'rgba(225, 248, 255, 0.5)';
    ctx.lineWidth = 2;

    for (let i = 0; i < 9; i++) {
      const a = i * 0.698 + 0.3;
      const bend = a + (i % 2 ? 0.22 : -0.2);

      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * ground.radius * 0.18, y + Math.sin(a) * ground.radius * 0.18);
      ctx.lineTo(x + Math.cos(bend) * ground.radius * 0.55, y + Math.sin(bend) * ground.radius * 0.55);
      ctx.lineTo(x + Math.cos(a) * ground.radius * 0.92, y + Math.sin(a) * ground.radius * 0.92);
      ctx.stroke();
    }

    // Sparkles.
    ctx.fillStyle = '#eafaff';

    for (let i = 0; i < 26; i++) {
      if (Math.floor(clock * 3 + i * 1.7) % 4 !== 0) continue;

      const a = i * 2.399;
      const r = ground.radius * (0.15 + (i * 0.618 % 1) * 0.8);
      ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 2, 2);
    }

    drawPixelRing(ctx, x, y, ground.radius, 'rgba(190, 235, 255, 0.75)', 4, 3);
    ctx.restore();
  }

  function drawShockwave(ctx, wave, x, y) {
    const progress = Math.min(1, wave.time / wave.duration);
    const fade = wave.time <= wave.duration ? 1 : Math.max(0, 1 - (wave.time - wave.duration) / 0.35);
    const radius = wave.radius * progress;

    ctx.save();
    ctx.globalAlpha = fade;

    if (wave.big) {
      ctx.fillStyle = `rgba(190, 235, 255, ${0.22 * (1 - progress * 0.6)})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    drawPixelRing(ctx, x, y, radius, '#f2fbff', wave.big ? 8 : 6);
    drawPixelRing(ctx, x, y, radius - (wave.big ? 12 : 9), '#7fd8ff', wave.big ? 6 : 4);
    drawPixelRing(ctx, x, y, radius - (wave.big ? 24 : 17), 'rgba(60, 150, 220, 0.7)', 4, 2);
    ctx.restore();
  }

  function drawPillar(ctx, pillar, x, y) {
    const image = bossFrames.spire[3];
    if (!image || !image.complete || image.naturalWidth === 0) return;

    // Rises out of the ground in 0.3 s, sinks back in the last 0.4 s.
    // The sprite is revealed from the bottom up (clipped), never stretched.
    const age = ZERO.pillarTime - pillar.time;
    const shown = Math.max(0, Math.min(1, age / 0.3, pillar.time / 0.4));
    const scale = 0.5;
    const w = Math.round(image.naturalWidth * scale);
    const h = Math.round(image.naturalHeight * scale);

    drawShadow(ctx, x, y, 26, 7);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath();
    ctx.rect(Math.round(x) - w / 2, Math.round(y) + 8 - h, w, h);
    ctx.clip();
    ctx.drawImage(image, Math.round(x) - w / 2, Math.round(y) + 8 - h * shown, w, h);
    ctx.restore();
  }

  function drawSkitter(ctx, s, x, y) {
    if (s.state !== 'die') drawShadow(ctx, x, y, 24, 6);

    const set = skitterFrames[s.state];

    if (s.state === 'attack' && s.frame === 3) {
      // Frame 4 is the slash: keep the lunging body (frame 3) and add the slash.
      drawFrame(ctx, set[2], x, y, SKITTER.scale, s.facing);
      drawFrame(ctx, set[3], x + s.facing * SKITTER.slashOffset * SKITTER.scale, y, SKITTER.scale, s.facing);
    } else {
      drawFrame(ctx, set[s.frame], x, y, SKITTER.scale, s.facing, s.fade);
    }
  }

  // Warning circle for a spire target.
  function drawSpireWarning(ctx, tx, ty, charge) {
    ctx.save();
    ctx.fillStyle = `rgba(120, 220, 255, ${0.14 * charge})`;
    ctx.beginPath();
    ctx.arc(tx, ty, BOSS.spire.radius, 0, Math.PI * 2);
    ctx.fill();
    drawPixelRing(ctx, tx, ty, BOSS.spire.radius, `rgba(170, 235, 255, ${0.4 + 0.5 * charge})`, 4, 2);
    drawPixelRing(ctx, tx, ty, BOSS.spire.radius * charge, 'rgba(255, 255, 255, 0.8)', 2);
    ctx.restore();
  }

  function drawBoss(ctx, b, x, y, cameraX, cameraY) {
    if (b.state !== 'die') drawShadow(ctx, x, y, 150, 30);

    if (b.state === 'zeroCharge') {
      const charge = 1 - Math.max(0, b.zeroTimer) / ZERO.chargeTime;   // 0 -> 1
      const pulse = 0.5 + 0.5 * Math.sin(clock * 22);

      // Warning circle: the outline shows the full blast size, the fill
      // grows until it reaches the outline (that is when it explodes).
      ctx.save();
      ctx.fillStyle = `rgba(110, 215, 255, ${0.10 + 0.10 * pulse})`;
      ctx.beginPath();
      ctx.arc(x, y, ZERO.radius * charge, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // The boss gathers power: the three "spire" wind-up frames in order.
      const frame = Math.min(2, Math.floor(charge * 3));
      drawFrame(ctx, bossFrames.spire[frame], x, y, BOSS.scale, b.facing);

      // Cyan glow over the crystals (drawn over the sprite, sprite untouched).
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glowY = y - 130;
      const glow = ctx.createRadialGradient(x, glowY, 8, x, glowY, 150 + 30 * pulse);
      glow.addColorStop(0, `rgba(120, 240, 255, ${0.25 + 0.4 * charge})`);
      glow.addColorStop(0.5, `rgba(60, 190, 255, ${0.12 + 0.2 * charge})`);
      glow.addColorStop(1, 'rgba(60, 190, 255, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 190, glowY - 190, 380, 380);

      // Ice motes drawn in towards the boss.
      ctx.fillStyle = '#d8f8ff';
      for (let i = 0; i < 18; i++) {
        const travel = (clock * 0.9 + i * 0.137) % 1;
        const a = i * 2.399;
        const r = ZERO.radius * (1 - travel) * 0.9 + 40;
        ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y - 60 + Math.sin(a) * r * 0.8), 3, 3);
      }
      ctx.restore();
      return;
    }

    if (b.state === 'zeroRecover') {
      // Exhausted: slumped "hurt" pose, dimmed, breathing slowly.
      const frame = Math.floor(clock * 2.5) % 2;
      drawFrame(ctx, bossFrames.hurt[frame], x, y, BOSS.scale, b.facing, 0.82);

      // Cold breath drifting up.
      ctx.save();
      ctx.fillStyle = 'rgba(215, 245, 255, 0.55)';
      for (let i = 0; i < 6; i++) {
        const rise = (clock * 0.6 + i * 0.17) % 1;
        ctx.fillRect(Math.round(x - 50 + i * 20), Math.round(y - 120 - rise * 70), 4, 4);
      }
      ctx.restore();
      return;
    }

    const set = bossFrames[b.state];

    if (b.state === 'slam' && b.frame === 3) {
      // Frame 4 is the ice burst: body stays down, burst in front.
      drawFrame(ctx, set[2], x, y, BOSS.scale, b.facing);
      drawFrame(ctx, set[3], x + b.facing * 40, y + 16, BOSS.scale * 0.8, b.facing);
    } else if (b.state === 'spire') {
      const charge = b.frame === 3 ? 1 : (b.frame + b.frameTimer / BOSS_ANIMS.spire.time) / 3;

      for (const target of b.targets) drawSpireWarning(ctx, cameraX + target.x, cameraY + target.y, charge);

      if (b.frame === 3) {
        drawFrame(ctx, set[2], x, y, BOSS.scale, b.facing);

        for (const target of b.targets) {
          drawFrame(ctx, set[3], cameraX + target.x, cameraY + target.y + 14, BOSS.scale * 0.55, 1);
        }
      } else {
        drawFrame(ctx, set[b.frame], x, y, BOSS.scale, b.facing);
      }
    } else {
      drawFrame(ctx, set[b.frame], x, y, BOSS.scale, b.facing, b.fade);
    }
  }

  function draw(ctx, cameraX, cameraY, width, height) {
    const onScreen = (x, y, margin) =>
      x > -margin && y > -margin && x < width + margin && y < height + margin;

    // Ground effects first (under every monster).
    for (const ground of frozenGround) {
      const x = cameraX + ground.x;
      const y = cameraY + ground.y;
      if (onScreen(x, y, ground.radius)) drawFrozenGround(ctx, ground, x, y);
    }

    // Monsters and pillars from back to front (higher on screen first).
    const all = skitters.map(s => ({ m: s, kind: 'skitter' }));
    if (boss) all.push({ m: boss, kind: 'boss' });
    for (const pillar of pillars) all.push({ m: pillar, kind: 'pillar' });
    all.sort((a, b) => a.m.y - b.m.y);

    for (const { m, kind } of all) {
      const x = cameraX + m.x;
      const y = cameraY + m.y;

      if (!onScreen(x, y, kind === 'boss' ? 520 : 140)) continue;

      if (kind === 'boss') drawBoss(ctx, m, x, y, cameraX, cameraY);
      else if (kind === 'pillar') drawPillar(ctx, m, x, y);
      else drawSkitter(ctx, m, x, y);
    }

  }

  // Drawn AFTER the darkness: warnings and shockwaves glow in the dark,
  // so every boss attack can be seen coming.
  function drawGlow(ctx, cameraX, cameraY, width, height) {
    const onScreen = (x, y, margin) =>
      x > -margin && y > -margin && x < width + margin && y < height + margin;

    for (const ground of frozenGround) {
      const x = cameraX + ground.x;
      const y = cameraY + ground.y;
      if (!onScreen(x, y, ground.radius)) continue;

      ctx.save();
      ctx.globalAlpha = Math.min(1, ground.time) * 0.55;
      drawPixelRing(ctx, x, y, ground.radius, '#bfeaff', 4, 3);
      ctx.restore();
    }

    if (boss && boss.state === 'zeroCharge') {
      const x = cameraX + boss.x;
      const y = cameraY + boss.y;
      const charge = 1 - Math.max(0, boss.zeroTimer) / ZERO.chargeTime;
      const pulse = 0.5 + 0.5 * Math.sin(clock * 22);

      if (onScreen(x, y, ZERO.radius)) {
        drawPixelRing(ctx, x, y, ZERO.radius, `rgba(200, 245, 255, ${0.55 + 0.4 * pulse})`, 6, 2);
        drawPixelRing(ctx, x, y, ZERO.radius * charge, '#ffffff', 4);
      }
    }

    if (boss && boss.state === 'spire' && boss.frame < 3) {
      const charge = (boss.frame + boss.frameTimer / BOSS_ANIMS.spire.time) / 3;

      for (const target of boss.targets) {
        drawPixelRing(ctx, cameraX + target.x, cameraY + target.y, BOSS.spire.radius,
          `rgba(170, 235, 255, ${0.4 + 0.5 * charge})`, 4, 2);
      }
    }

    for (const wave of shockwaves) {
      const x = cameraX + wave.x;
      const y = cameraY + wave.y;
      if (onScreen(x, y, wave.radius)) drawShockwave(ctx, wave, x, y);
    }
  }

  function drawSwing(ctx, centerX, centerY) {
    if (swingTimer <= 0) return;

    const progress = 1 - swingTimer / SWING_TIME;

    ctx.save();
    ctx.globalAlpha = 0.7 * (1 - progress);
    ctx.strokeStyle = '#e8ecdc';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(centerX, centerY, PLAYER_ATTACK_RANGE * 0.6,
      swingAngle - PLAYER_ATTACK_ARC + progress * 0.4,
      swingAngle + PLAYER_ATTACK_ARC * progress);
    ctx.stroke();
    ctx.restore();
  }

  // Boss health bar (screen space), shown while the boss is near / fighting.
  function drawBossBar(ctx, width, playerX, playerY) {
    if (!boss) return;

    const near = Math.hypot(boss.x - playerX, boss.y - playerY) < 850;
    if (!near && !boss.alerted) return;

    const barWidth = Math.min(420, width - 80);
    const x = (width - barWidth) / 2;
    const y = 168;
    const ratio = Math.max(0, boss.hp / BOSS.hp);

    let status = `PHASE ${boss.phase + 1}`;
    let statusColor = '#a9cfe0';

    if (boss.state === 'zeroCharge') { status = 'ABSOLUTE ZERO · GET OUT OF THE CIRCLE'; statusColor = '#ffffff'; }
    else if (boss.state === 'zeroRecover') { status = 'VULNERABLE · ATTACK NOW'; statusColor = '#ffe27a'; }

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(x - 10, y - 22, barWidth + 20, 44);
    ctx.strokeStyle = '#2a6a8a';
    ctx.strokeRect(x - 10, y - 22, barWidth + 20, 44);

    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8fe0ff';
    ctx.fillText('CRYOLITH LEVIATHAN', x, y - 7);

    ctx.textAlign = 'right';
    ctx.fillStyle = statusColor;
    ctx.fillText(status, x + barWidth, y - 7);

    ctx.fillStyle = '#0e222c';
    ctx.fillRect(x, y, barWidth, 10);
    ctx.fillStyle = boss.state === 'zeroRecover' ? '#ffe27a' : ['#5cc4ee', '#3a9be0', '#b06cff'][boss.phase];
    ctx.fillRect(x, y, barWidth * ratio, 10);

    // Phase markers at 60% and 30%.
    ctx.fillStyle = '#e2f6ff';
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
    playerAttack,
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
    // as on Mars so shared code can read both).
    list: () => ({
      stalkers: skitters.map(s => ({ x: Math.round(s.x), y: Math.round(s.y), state: s.state, hp: s.hp, alerted: s.alerted })),
      boss: boss ? {
        x: Math.round(boss.x), y: Math.round(boss.y), state: boss.state,
        hp: Math.round(boss.hp * 10) / 10, phase: boss.phase + 1, alerted: boss.alerted,
        zeroCooldown: Math.round(boss.zeroCooldown * 10) / 10
      } : null,
      bossDefeated,
      effects: { shockwaves: shockwaves.length, frozenGround: frozenGround.length, pillars: pillars.length }
    })
  };
}
