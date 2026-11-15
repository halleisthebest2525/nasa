// ==========================================
// MARS MONSTERS
// Dust Stalker (regular): Idle 4 · Walk 4 · Run 4 · Attack 4 · Hurt 2 · Die 4
// Ares Colossus (boss):   Idle 4 · Move 4 · Slam 4 · Eruption 4 · Hurt 2 · Die 6
//
// Effect frames (no monster in them, they are drawn ON TOP of the monster):
//   stalker attack 4 = slash, boss slam 4 = explosion,
//   boss eruption 4  = crystals (appear under the player).
// All frames of one monster share one canvas size and ground line,
// so they never jump or change size. Sprites face RIGHT.
// ==========================================

const SURFACE_RADIUS = 5200;      // Mars
const SHIP_SAFE_RADIUS = 300;     // nobody chases you next to the ship

// ---------- DUST STALKER ----------
const STALKER = {
  count: 10,
  scale: 0.72,           // 111x70 frame -> ~80 px wide
  hp: 6,                 // tougher than the Moon crawler (3)
  walkSpeed: 110,
  runSpeed: 170,         // player walks 190, runs 228
  runDistance: 230,      // runs when farther than this from the player
  acceleration: 4,
  sightRange: 520,
  sightHalfAngle: Math.PI / 3,
  noticeRange: 280,
  giveUpRange: 850,
  attackRange: 56,
  hitRange: 74,
  damage: 18,            // crawler: 12
  attackCooldown: 1.0,
  damageFrame: 3,        // the slash frame
  bodyRadius: 24,
  slashOffset: 102,      // slash sits this far in front (sheet pixels)
  respawnDelay: 30,
  minSpawnDistance: 700
};

const STALKER_ANIMS = {
  idle:   { frames: 4, time: 0.18, loop: true },
  walk:   { frames: 4, time: 0.12, loop: true },
  run:    { frames: 4, time: 0.09, loop: true },
  attack: { frames: 4, time: 0.11, loop: false },
  hurt:   { frames: 2, time: 0.12, loop: false },
  die:    { frames: 4, time: 0.14, loop: false }
};

// ---------- ARES COLOSSUS (BOSS) ----------
const BOSS = {
  lairX: -2800,          // guards the top-left of Mars
  lairY: -2600,
  scale: 1.35,           // 175x113 frame -> ~236 px wide
  hp: 28,                // a bit harder than 22 (was 60 at first)
  phase2At: 0.5,         // below 50% HP: enraged
  moveSpeed: [60, 85],   // phase 1, phase 2
  aggroRange: 520,
  leashRange: 1000,      // won't follow you farther than this from its lair
  bodyRadius: 70,
  slam: { range: 135, radius: 145, damage: 12, cooldown: [3.5, 2.7] },
  eruption: { minRange: 170, maxRange: 540, radius: 75, damage: 15, cooldown: 6 }
};

const BOSS_ANIMS = {
  idle:     { frames: 4, time: 0.22, loop: true },
  move:     { frames: 4, time: 0.18, loop: true },
  slam:     { frames: 4, time: 0.16, loop: false },
  eruption: { frames: 4, time: 0.22, loop: false },
  hurt:     { frames: 2, time: 0.12, loop: false },
  die:      { frames: 6, time: 0.16, loop: false }
};

const DEATH_FADE = 0.7;

// Player melee (same feel as on the Moon).
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

