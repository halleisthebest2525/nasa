// ==========================================
// TITAN MONSTERS
// Methane Crawler (regular): Idle 4 · Walk 4 · Run 4 · Attack 4 · Hurt 2 · Die 4
// Nitrogen Wraith (boss):    Idle 4 · Move/Drift 4 · Gas Burst 4 · Cyclone 4 · Hurt 2 · Die 6
//
// The Wraith is a storm, not a walker: it FLOATS (bobs up and down, no
// walking), and fights with gas, vortexes and teleporting.
//
// The sheet has no frames for Vapor Shift or Atmospheric Collapse, so
// those reuse existing frames in a fixed order (never stretched) plus
// effects drawn by code:
//   Vapor Shift (6):          die 4, 5, 6 (dissolve) -> die 6, 5, 4 (reform)
//   Atmospheric Collapse (8): cyclone 1, 2 (charge) -> cyclone 3, 4, 3, 4 (pull)
//                             -> glowing sphere (collapse) -> hurt (recovery)
// Gas clouds, vortex rings, warnings and shockwaves are separate effects,
// never part of the boss sprite. Sprites face RIGHT.
// ==========================================

const SURFACE_RADIUS = 6000;      // Titan
const SHIP_SAFE_RADIUS = 300;     // nobody chases you next to the ship

// ---------- METHANE CRAWLER ----------
const CRAWLER = {
  count: 12,
  scale: 0.8,
  hp: 10,                // Europa skitter: 8
  walkSpeed: 125,
  runSpeed: 200,         // the player walks 190 and runs 228
  runDistance: 210,
  acceleration: 5,
  sightRange: 600,
  sightHalfAngle: Math.PI / 3,
  noticeRange: 320,
  giveUpRange: 950,
  attackRange: 56,
  hitRange: 76,
  damage: 24,
  attackCooldown: 0.9,
  damageFrame: 3,        // the flaming claw frame
  bodyRadius: 24,
  respawnDelay: 30,
  minSpawnDistance: 700,
  // Methane vapor: now and then a chasing crawler leaves a cloud that slows.
  vapor: { everyMin: 6, everyMax: 11, range: 300, radius: 74, time: 4.5, slow: 0.3 }
};

const CRAWLER_ANIMS = {
  idle:   { frames: 4, time: 0.18, loop: true },
  walk:   { frames: 4, time: 0.11, loop: true },
  run:    { frames: 4, time: 0.08, loop: true },
  attack: { frames: 4, time: 0.1, loop: false },
  hurt:   { frames: 2, time: 0.12, loop: false },
  die:    { frames: 4, time: 0.15, loop: false }
};

// ---------- NITROGEN WRAITH (BOSS) ----------
const BOSS = {
  lairX: -3000,          // guards the bottom-left of Titan
  lairY: 2800,
  scale: 2.1,
  hp: 66,                // a bit harder than 52 (was 95 at first)
  // Phase 2 below 65% HP, phase 3 below 30%.
  phaseAt: [0.65, 0.3],
  moveSpeed: [50, 80, 95],
  aggroRange: 620,
  leashRange: 1300,
  arenaRadius: 620,      // Vapor Shift never leaves this circle around the lair
  bodyRadius: 105,
  keepDistance: 230,     // it hovers at range instead of charging in

  // A. Gas Burst: clouds that drift at the player and linger.
  burst: { range: 560, clouds: 3, cooldown: [4.8, 4.0, 3.3], speed: 210, travel: 1.2, radius: 82, time: 5, tick: 0.5, damage: 2 },
  // B. Nitrogen Cyclone: a vortex that pulls the player in.
  cyclone: { warn: 1.2, time: 3, radius: 310, pull: 120, coreRadius: 95, tick: 0.5, damage: 4, cooldown: [0, 11, 9] },
  // C. Vapor Shift: dissolve, vanish, reform somewhere else.
  shift: { out: 0.45, hidden: 0.9, back: 0.45, cooldown: [0, 9, 7], minFromPlayer: 240, maxFromPlayer: 420 }
};

// ATMOSPHERIC COLLAPSE (phase 3 only)
const COLLAPSE = {
  cooldown: 25,
  firstUse: 5,           // seconds after phase 3 starts
  chargeTime: 2,         // stops, spirals inward, core brightens, warning circle
  pullTime: 3,           // vortex pulls the player in (slower than walking)
  pull: 135,
  radius: 390,           // warning circle = blast size
  collapseTime: 0.5,     // the vortex shrinks into a glowing sphere
  waveTime: 0.45,        // then the shockwave expands
  damage: 20,
  recoverTime: 2,
  vulnerableMultiplier: 1.25
};

const BOSS_ANIMS = {
  idle:    { frames: 4, time: 0.2, loop: true },
  move:    { frames: 4, time: 0.17, loop: true },
  burst:   { frames: 4, time: 0.17, loop: false },
  cyclone: { frames: 4, time: 0.2, loop: false },
  hurt:    { frames: 2, time: 0.12, loop: false },
  die:     { frames: 6, time: 0.18, loop: false }
};

const DEATH_FADE = 0.8;

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