// callbacks = { onBossDefeated(x, y), onBossEnraged() }
export function createMarsMonsters(assets, callbacks = {}) {
  const stalkerFrames = loadFrames(assets, 'mars_stalker', STALKER_ANIMS);
  const bossFrames = loadFrames(assets, 'mars_boss', BOSS_ANIMS);

  let stalkers = [];
  let respawnTimers = [];
  let boss = null;
  let bossDefeated = false;

  let playerCooldown = 0;
  let swingTimer = 0;
  let swingAngle = 0;

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

  function steer(m, tx, ty, dt, rate = STALKER.acceleration) {
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
        Math.hypot(x - BOSS.lairX, y - BOSS.lairY) >= 500
      ) break;
    }

    return { x, y };
  }


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

    const speed = STALKER.walkSpeed * 0.55;

    steer(m, dx / distance * speed, dy / distance * speed, dt);

    // Looks where it is going (so its sight cone moves with it).
    m.lookAngle = Math.atan2(dy, dx);
    m.lookTarget = m.lookAngle;
    return true;
  }

  // ---------- spawning ----------
  function createStalker(x, y) {
    const look = Math.random() * Math.PI * 2;

    return {
      x, y, vx: 0, vy: 0,
      hp: STALKER.hp,
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
      enraged: false,
      slamCooldown: 1,
      eruptionCooldown: 2,
      target: null,          // eruption target { x, y }
      damageDone: false,
      deathDone: false,
      fade: 1
    };
  }

  function spawnAll(playerX = 0, playerY = 0) {
    stalkers = [];
    respawnTimers = [];

    for (let i = 0; i < STALKER.count; i++) {
      const p = randomPoint(playerX, playerY, STALKER.minSpawnDistance);
      stalkers.push(createStalker(p.x, p.y));
    }

    boss = bossDefeated ? null : createBoss();
  }

  // 30 s after a kill, a new stalker appears out of the player's view.
  function tickRespawns(dt, player) {
    if (!respawnTimers.length) return;

    respawnTimers = respawnTimers.map(t => t - dt);

    while (respawnTimers.length && respawnTimers[0] <= 0) {
      respawnTimers.shift();
      if (stalkers.length >= STALKER.count) continue;

      const min = Math.max(STALKER.minSpawnDistance, (player.viewDistance || 0) + 250);
      const p = randomPoint(player.x, player.y, min);
      stalkers.push(createStalker(p.x, p.y));
    }
  }

  // ---------- DUST STALKER AI ----------
  function updateStalker(s, dt, player, playerSafe) {
    s.cooldown = Math.max(0, s.cooldown - dt);

    const dx = player.x - s.x;
    const dy = player.y - s.y;
    const distance = Math.hypot(dx, dy) || 0.01;

    if (s.state === 'die') {
      steer(s, 0, 0, dt);
      if (s.deathDone) s.fade = Math.max(0, s.fade - dt / DEATH_FADE);
      else if (animate(s, STALKER_ANIMS, dt)) s.deathDone = true;
      return;
    }

    if (s.state === 'hurt') {
      steer(s, 0, 0, dt * 0.6);
      if (animate(s, STALKER_ANIMS, dt)) setState(s, 'idle');
      return;
    }

    if (s.state === 'attack') {
      steer(s, 0, 0, dt);

      // Damage on the slash frame, once per attack.
      if (s.frame === STALKER.damageFrame && !s.damageDone) {
        s.damageDone = true;
        if (distance <= STALKER.hitRange) player.damage(STALKER.damage, 'ATTACKED BY A DUST STALKER');
      }

      if (animate(s, STALKER_ANIMS, dt)) {
        s.cooldown = STALKER.attackCooldown;
        setState(s, 'idle');
      }
      return;
    }

    // IDLE / WALK / RUN: spot the player (sight cone, or always when close).
    if (!s.alerted && !playerSafe) {
      const inCone =
        distance <= STALKER.sightRange &&
        Math.abs(angleDifference(Math.atan2(dy, dx), s.lookAngle)) <= STALKER.sightHalfAngle;

      if (distance <= STALKER.noticeRange || inCone) s.alerted = true;
    }

    if (s.alerted && (distance > STALKER.giveUpRange || playerSafe)) s.alerted = false;

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

    if (s.alerted && distance <= STALKER.attackRange && s.cooldown <= 0) {
      s.facing = dx < 0 ? -1 : 1;
      setState(s, 'attack');
    } else if (s.alerted && distance > STALKER.attackRange * 0.8) {
      // Run when far, walk when close (smooth speed change).
      const running = distance > STALKER.runDistance;
      const speed = running ? STALKER.runSpeed : STALKER.walkSpeed;

      steer(s, dx / distance * speed, dy / distance * speed, dt);
      setState(s, running ? 'run' : 'walk');
    } else if (!s.alerted && wander(s, dt)) {
      setState(s, 'walk');
    } else {
      steer(s, 0, 0, dt);
      if (Math.hypot(s.vx, s.vy) < 12) setState(s, 'idle');
    }

    animate(s, STALKER_ANIMS, dt);
  }

  // ---------- ARES COLOSSUS AI ----------
  function updateBoss(b, dt, player, playerSafe) {
    const dx = player.x - b.x;
    const dy = player.y - b.y;
    const distance = Math.hypot(dx, dy) || 0.01;
    const phase = b.enraged ? 1 : 0;

    b.slamCooldown = Math.max(0, b.slamCooldown - dt);
    b.eruptionCooldown = Math.max(0, b.eruptionCooldown - dt);

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

    if (b.state === 'slam') {
      steer(b, 0, 0, dt);

      // Frame 4 = the explosion: damage around the boss.
      if (b.frame === 3 && !b.damageDone) {
        b.damageDone = true;
        if (distance <= BOSS.slam.radius) player.damage(BOSS.slam.damage, 'CRUSHED BY ARES COLOSSUS');
      }

      if (animate(b, BOSS_ANIMS, dt)) {
        b.slamCooldown = BOSS.slam.cooldown[phase];
        setState(b, 'idle');
      }
      return;
    }

    if (b.state === 'eruption') {
      steer(b, 0, 0, dt);

      // Frame 4 = crystals burst out where the player WAS (dodge it!).
      if (b.frame === 3 && !b.damageDone) {
        b.damageDone = true;
        if (Math.hypot(player.x - b.target.x, player.y - b.target.y) <= BOSS.eruption.radius) {
          player.damage(BOSS.eruption.damage, 'IMPALED BY ARES COLOSSUS');
        }
      }

      if (animate(b, BOSS_ANIMS, dt)) {
        b.eruptionCooldown = BOSS.eruption.cooldown;
        b.target = null;
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

      if (distance <= BOSS.slam.range && b.slamCooldown <= 0) {
        setState(b, 'slam');
      } else if (
        b.enraged &&
        b.eruptionCooldown <= 0 &&
        distance >= BOSS.eruption.minRange &&
        distance <= BOSS.eruption.maxRange
      ) {
        b.target = { x: player.x, y: player.y };
        setState(b, 'eruption');
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

  // player = { x, y, damage(amount, cause), push(dx, dy) }
  function update(dt, player) {
    playerCooldown = Math.max(0, playerCooldown - dt);
    swingTimer = Math.max(0, swingTimer - dt);

    const playerSafe = Math.hypot(player.x, player.y) < SHIP_SAFE_RADIUS;

    for (const s of stalkers) {
      updateStalker(s, dt, player, playerSafe);
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

    // Stalkers push apart, stay on the surface and out of the ship zone.
    for (let i = 0; i < stalkers.length; i++) {
      const a = stalkers[i];

      for (let j = i + 1; j < stalkers.length; j++) {
        const b = stalkers[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);

        if (d > 0.01 && d < STALKER.bodyRadius * 2) {
          const push = (STALKER.bodyRadius * 2 - d) / 2;
          a.x -= dx / d * push; a.y -= dy / d * push;
          b.x += dx / d * push; b.y += dy / d * push;
        }
      }

      const r = Math.hypot(a.x, a.y);
      if (r > SURFACE_RADIUS - 60) { a.x *= (SURFACE_RADIUS - 60) / r; a.y *= (SURFACE_RADIUS - 60) / r; }
      if (r < SHIP_SAFE_RADIUS && r > 0.01) { a.x *= SHIP_SAFE_RADIUS / r; a.y *= SHIP_SAFE_RADIUS / r; }
    }

    stalkers = stalkers.filter(s => s.fade > 0);
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

    for (const s of stalkers) {
      if (s.state === 'die') continue;

      const hit = hitTest(s, px, py, angle, PLAYER_ATTACK_RANGE);
      if (!hit) continue;

      s.hp -= damage;
      s.alerted = true;
      s.vx = hit.dx / (hit.distance || 1) * 190;
      s.vy = hit.dy / (hit.distance || 1) * 190;

      if (s.hp <= 0) {
        setState(s, 'die');
        respawnTimers.push(STALKER.respawnDelay);
      } else {
        s.state = 'idle';
        setState(s, 'hurt');
      }
    }

    if (boss && boss.state !== 'die') {
      // The boss is big: it can be hit from farther away.
      const hit = hitTest(boss, px, py, angle, PLAYER_ATTACK_RANGE + 45);

      if (hit) {
        boss.hp -= damage;
        boss.alerted = true;

        if (!boss.enraged && boss.hp <= BOSS.hp * BOSS.phase2At) {
          boss.enraged = true;
          if (callbacks.onBossEnraged) callbacks.onBossEnraged();
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
  const BOSS_REACH = 45;          // the boss is big: it can be hit from farther away
  const BOSS_ENERGY_RESIST = 0.6;

  function strike({ x, y, angle = 0, range, arc = Math.PI, damage = 1, knockback = 190, energy = false, hitSet = null }) {
    const results = [];
    const inArc = (dx, dy, distance) =>
      arc >= Math.PI || distance <= 30 || Math.abs(angleDifference(Math.atan2(dy, dx), angle)) <= arc;

    for (const s of stalkers) {
      if (s.state === 'die') continue;
      if (hitSet && hitSet.has(s)) continue;

      const dx = s.x - x;
      const dy = s.y - y;
      const distance = Math.hypot(dx, dy);

      if (distance > range + STALKER.bodyRadius * 0.5 || !inArc(dx, dy, distance)) continue;

      if (hitSet) hitSet.add(s);

      s.hp -= damage;
      s.alerted = true;
      s.vx = dx / (distance || 1) * knockback;
      s.vy = dy / (distance || 1) * knockback;

      if (s.hp <= 0) {
        setState(s, 'die');
        respawnTimers.push(STALKER.respawnDelay);
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

        boss.hp -= dealt;
        boss.alerted = true;

        if (!boss.enraged && boss.hp <= BOSS.hp * BOSS.phase2At) {
          boss.enraged = true;
          if (callbacks.onBossEnraged) callbacks.onBossEnraged();
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

  function drawStalker(ctx, s, x, y) {
    if (s.state !== 'die') drawShadow(ctx, x, y, 28, 7);

    const set = stalkerFrames[s.state];

    if (s.state === 'attack' && s.frame === 3) {
      // Frame 4 is the slash: keep the lunging body (frame 3) and add the slash.
      drawFrame(ctx, set[2], x, y, STALKER.scale, s.facing);
      drawFrame(ctx, set[3], x + s.facing * STALKER.slashOffset * STALKER.scale, y, STALKER.scale, s.facing);
    } else {
      drawFrame(ctx, set[s.frame], x, y, STALKER.scale, s.facing, s.fade);
    }
  }

  function drawBoss(ctx, b, x, y, cameraX, cameraY) {
    if (b.state !== 'die') drawShadow(ctx, x, y, 95, 20);

    const set = bossFrames[b.state];

    if (b.state === 'slam' && b.frame === 3) {
      // Frame 4 is the explosion: body stays down, explosion in front.
      drawFrame(ctx, set[2], x, y, BOSS.scale, b.facing);
      drawFrame(ctx, set[3], x + b.facing * 25, y + 10, BOSS.scale, b.facing);
    } else if (b.state === 'eruption') {
      // Telegraph: red circle where the crystals will burst.
      if (b.target) {
        const tx = cameraX + b.target.x;
        const ty = cameraY + b.target.y;
        const charge = b.frame === 3 ? 1 : (b.frame + b.frameTimer / BOSS_ANIMS.eruption.time) / 3;

        ctx.save();
        ctx.strokeStyle = `rgba(255, 60, 40, ${0.35 + 0.5 * charge})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(tx, ty, BOSS.eruption.radius, BOSS.eruption.radius * 0.45, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(255, 60, 40, ${0.12 * charge})`;
        ctx.fill();
        ctx.restore();
      }

      if (b.frame === 3) {
        drawFrame(ctx, set[2], x, y, BOSS.scale, b.facing);
        if (b.target) {
          drawFrame(ctx, set[3], cameraX + b.target.x, cameraY + b.target.y + 12, BOSS.scale * 0.8, 1);
        }
      } else {
        drawFrame(ctx, set[b.frame], x, y, BOSS.scale, b.facing);
      }
    } else {
      drawFrame(ctx, set[b.frame], x, y, BOSS.scale, b.facing, b.fade);
    }
  }

  function draw(ctx, cameraX, cameraY, width, height) {
    // Draw from back to front (higher on screen first).
    const all = stalkers.map(s => ({ m: s, boss: false }));
    if (boss) all.push({ m: boss, boss: true });
    all.sort((a, b) => a.m.y - b.m.y);

    for (const { m, boss: isBoss } of all) {
      const x = cameraX + m.x;
      const y = cameraY + m.y;
      const margin = isBoss ? 300 : 120;

      if (x < -margin || y < -margin || x > width + margin || y > height + margin) continue;

      if (isBoss) drawBoss(ctx, m, x, y, cameraX, cameraY);
      else drawStalker(ctx, m, x, y);
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

    const near = Math.hypot(boss.x - playerX, boss.y - playerY) < 750;
    if (!near && !boss.alerted) return;

    const barWidth = Math.min(420, width - 80);
    const x = (width - barWidth) / 2;
    const y = 168;
    const ratio = Math.max(0, boss.hp / BOSS.hp);

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(x - 10, y - 22, barWidth + 20, 44);
    ctx.strokeStyle = '#7a2a22';
    ctx.strokeRect(x - 10, y - 22, barWidth + 20, 44);

    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff7b5c';
    ctx.fillText('ARES COLOSSUS', x, y - 7);

    ctx.textAlign = 'right';
    ctx.fillStyle = boss.enraged ? '#ff3a28' : '#c9a08f';
    ctx.fillText(boss.enraged ? 'PHASE 2 · ENRAGED' : 'PHASE 1', x + barWidth, y - 7);

    ctx.fillStyle = '#2a1512';
    ctx.fillRect(x, y, barWidth, 10);
    ctx.fillStyle = boss.enraged ? '#ff3a28' : '#d0503a';
    ctx.fillRect(x, y, barWidth * ratio, 10);

    // Phase-2 marker at 50%.
    ctx.fillStyle = '#f0c8b0';
    ctx.fillRect(x + barWidth * BOSS.phase2At - 1, y - 2, 2, 14);
    ctx.restore();
  }

  spawnAll();

  return {
    update,
    draw,
    drawSwing,
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
    // Read-only debug info.
    list: () => ({
      stalkers: stalkers.map(s => ({ x: Math.round(s.x), y: Math.round(s.y), state: s.state, hp: s.hp, alerted: s.alerted })),
      boss: boss ? { x: Math.round(boss.x), y: Math.round(boss.y), state: boss.state, hp: Math.round(boss.hp * 10) / 10, enraged: boss.enraged } : null,
      bossDefeated
    })
  };
}