// callbacks = { onBossDefeated(x, y), onBossPhase(phase), onCollapse() }
export function createTitanMonsters(assets, callbacks = {}) {
  const crawlerFrames = loadFrames(assets, 'titan_crawler', CRAWLER_ANIMS);
  const bossFrames = loadFrames(assets, 'titan_boss', BOSS_ANIMS);

  let crawlers = [];
  let respawnTimers = [];
  let boss = null;
  let bossDefeated = false;

  // Effects left in the world.
  let gasClouds = [];    // boss gas: { x, y, vx, vy, age, time, radius, seed }
  let vaporClouds = [];  // crawler methane: { x, y, age, time, seed }
  let shockwaves = [];   // { x, y, radius, time, duration, damage, hit }
  let gasTick = 0;       // one damage tick for ALL gas together (no stacking)
  let lastPlayer = null;
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

  function steer(m, tx, ty, dt, rate = CRAWLER.acceleration) {
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
        Math.hypot(x - BOSS.lairX, y - BOSS.lairY) >= 750
      ) break;
    }

    return { x, y };
  }

  const bossPhase = b => (b.hp <= BOSS.hp * BOSS.phaseAt[1] ? 2 : b.hp <= BOSS.hp * BOSS.phaseAt[0] ? 1 : 0);

  // While dissolved (Vapor Shift) the boss cannot be hit and has no body.
  const bossHidden = b => b.state === 'shiftOut' || b.state === 'shiftHidden';

  // ROAMING: a crawler that is not chasing anyone walks to a nearby spot,
  // waits a few seconds, then picks another. Returns true while walking.
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

    const speed = CRAWLER.walkSpeed * 0.55;

    steer(m, dx / distance * speed, dy / distance * speed, dt);
    m.lookAngle = Math.atan2(dy, dx);
    m.lookTarget = m.lookAngle;
    return true;
  }

  // ---------- spawning ----------
  function createCrawler(x, y) {
    const look = Math.random() * Math.PI * 2;

    return {
      x, y, vx: 0, vy: 0,
      hp: CRAWLER.hp,
      state: 'idle',
      frame: Math.floor(Math.random() * 4),
      frameTimer: Math.random() * 0.18,
      facing: Math.cos(look) < 0 ? -1 : 1,
      lookAngle: look,
      lookTarget: look,
      lookTimer: 2 + Math.random() * 3,
      alerted: false,
      cooldown: 0,
      vaporTimer: CRAWLER.vapor.everyMin + Math.random() * (CRAWLER.vapor.everyMax - CRAWLER.vapor.everyMin),
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
      burstCooldown: 2,
      cycloneCooldown: 4,
      shiftCooldown: 6,
      collapseCooldown: COLLAPSE.firstUse,
      timer: 0,              // time left in the current ability step
      tick: 0,               // damage tick inside a vortex core
      shiftTarget: null,     // where it will reform
      damageDone: false,
      deathDone: false,
      fade: 1
    };
  }

  function spawnAll(playerX = 0, playerY = 0) {
    crawlers = [];
    respawnTimers = [];
    gasClouds = [];
    vaporClouds = [];
    shockwaves = [];

    for (let i = 0; i < CRAWLER.count; i++) {
      const p = randomPoint(playerX, playerY, CRAWLER.minSpawnDistance);
      crawlers.push(createCrawler(p.x, p.y));
    }

    boss = bossDefeated ? null : createBoss();
  }

  // CONTINUOUS SPAWNING: 30 s after a kill a new crawler appears out of
  // the player's view, so Titan always has the same number.
  function tickRespawns(dt, player) {
    if (!respawnTimers.length) return;

    respawnTimers = respawnTimers.map(t => t - dt);

    while (respawnTimers.length && respawnTimers[0] <= 0) {
      respawnTimers.shift();
      if (crawlers.length >= CRAWLER.count) continue;

      const min = Math.max(CRAWLER.minSpawnDistance, (player.viewDistance || 0) + 250);
      const p = randomPoint(player.x, player.y, min);
      crawlers.push(createCrawler(p.x, p.y));
    }
  }

  // ---------- METHANE CRAWLER AI ----------
  function updateCrawler(s, dt, player, playerSafe) {
    s.cooldown = Math.max(0, s.cooldown - dt);

    const dx = player.x - s.x;
    const dy = player.y - s.y;
    const distance = Math.hypot(dx, dy) || 0.01;

    if (s.state === 'die') {
      steer(s, 0, 0, dt);
      if (s.deathDone) s.fade = Math.max(0, s.fade - dt / DEATH_FADE);
      else if (animate(s, CRAWLER_ANIMS, dt)) s.deathDone = true;
      return;
    }

    if (s.state === 'hurt') {
      steer(s, 0, 0, dt * 0.6);
      if (animate(s, CRAWLER_ANIMS, dt)) setState(s, 'idle');
      return;
    }

    if (s.state === 'attack') {
      steer(s, 0, 0, dt);

      // Damage on the flaming claw frame, once per attack.
      if (s.frame === CRAWLER.damageFrame && !s.damageDone) {
        s.damageDone = true;
        if (distance <= CRAWLER.hitRange) player.damage(CRAWLER.damage, 'CLAWED BY A METHANE CRAWLER');
      }

      if (animate(s, CRAWLER_ANIMS, dt)) {
        s.cooldown = CRAWLER.attackCooldown;
        setState(s, 'idle');
      }
      return;
    }

    // IDLE / WALK / RUN: spot the player (sight cone, or always when close).
    if (!s.alerted && !playerSafe) {
      const inCone =
        distance <= CRAWLER.sightRange &&
        Math.abs(angleDifference(Math.atan2(dy, dx), s.lookAngle)) <= CRAWLER.sightHalfAngle;

      if (distance <= CRAWLER.noticeRange || inCone) s.alerted = true;
    }

    if (s.alerted && (distance > CRAWLER.giveUpRange || playerSafe)) s.alerted = false;

    if (s.alerted) {
      s.lookAngle = Math.atan2(dy, dx);
      if (Math.abs(dx) > 8) s.facing = dx < 0 ? -1 : 1;

      // METHANE VAPOR: now and then, when close, it leaves a slowing cloud.
      s.vaporTimer -= dt;

      if (s.vaporTimer <= 0 && distance <= CRAWLER.vapor.range && vaporClouds.length < 6) {
        s.vaporTimer = CRAWLER.vapor.everyMin + Math.random() * (CRAWLER.vapor.everyMax - CRAWLER.vapor.everyMin);
        vaporClouds.push({ x: s.x, y: s.y, age: 0, time: CRAWLER.vapor.time, seed: Math.random() * 100 });
      }
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

    if (s.alerted && distance <= CRAWLER.attackRange && s.cooldown <= 0) {
      s.facing = dx < 0 ? -1 : 1;
      setState(s, 'attack');
    } else if (s.alerted && distance > CRAWLER.attackRange * 0.8) {
      const running = distance > CRAWLER.runDistance;
      const speed = running ? CRAWLER.runSpeed : CRAWLER.walkSpeed;

      steer(s, dx / distance * speed, dy / distance * speed, dt);
      setState(s, running ? 'run' : 'walk');
    } else if (!s.alerted && wander(s, dt)) {
      setState(s, 'walk');
    } else {
      steer(s, 0, 0, dt);
      if (Math.hypot(s.vx, s.vy) < 12) setState(s, 'idle');
    }

    animate(s, CRAWLER_ANIMS, dt);
  }

  // ---------- NITROGEN WRAITH: abilities ----------
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

  // A valid place to reform: near the player, inside the arena and the planet.
  function pickShiftTarget(player) {
    for (let tries = 0; tries < 60; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const reach = BOSS.shift.minFromPlayer + Math.random() * (BOSS.shift.maxFromPlayer - BOSS.shift.minFromPlayer);
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
    b.tick = 0;
    b.vx = 0;
    b.vy = 0;
  }

  function updateBoss(b, dt, player, playerSafe) {
    const dx = player.x - b.x;
    const dy = player.y - b.y;
    const distance = Math.hypot(dx, dy) || 0.01;
    const phase = b.phase;

    b.burstCooldown = Math.max(0, b.burstCooldown - dt);
    b.cycloneCooldown = Math.max(0, b.cycloneCooldown - dt);
    b.shiftCooldown = Math.max(0, b.shiftCooldown - dt);
    if (b.alerted && phase >= 2) b.collapseCooldown = Math.max(0, b.collapseCooldown - dt);

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

    if (b.state === 'hurt') {
      steer(b, 0, 0, dt);
      if (animate(b, BOSS_ANIMS, dt)) setState(b, 'idle');
      return;
    }

    // ----- A. GAS BURST -----
    if (b.state === 'burst') {
      steer(b, 0, 0, dt);

      // Frame 2: the clouds leave the boss, fanned out towards the player.
      if (b.frame >= 1 && !b.damageDone) {
        b.damageDone = true;

        const aim = Math.atan2(dy, dx);

        for (let i = 0; i < BOSS.burst.clouds; i++) {
          const angle = aim + (i - (BOSS.burst.clouds - 1) / 2) * 0.34;

          gasClouds.push({
            x: b.x + Math.cos(angle) * 60,
            y: b.y + Math.sin(angle) * 60,
            vx: Math.cos(angle) * BOSS.burst.speed,
            vy: Math.sin(angle) * BOSS.burst.speed,
            age: 0,
            time: BOSS.burst.time,
            radius: BOSS.burst.radius,
            seed: Math.random() * 100
          });
        }
      }

      if (animate(b, BOSS_ANIMS, dt)) {
        b.burstCooldown = BOSS.burst.cooldown[phase];
        setState(b, 'idle');
      }
      return;
    }

    // ----- B. NITROGEN CYCLONE -----
    if (b.state === 'cycloneWarn') {
      b.timer -= dt;
      // Wind-up frames 1 -> 2 while the warning circle shows.
      b.frame = b.timer > BOSS.cyclone.warn / 2 ? 0 : 1;
      if (b.timer <= 0) startStep(b, 'cyclonePull', BOSS.cyclone.time);
      return;
    }

    if (b.state === 'cyclonePull') {
      b.timer -= dt;
      b.frame = 2 + Math.floor(clock / BOSS_ANIMS.cyclone.time) % 2;   // frames 3, 4, 3, 4...

      const d = pullPlayer(player, b.x, b.y, BOSS.cyclone.pull, BOSS.cyclone.radius, dt);

      // Only the centre of the vortex hurts.
      b.tick -= dt;
      if (d <= BOSS.cyclone.coreRadius && b.tick <= 0) {
        b.tick = BOSS.cyclone.tick;
        player.damage(BOSS.cyclone.damage, 'TORN APART BY THE NITROGEN CYCLONE');
      }

      if (b.timer <= 0) {
        b.cycloneCooldown = BOSS.cyclone.cooldown[phase];
        b.state = 'cyclonePull';
        setState(b, 'idle');
      }
      return;
    }

    // ----- C. VAPOR SHIFT -----
    if (b.state === 'shiftOut') {
      b.timer -= dt;
      if (b.timer <= 0) startStep(b, 'shiftHidden', BOSS.shift.hidden);
      return;
    }

    if (b.state === 'shiftHidden') {
      b.timer -= dt;

      if (b.timer <= 0) {
        b.x = b.shiftTarget.x;
        b.y = b.shiftTarget.y;
        b.facing = player.x < b.x ? -1 : 1;
        startStep(b, 'shiftBack', BOSS.shift.back);
      }
      return;
    }

    if (b.state === 'shiftBack') {
      b.timer -= dt;

      if (b.timer <= 0) {
        b.shiftCooldown = BOSS.shift.cooldown[phase];
        b.shiftTarget = null;
        // A short pause before it can attack again.
        b.burstCooldown = Math.max(b.burstCooldown, 0.8);
        b.cycloneCooldown = Math.max(b.cycloneCooldown, 1.5);
        b.state = 'shiftBack';
        setState(b, 'idle');
      }
      return;
    }

    // ----- ATMOSPHERIC COLLAPSE -----
    if (b.state === 'collapseCharge') {
      b.timer -= dt;
      b.frame = b.timer > COLLAPSE.chargeTime / 2 ? 0 : 1;
      if (b.timer <= 0) startStep(b, 'collapsePull', COLLAPSE.pullTime);
      return;
    }

    if (b.state === 'collapsePull') {
      b.timer -= dt;
      b.frame = 2 + Math.floor(clock / 0.16) % 2;

      pullPlayer(player, b.x, b.y, COLLAPSE.pull, COLLAPSE.radius * 1.15, dt);

      if (b.timer <= 0) startStep(b, 'collapseSphere', COLLAPSE.collapseTime);
      return;
    }

    if (b.state === 'collapseSphere') {
      b.timer -= dt;

      if (b.timer <= 0) {
        shockwaves.push({
          x: b.x, y: b.y,
          radius: COLLAPSE.radius,
          time: 0,
          duration: COLLAPSE.waveTime,
          damage: COLLAPSE.damage,
          hit: false
        });

        startStep(b, 'collapseRecover', COLLAPSE.recoverTime);
      }
      return;
    }

    if (b.state === 'collapseRecover') {
      b.timer -= dt;

      if (b.timer <= 0) {
        b.collapseCooldown = COLLAPSE.cooldown;
        b.state = 'collapseRecover';
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

      if (phase >= 2 && b.collapseCooldown <= 0 && distance <= COLLAPSE.radius + 200) {
        startStep(b, 'collapseCharge', COLLAPSE.chargeTime);
        if (callbacks.onCollapse) callbacks.onCollapse();
        return;
      }

      if (phase >= 1 && b.shiftCooldown <= 0) {
        b.shiftTarget = pickShiftTarget(player);
        startStep(b, 'shiftOut', BOSS.shift.out);
        return;
      }

      if (phase >= 1 && b.cycloneCooldown <= 0 && distance <= BOSS.cyclone.radius + 60) {
        startStep(b, 'cycloneWarn', BOSS.cyclone.warn);
        return;
      }

      if (b.burstCooldown <= 0 && distance <= BOSS.burst.range) {
        setState(b, 'burst');
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

    if (b.state === 'idle' || b.state === 'move') animate(b, BOSS_ANIMS, dt);
  }

  // ---------- world effects ----------
  function updateEffects(dt, player) {
    // Shockwave: hurts once, when the ring reaches the player.
    for (const wave of shockwaves) {
      wave.time += dt;

      const front = wave.radius * Math.min(1, wave.time / wave.duration);

      if (!wave.hit && Math.hypot(player.x - wave.x, player.y - wave.y) <= front) {
        wave.hit = true;
        player.damage(wave.damage, 'CRUSHED BY ATMOSPHERIC COLLAPSE');
      }
    }

    shockwaves = shockwaves.filter(wave => wave.time < wave.duration + 0.35);

    // BOSS GAS: drifts, then lingers. Standing in ANY cloud costs health
    // every half second. One tick for all clouds together, so overlapping
    // clouds never hurt more than one.
    let inGas = false;

    for (const cloud of gasClouds) {
      cloud.age += dt;

      if (cloud.age < BOSS.burst.travel) {
        const slow = 1 - cloud.age / BOSS.burst.travel;   // eases to a stop
        cloud.x += cloud.vx * slow * dt;
        cloud.y += cloud.vy * slow * dt;
      }

      // Small while it travels, full size when it settles.
      const size = cloud.radius * Math.min(1, 0.4 + cloud.age / BOSS.burst.travel * 0.6);
      cloud.size = size;

      if (cloud.age > 0.25 && Math.hypot(player.x - cloud.x, player.y - cloud.y) <= size * 0.85) inGas = true;
    }

    gasClouds = gasClouds.filter(cloud => cloud.age < cloud.time);

    gasTick = Math.max(0, gasTick - dt);

    if (inGas && gasTick <= 0) {
      gasTick = BOSS.burst.tick;
      player.damage(BOSS.burst.damage, 'CHOKED BY NITROGEN GAS');
    }

    // METHANE VAPOR: slows the player by 30% while inside. This takes back
    // 30% of the distance they moved this frame, so no other system changes.
    let inVapor = false;

    for (const cloud of vaporClouds) {
      cloud.age += dt;
      if (Math.hypot(player.x - cloud.x, player.y - cloud.y) <= CRAWLER.vapor.radius) inVapor = true;
    }

    vaporClouds = vaporClouds.filter(cloud => cloud.age < cloud.time);

    let px = player.x;
    let py = player.y;

    if (inVapor && lastPlayer) {
      const backX = -(px - lastPlayer.x) * CRAWLER.vapor.slow;
      const backY = -(py - lastPlayer.y) * CRAWLER.vapor.slow;

      // Ignore teleports (entering the ship, admin buttons, flying kick).
      if (Math.hypot(backX, backY) < 4) {
        player.push(backX, backY);
        px += backX;
        py += backY;
      }
    }

    lastPlayer = { x: px, y: py };
  }

  // player = { x, y, damage(amount, cause), push(dx, dy) }
  function update(dt, player) {
    clock += dt;

    const playerSafe = Math.hypot(player.x, player.y) < SHIP_SAFE_RADIUS;

    for (const s of crawlers) {
      updateCrawler(s, dt, player, playerSafe);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }

    if (boss) {
      updateBoss(boss, dt, player, playerSafe);
      boss.x += boss.vx * dt;
      boss.y += boss.vy * dt;

      if (boss.fade <= 0) boss = null;
    }

    updateEffects(dt, player);

    // Crawlers push apart, stay on the surface and out of the ship zone.
    for (let i = 0; i < crawlers.length; i++) {
      const a = crawlers[i];

      for (let j = i + 1; j < crawlers.length; j++) {
        const b = crawlers[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);

        if (d > 0.01 && d < CRAWLER.bodyRadius * 2) {
          const push = (CRAWLER.bodyRadius * 2 - d) / 2;
          a.x -= dx / d * push; a.y -= dy / d * push;
          b.x += dx / d * push; b.y += dy / d * push;
        }
      }

      const r = Math.hypot(a.x, a.y);
      if (r > SURFACE_RADIUS - 60) { a.x *= (SURFACE_RADIUS - 60) / r; a.y *= (SURFACE_RADIUS - 60) / r; }
      if (r < SHIP_SAFE_RADIUS && r > 0.01) { a.x *= SHIP_SAFE_RADIUS / r; a.y *= SHIP_SAFE_RADIUS / r; }
    }

    crawlers = crawlers.filter(s => s.fade > 0);
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

    for (const s of crawlers) {
      if (s.state === 'die') continue;
      if (hitSet && hitSet.has(s)) continue;

      const dx = s.x - x;
      const dy = s.y - y;
      const distance = Math.hypot(dx, dy);

      if (distance > range + CRAWLER.bodyRadius * 0.5 || !inArc(dx, dy, distance)) continue;

      if (hitSet) hitSet.add(s);

      s.hp -= damage;
      s.alerted = true;
      s.vx = dx / (distance || 1) * knockback;
      s.vy = dy / (distance || 1) * knockback;

      if (s.hp <= 0) {
        setState(s, 'die');
        respawnTimers.push(CRAWLER.respawnDelay);
      } else {
        s.state = 'idle';
        setState(s, 'hurt');
      }

      results.push({ x: s.x, y: s.y, killed: s.hp <= 0, boss: false });
    }

    // The boss cannot be hit while it is dissolved into gas (Vapor Shift).
    if (boss && boss.state !== 'die' && !bossHidden(boss) && !(hitSet && hitSet.has(boss))) {
      const dx = boss.x - x;
      const dy = boss.y - y;
      const distance = Math.hypot(dx, dy);

      if (distance <= range + BOSS_REACH && inArc(dx, dy, Math.max(0, distance - BOSS_REACH))) {
        if (hitSet) hitSet.add(boss);

        let dealt = damage * (energy ? BOSS_ENERGY_RESIST : 1);

        // Core exposed after Atmospheric Collapse: 25% more damage.
        if (boss.state === 'collapseRecover') dealt *= COLLAPSE.vulnerableMultiplier;

        boss.hp -= dealt;
        boss.alerted = true;

        const phase = bossPhase(boss);

        if (phase > boss.phase) {
          boss.phase = phase;
          if (callbacks.onBossPhase) callbacks.onBossPhase(phase + 1);
        }

        if (boss.hp <= 0) {
          boss.state = 'idle';
          setState(boss, 'die');
        } else if (boss.state === 'idle' || boss.state === 'move') {
          // Only flinches when not in the middle of an ability.
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

  // A soft, lumpy gas cloud made of a few overlapping puffs. The puffs
  // are placed from the cloud's own seed, so the shape drifts slowly and
  // never flickers.
  function drawCloud(ctx, x, y, radius, seed, colors, alpha) {
    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;

    for (let layer = 0; layer < colors.length; layer++) {
      ctx.fillStyle = colors[layer];

      for (let i = 0; i < 7; i++) {
        const a = seed + i * 0.898 + Math.sin(clock * 0.5 + i + seed) * 0.25;
        const reach = radius * (0.2 + (i * 0.37 + seed * 0.13) % 0.45) * (1 - layer * 0.18);
        const size = radius * (0.5 - layer * 0.12) * (0.75 + (i * 0.29 + seed) % 0.4);

        ctx.beginPath();
        ctx.arc(
          Math.round(x + Math.cos(a) * reach),
          Math.round(y + Math.sin(a) * reach * 0.8),
          Math.max(3, size), 0, Math.PI * 2
        );
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // Fade a ground effect in at the start and out at the end of its life.
  const lifeAlpha = (age, time) => Math.max(0, Math.min(1, age * 3, (time - age) * 1.2));

  // Rotating arcs of gas: the vortex. strength 0..1 makes it denser.
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

  function drawCrawler(ctx, s, x, y) {
    if (s.state !== 'die') drawShadow(ctx, x, y, 26, 7);
    // Attack frame 4 already contains the crawler and its flaming claw.
    drawFrame(ctx, crawlerFrames[s.state][s.frame], x, y, CRAWLER.scale, s.facing, s.fade);
  }

  // The boss floats: it bobs gently and its shadow stays on the ground.
  const hover = () => Math.sin(clock * 2.1) * 9 - 26;

  function drawBoss(ctx, b, x, y) {
    const lift = hover();
    const by = y + lift;

    // Vapor Shift: dissolve (die 4, 5, 6), gone, then reform (die 6, 5, 4).
    if (b.state === 'shiftOut' || b.state === 'shiftBack') {
      const total = b.state === 'shiftOut' ? BOSS.shift.out : BOSS.shift.back;
      const done = 1 - Math.max(0, b.timer) / total;                 // 0 -> 1
      const step = Math.min(2, Math.floor(done * 3));                // 0, 1, 2
      const frame = b.state === 'shiftOut' ? 3 + step : 5 - step;    // 3,4,5 or 5,4,3

      drawShadow(ctx, x, y, 110, 22, 0.2);
      drawFrame(ctx, bossFrames.die[frame], x, by, BOSS.scale, b.facing, 0.9);
      return;
    }

    if (b.state === 'shiftHidden') return;   // nothing there: it is gas

    if (b.state !== 'die') drawShadow(ctx, x, y, 120, 24, 0.3);

    if (b.state === 'cycloneWarn' || b.state === 'cyclonePull' ||
        b.state === 'collapseCharge' || b.state === 'collapsePull') {
      drawFrame(ctx, bossFrames.cyclone[b.frame], x, by, BOSS.scale, b.facing);
      return;
    }

    if (b.state === 'collapseSphere') return;   // drawn as a glowing sphere in drawGlow

    if (b.state === 'collapseRecover') {
      // Exposed and stunned: the two hurt frames, slowly.
      drawFrame(ctx, bossFrames.hurt[Math.floor(clock * 2.5) % 2], x, by, BOSS.scale, b.facing, 0.85);
      return;
    }

    drawFrame(ctx, bossFrames[b.state][b.frame], x, by, BOSS.scale, b.facing, b.fade);
  }

  function draw(ctx, cameraX, cameraY, width, height) {
    const onScreen = (x, y, margin) =>
      x > -margin && y > -margin && x < width + margin && y < height + margin;

    // Ground gas first (under every monster).
    for (const cloud of vaporClouds) {
      const x = cameraX + cloud.x;
      const y = cameraY + cloud.y;
      if (!onScreen(x, y, 120)) continue;

      const grow = Math.min(1, 0.35 + cloud.age * 1.6);
      drawCloud(ctx, x, y, CRAWLER.vapor.radius * grow, cloud.seed,
        ['rgba(120, 130, 70, 0.5)', 'rgba(175, 180, 95, 0.45)', 'rgba(225, 225, 150, 0.35)'],
        lifeAlpha(cloud.age, cloud.time));
    }

    for (const cloud of gasClouds) {
      const x = cameraX + cloud.x;
      const y = cameraY + cloud.y;
      if (!onScreen(x, y, 140)) continue;

      drawCloud(ctx, x, y, cloud.size || cloud.radius * 0.4, cloud.seed,
        ['rgba(70, 45, 130, 0.55)', 'rgba(125, 95, 200, 0.5)', 'rgba(195, 175, 245, 0.4)'],
        lifeAlpha(cloud.age, cloud.time));
    }

    // Monsters from back to front (higher on screen first).
    const all = crawlers.map(s => ({ m: s, isBoss: false }));
    if (boss) all.push({ m: boss, isBoss: true });
    all.sort((a, b) => a.m.y - b.m.y);

    for (const { m, isBoss } of all) {
      const x = cameraX + m.x;
      const y = cameraY + m.y;

      if (!onScreen(x, y, isBoss ? 520 : 160)) continue;

      if (isBoss) drawBoss(ctx, m, x, y);
      else drawCrawler(ctx, m, x, y);
    }
  }

  // Drawn AFTER the darkness: warnings, vortexes and shockwaves glow in
  // the dark, so every boss attack can be seen coming.
  function drawGlow(ctx, cameraX, cameraY, width, height) {
    const onScreen = (x, y, margin) =>
      x > -margin && y > -margin && x < width + margin && y < height + margin;

    // Faint outlines of the gas, so it can be avoided in the dark.
    for (const cloud of gasClouds) {
      const x = cameraX + cloud.x;
      const y = cameraY + cloud.y;
      if (!onScreen(x, y, 140)) continue;

      ctx.save();
      ctx.globalAlpha = lifeAlpha(cloud.age, cloud.time) * 0.6;
      drawPixelRing(ctx, x, y, (cloud.size || 30) * 0.85, '#b9a0ff', 4, 3, cloud.seed);
      ctx.restore();
    }

    for (const wave of shockwaves) {
      const x = cameraX + wave.x;
      const y = cameraY + wave.y;
      if (!onScreen(x, y, wave.radius)) continue;

      const progress = Math.min(1, wave.time / wave.duration);
      const fade = wave.time <= wave.duration ? 1 : Math.max(0, 1 - (wave.time - wave.duration) / 0.35);
      const radius = wave.radius * progress;

      ctx.save();
      ctx.globalAlpha = fade;
      ctx.fillStyle = `rgba(190, 160, 255, ${0.22 * (1 - progress * 0.6)})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      drawPixelRing(ctx, x, y, radius, '#ffffff', 8);
      drawPixelRing(ctx, x, y, radius - 12, '#c9b0ff', 6);
      drawPixelRing(ctx, x, y, radius - 24, 'rgba(120, 80, 220, 0.75)', 4, 2);
      ctx.restore();
    }

    if (!boss) return;

    const b = boss;
    const x = cameraX + b.x;
    const y = cameraY + b.y;

    if (!onScreen(x, y, 620)) return;

    const pulse = 0.5 + 0.5 * Math.sin(clock * 20);

    if (b.state === 'cycloneWarn') {
      // Warning: the circle fills up; when full, the pull starts.
      const charge = 1 - Math.max(0, b.timer) / BOSS.cyclone.warn;

      ctx.save();
      ctx.fillStyle = `rgba(160, 120, 255, ${0.08 + 0.08 * pulse})`;
      ctx.beginPath();
      ctx.arc(x, y, BOSS.cyclone.radius * charge, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      drawPixelRing(ctx, x, y, BOSS.cyclone.radius, `rgba(215, 195, 255, ${0.55 + 0.4 * pulse})`, 6, 2);
      drawPixelRing(ctx, x, y, BOSS.cyclone.radius * charge, '#ffffff', 4);
    } else if (b.state === 'cyclonePull') {
      drawVortex(ctx, x, y, BOSS.cyclone.radius, 0.6, '#b9a0ff');
      drawPixelRing(ctx, x, y, BOSS.cyclone.radius, 'rgba(215, 195, 255, 0.7)', 4, 3, clock * 0.8);
      // The dangerous centre.
      drawPixelRing(ctx, x, y, BOSS.cyclone.coreRadius, `rgba(255, 120, 150, ${0.5 + 0.4 * pulse})`, 4, 2, -clock * 2);
    } else if (b.state === 'shiftOut' || b.state === 'shiftHidden' || b.state === 'shiftBack') {
      // Where it will reappear: a ring that closes in, with rising motes.
      const target = b.state === 'shiftBack' ? { x: b.x, y: b.y } : b.shiftTarget;

      if (target) {
        const tx = cameraX + target.x;
        const ty = cameraY + target.y;
        const total = BOSS.shift.out + BOSS.shift.hidden;
        const left = b.state === 'shiftOut' ? b.timer + BOSS.shift.hidden : b.state === 'shiftHidden' ? b.timer : 0;
        const closing = left / total;   // 1 -> 0

        drawPixelRing(ctx, tx, ty, 60 + closing * 90, `rgba(200, 175, 255, ${0.5 + 0.4 * pulse})`, 4, 2, clock * 3);
        drawPixelRing(ctx, tx, ty, 60, 'rgba(255, 255, 255, 0.75)', 3, 3, -clock * 2);

        ctx.fillStyle = '#d9c8ff';
        for (let i = 0; i < 10; i++) {
          const rise = (clock * 0.9 + i * 0.21) % 1;
          const a = i * 2.399;
          ctx.fillRect(Math.round(tx + Math.cos(a) * 46), Math.round(ty + Math.sin(a) * 30 - rise * 60), 3, 3);
        }
      }
    } else if (b.state === 'collapseCharge' || b.state === 'collapsePull') {
      const charging = b.state === 'collapseCharge';
      const charge = charging ? 1 - Math.max(0, b.timer) / COLLAPSE.chargeTime : 1;

      // Warning circle = the blast size. It fills while charging.
      ctx.save();
      ctx.fillStyle = `rgba(170, 120, 255, ${0.08 + 0.09 * pulse})`;
      ctx.beginPath();
      ctx.arc(x, y, COLLAPSE.radius * charge, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      drawPixelRing(ctx, x, y, COLLAPSE.radius, `rgba(235, 215, 255, ${0.6 + 0.4 * pulse})`, 6, 2);
      if (charging) drawPixelRing(ctx, x, y, COLLAPSE.radius * charge, '#ffffff', 4);

      // Gas spiralling inward, faster and denser as it builds.
      drawVortex(ctx, x, y, COLLAPSE.radius * (charging ? 1 - charge * 0.25 : 0.75), charging ? charge * 0.7 : 1, '#c9b0ff', charging ? 2 + charge * 3 : 5.5);

      // Motes drawn into the core.
      ctx.fillStyle = '#e6dcff';
      for (let i = 0; i < 22; i++) {
        const travel = (clock * (charging ? 0.8 : 1.4) + i * 0.137) % 1;
        const a = i * 2.399 + travel * 2.2;
        const r = COLLAPSE.radius * (1 - travel) * 0.92 + 20;
        ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + hover() - 40 + Math.sin(a) * r * 0.85), 3, 3);
      }

      // The core gets brighter (glow drawn over the sprite, sprite untouched).
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const coreY = y + hover() - 150;
      const glow = ctx.createRadialGradient(x, coreY, 6, x, coreY, 110 + 40 * pulse);
      glow.addColorStop(0, `rgba(240, 225, 255, ${0.3 + 0.5 * charge})`);
      glow.addColorStop(0.5, `rgba(160, 110, 255, ${0.14 + 0.22 * charge})`);
      glow.addColorStop(1, 'rgba(160, 110, 255, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 170, coreY - 170, 340, 340);
      ctx.restore();
    } else if (b.state === 'collapseSphere') {
      // The whole vortex shrinks into one small glowing sphere.
      const done = 1 - Math.max(0, b.timer) / COLLAPSE.collapseTime;   // 0 -> 1
      const ring = COLLAPSE.radius * 0.75 * (1 - done);
      const sy = y + hover() - 110;

      drawPixelRing(ctx, x, y, COLLAPSE.radius, 'rgba(255, 255, 255, 0.9)', 6, 2);
      if (ring > 14) drawVortex(ctx, x, sy, ring, 1, '#e6dcff', 9);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(x, sy, 2, x, sy, 30 + (1 - done) * 90);
      glow.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      glow.addColorStop(0.4, 'rgba(200, 160, 255, 0.6)');
      glow.addColorStop(1, 'rgba(200, 160, 255, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 130, sy - 130, 260, 260);
      ctx.restore();

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(x) - 7, Math.round(sy) - 7, 14, 14);
    } else if (b.state === 'collapseRecover') {
      // Exposed core: a steady glow marks the moment to strike.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const coreY = y + hover() - 150;
      const glow = ctx.createRadialGradient(x, coreY, 4, x, coreY, 70);
      glow.addColorStop(0, `rgba(255, 235, 150, ${0.5 + 0.3 * pulse})`);
      glow.addColorStop(1, 'rgba(255, 235, 150, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 80, coreY - 80, 160, 160);
      ctx.restore();
    } else if (b.phase >= 2 && b.state !== 'die') {
      // Phase 3: more turbulence around the body and a brighter core.
      drawVortex(ctx, x, y + hover() - 110, 150, 0.25, '#b9a0ff', 3.2);
    }
  }

  function drawSwing() {}   // kept for the surface's draw call (attacks are drawn by martialArts.js)

  // Boss health bar (screen space), shown while the boss is near / fighting.
  function drawBossBar(ctx, width, playerX, playerY) {
    if (!boss) return;

    const near = Math.hypot(boss.x - playerX, boss.y - playerY) < 850;
    if (!near && !boss.alerted) return;

    const barWidth = Math.min(440, width - 80);
    const x = (width - barWidth) / 2;
    const y = 168;
    const ratio = Math.max(0, boss.hp / BOSS.hp);

    const PHASE_NAMES = ['ATMOSPHERIC DISTURBANCE', 'CYCLONIC INSTABILITY', 'ATMOSPHERIC COLLAPSE'];
    let status = `PHASE ${boss.phase + 1} · ${PHASE_NAMES[boss.phase]}`;
    let statusColor = '#c9b8ee';

    if (boss.state === 'collapseCharge') { status = 'ATMOSPHERIC COLLAPSE · GET OUT OF THE CIRCLE'; statusColor = '#ffffff'; }
    else if (boss.state === 'collapsePull' || boss.state === 'collapseSphere') { status = 'RUN AWAY FROM THE CENTRE'; statusColor = '#ffffff'; }
    else if (boss.state === 'collapseRecover') { status = 'CORE EXPOSED · ATTACK NOW (+25%)'; statusColor = '#ffe27a'; }
    else if (boss.state === 'cycloneWarn' || boss.state === 'cyclonePull') { status = 'NITROGEN CYCLONE · MOVE AWAY'; statusColor = '#ffffff'; }
    else if (bossHidden(boss) || boss.state === 'shiftBack') { status = 'VAPOR SHIFT · CANNOT BE HIT'; statusColor = '#b9a0ff'; }

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(x - 10, y - 22, barWidth + 20, 44);
    ctx.strokeStyle = '#5a3f9a';
    ctx.strokeRect(x - 10, y - 22, barWidth + 20, 44);

    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#c9b0ff';
    ctx.fillText('NITROGEN WRAITH', x, y - 7);

    ctx.textAlign = 'right';
    ctx.fillStyle = statusColor;
    ctx.font = 'bold 10px monospace';
    ctx.fillText(status, x + barWidth, y - 7);

    ctx.fillStyle = '#1a1230';
    ctx.fillRect(x, y, barWidth, 10);
    ctx.fillStyle = boss.state === 'collapseRecover' ? '#ffe27a' : ['#a98cf0', '#8a62e6', '#e06cff'][boss.phase];
    ctx.fillRect(x, y, barWidth * ratio, 10);

    // Phase markers at 65% and 30%.
    ctx.fillStyle = '#efe6ff';
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
    // as on Mars and Europa so shared code can read all of them).
    list: () => ({
      stalkers: crawlers.map(s => ({ x: Math.round(s.x), y: Math.round(s.y), state: s.state, hp: s.hp, alerted: s.alerted })),
      boss: boss ? {
        x: Math.round(boss.x), y: Math.round(boss.y), state: boss.state,
        hp: Math.round(boss.hp * 10) / 10, phase: boss.phase + 1, alerted: boss.alerted
      } : null,
      bossDefeated,
      effects: { gasClouds: gasClouds.length, vaporClouds: vaporClouds.length, shockwaves: shockwaves.length }
    }),

    // TESTING: set the boss's health (admin / automated tests).
    debugSetBossHp(hp) {
      if (!boss) return;
      boss.hp = hp;
      boss.phase = bossPhase(boss);
    }
  };
}
