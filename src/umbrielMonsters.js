// Umbriel's combat is deliberately isolated from the other planetary enemies.
// All visual effects in this module use only black, gray and white.
export const UMBRIEL = {
  radius: 6400, safeRadius: 300, count: 14,
  reaverHp: 14, reaverDamage: 26, bodyLength: 90,
  lair: { x: 3200, y: 3000 }, arena: 1000,
  bossHp: 110, bossRadius: 120,
  cooldowns: { pulse: 9, shards: 12, mirror: 20, gravity: 18, fracture: 15, eclipse: 35 }
};

export const REAVER_ANIMATIONS = {
  idle: [4, 0.18], move: [4, 0.13], run: [4, 0.09],
  attack: [4, 0.14], hurt: [2, 0.13], die: [4, 0.18]
};
export const NOCTURNUS_ANIMATIONS = {
  idle: [6, 0.18], move: [6, 0.16], pulse: [4, 0.3],
  shards: [4, 0.275], gravity: [6, 0.25], eclipse: [8, 0.75],
  hurt: [2, 0.14], transition: [6, 0.25], die: [8, 0.35]
};

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const phaseFor = hp => hp > UMBRIEL.bossHp * 0.7 ? 1 : hp >= UMBRIEL.bossHp * 0.35 ? 2 : 3;

export function segmentDistance(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(x - ax - dx * t, y - ay - dy * t);
}

// Unequal wedges form an irregular fracture pattern. Dangerous wedges cover
// 43% of the arena before the additional safe central disk and boundary gaps.
export const FRACTURE_ANGLES = [0, 0.62, 1.44, 2.08, 3.1, 3.75, 4.7, 5.5, TAU];
export function inFracture(x, y, field) {
  const r = Math.hypot(x - field.x, y - field.y);
  if (r < 150 || r > 920) return false;
  const angle = ((Math.atan2(y - field.y, x - field.x) - field.rotation) % TAU + TAU) % TAU;
  return FRACTURE_ANGLES.some((start, i) => i % 2 === 0 &&
    angle > start + 0.035 && angle < FRACTURE_ANGLES[i + 1] - 0.035);
}

function limitTo(entity, center, radius) {
  const r = distance(entity, center);
  if (r > radius) {
    entity.x = center.x + (entity.x - center.x) / r * radius;
    entity.y = center.y + (entity.y - center.y) / r * radius;
  }
}

export function createUmbrielMonsters(assets, callbacks = {}) {
  const artReady = [[REAVER_ANIMATIONS, 'umbriel_reaver'], [NOCTURNUS_ANIMATIONS, 'umbriel_boss']]
    .every(([animations, prefix]) => Object.entries(animations).every(([name, [count]]) =>
      Array.from({ length: count }, (_, i) => assets[`${prefix}_${name}_${i + 1}`]).every(Boolean)));
  if (!artReady) console.warn('Umbriel encounter disabled: original monster animation frames are not loaded.');
  const random = callbacks.random || Math.random;
  let clock = 0, reavers = [], respawns = [], bossDefeated = false;
  let boss, rings = [], shards = [], fields = [], particles = [], echoes = [];
  let lastPlayer = null, damageCooldown = 0;

  function setState(m, state) { m.state = state; m.age = 0; m.fired = 0; m.hit = false; }
  const freshBoss = () => ({
    ...UMBRIEL.lair, hp: UMBRIEL.bossHp, state: 'idle', age: 0,
    phase: 1, alerted: false, fired: 0, recovery: 0, hurtAge: 0,
    cooldowns: { pulse: 2, shards: 6, mirror: 4, gravity: 7, fracture: 10, eclipse: 8 }
  });
  function createReaver(x, y) {
    return { x, y, hp: UMBRIEL.reaverHp, state: 'idle', age: 0,
      angle: random() * TAU, vx: 0, vy: 0, alerted: false,
      burrowCd: 4 + random() * 4, dashCd: 2 + random() * 4,
      attackCd: 0, nextSpecial: 'burrow', seed: random() * TAU,
      recover: 0, hit: false, fired: 0 };
  }
  function spawnPoint(px = 0, py = 0, viewDistance = 650) {
    for (let tries = 0; tries < 300; tries++) {
      const angle = random() * TAU;
      const r = Math.sqrt(random()) * (UMBRIEL.radius - 500);
      const p = { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
      if (Math.hypot(p.x, p.y) < 700 || distance(p, UMBRIEL.lair) < UMBRIEL.arena + 150) continue;
      if (Math.hypot(p.x - px, p.y - py) > Math.max(700, viewDistance + 180)) return p;
    }
    return { x: -3400, y: -2800 };
  }
  function clearEffects() { rings = []; shards = []; fields = []; echoes = []; }
  function spawnAll(px = 0, py = 0) {
    reavers = Array.from({ length: UMBRIEL.count }, () => {
      const p = spawnPoint(px, py); return createReaver(p.x, p.y);
    });
    respawns = [];
    // Sleeping refreshes ordinary enemies, never an injured/dead final boss.
    if (!boss && !bossDefeated) boss = freshBoss();
  }
  function dust(x, y, count = 12) {
    for (let i = 0; i < count && particles.length < 160; i++) {
      const a = random() * TAU, speed = 20 + random() * 110;
      particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: 0.5 + random() * 0.6, max: 1.1, shade: i % 2 ? '#A0A0A0' : '#FFFFFF' });
    }
  }
  function damage(player, amount, cause) {
    if (damageCooldown > 0 || Math.hypot(player.x, player.y) < UMBRIEL.safeRadius) return;
    damageCooldown = 0.45;
    player.damage(amount, cause);
  }
  function tickRespawns(dt, view = {}) {
    respawns = respawns.map(t => t - dt);
    while (respawns.some(t => t <= 0)) {
      respawns.splice(respawns.findIndex(t => t <= 0), 1);
      if (reavers.filter(m => m.state !== 'die').length >= UMBRIEL.count) continue;
      const p = spawnPoint(view.x || 0, view.y || 0, view.viewDistance || 650);
      reavers.push(createReaver(p.x, p.y));
    }
  }

  function reaverUpdate(m, dt, player) {
    m.age += dt;
    m.burrowCd -= dt; m.dashCd -= dt; m.attackCd -= dt; m.recover -= dt;
    const d = distance(m, player);
    const bossArena = boss?.alerted && boss.state !== 'die' && distance(m, UMBRIEL.lair) < UMBRIEL.arena + 150;
    if (m.state === 'die') return;
    // Keep the boss encounter readable: regular enemies retreat from its arena.
    if (bossArena) {
      const a = Math.atan2(m.y - UMBRIEL.lair.y, m.x - UMBRIEL.lair.x);
      m.x += Math.cos(a) * 180 * dt; m.y += Math.sin(a) * 180 * dt;
      if (m.state !== 'move') setState(m, 'move');
      m.alerted = false; return;
    }
    if (m.state === 'hurt') {
      m.x += m.vx * dt; m.y += m.vy * dt;
      m.vx *= Math.exp(-8 * dt); m.vy *= Math.exp(-8 * dt);
      if (m.age >= 0.26) { setState(m, 'idle'); m.recover = 0.4; }
      return;
    }
    if (m.state === 'burrowSink') {
      if (m.age >= 0.5) setState(m, 'burrowHidden');
      return;
    }
    if (m.state === 'burrowHidden') {
      const dx = m.target.x - m.x, dy = m.target.y - m.y, r = Math.hypot(dx, dy);
      const step = Math.min(r, dt * 280);
      m.x += dx / (r || 1) * step; m.y += dy / (r || 1) * step;
      if (r < 8 || m.age >= 1.8) setState(m, 'burrowWarn');
      return; // No contact damage while fully underground.
    }
    if (m.state === 'burrowWarn') {
      if (m.age >= 0.9) { dust(m.x, m.y, 12); setState(m, 'attack'); }
      return;
    }
    if (m.state === 'dashWarn') {
      if (m.age >= 0.6) { setState(m, 'dash'); m.dashStart = { x: m.x, y: m.y }; }
      return;
    }
    if (m.state === 'dash') {
      const old = { x: m.x, y: m.y };
      const step = Math.min(0.3, m.age) - Math.min(0.3, Math.max(0, m.age - dt));
      m.x += Math.cos(m.angle) * UMBRIEL.bodyLength * 10 * step;
      m.y += Math.sin(m.angle) * UMBRIEL.bodyLength * 10 * step;
      if (!m.hit && segmentDistance(player.x, player.y, old.x, old.y, m.x, m.y) < 40) {
        m.hit = true; damage(player, 28, 'VOID REAVER — PHANTOM STRIKE');
      }
      if (echoes.length < 40) echoes.push({ x: m.x, y: m.y, angle: m.angle, life: 0.45 });
      if (m.age >= 0.3) { setState(m, 'idle'); m.recover = 0.9; }
      return;
    }
    if (m.state === 'attack') {
      if (!m.hit && m.age >= 0.28) {
        m.hit = true;
        if (d < 88) damage(player, UMBRIEL.reaverDamage, 'VOID REAVER — CLAW ATTACK');
      }
      if (m.age >= 0.56) { setState(m, 'idle'); m.attackCd = 0.9; m.recover = 0.45; }
      return;
    }
    if (Math.hypot(player.x, player.y) < UMBRIEL.safeRadius || d > 1050) m.alerted = false;
    else if (d < 650) m.alerted = true;
    if (m.recover > 0) return;
    if (m.alerted) {
      if (m.nextSpecial === 'burrow' && m.burrowCd <= 0 && d > 120) {
        m.target = { x: player.x, y: player.y };
        m.burrowCd = 8; m.nextSpecial = 'dash'; setState(m, 'burrowSink'); return;
      }
      if (m.nextSpecial === 'dash' && m.dashCd <= 0 && d > 140 && d < 400) {
        m.angle = Math.atan2(player.y - m.y, player.x - m.x);
        m.dashCd = 6; m.nextSpecial = 'burrow'; setState(m, 'dashWarn'); return;
      }
      if (d < 65 && m.attackCd <= 0) { setState(m, 'attack'); return; }
      const toward = Math.atan2(player.y - m.y, player.x - m.x);
      const circle = Math.sin(clock * 0.4 + m.seed) > 0.85 && d < 260;
      const a = toward + Math.sin(clock * 3 + m.seed) * 0.2 + (circle ? 1.1 : 0);
      const speed = d < 180 ? 195 : 155;
      const blend = 1 - Math.exp(-5 * dt);
      m.vx += (Math.cos(a) * speed - m.vx) * blend;
      m.vy += (Math.sin(a) * speed - m.vy) * blend;
      m.x += m.vx * dt; m.y += m.vy * dt; m.angle = Math.atan2(m.vy, m.vx);
      const state = d < 180 ? 'run' : 'move';
      if (m.state !== state) setState(m, state);
    } else {
      const state = Math.sin(clock * 0.4 + m.seed) > 0 ? 'move' : 'idle';
      if (m.state !== state) setState(m, state);
      if (state === 'move') {
        m.angle += Math.sin(clock + m.seed) * 0.5 * dt;
        m.x += Math.cos(m.angle) * 35 * dt; m.y += Math.sin(m.angle) * 35 * dt;
      }
    }
    limitTo(m, { x: 0, y: 0 }, UMBRIEL.radius - 80);
    const r = Math.hypot(m.x, m.y);
    if (r < UMBRIEL.safeRadius && r > 0) {
      m.x *= UMBRIEL.safeRadius / r; m.y *= UMBRIEL.safeRadius / r;
    }
  }

  function makeShard(x, y, angle, white = false) {
    shards.push({ x, y, vx: Math.cos(angle) * 340, vy: Math.sin(angle) * 340,
      age: 0, angle, white, hit: false });
  }
  function fireShards(player) {
    const a = Math.atan2(player.y - boss.y, player.x - boss.x);
    // A fan, never a complete projectile wall; a second wave retains gaps.
    for (let i = -3; i <= 3; i++) {
      const angle = a + i * 0.2;
      makeShard(boss.x + Math.cos(angle) * 145, boss.y + Math.sin(angle) * 145, angle);
    }
  }
  function attackStart(name, player) {
    setState(boss, name);
    const speedup = boss.phase === 3 && name !== 'eclipse' ? 0.85 : 1;
    boss.cooldowns[name] = UMBRIEL.cooldowns[name] * speedup;
    boss.target = { x: player.x, y: player.y };
    if (name === 'gravity') fields.push({ type: 'gravity', ...boss.target, age: 0, radius: 250 });
    if (name === 'fracture') fields.push({ type: 'fracture', ...UMBRIEL.lair, age: 0, rotation: clock % TAU, hit: false });
    if (name === 'eclipse') callbacks.onCollapse?.();
  }
  function recover(seconds) { setState(boss, 'recover'); boss.recovery = seconds; }
  function bossUpdate(dt, player) {
    if (!boss) return;
    const b = boss;
    b.age += dt; b.hurtAge = Math.max(0, b.hurtAge - dt);
    if (b.state === 'die') {
      if (b.age > 0.7 && particles.length < 120) dust(b.x, b.y, 2);
      if (b.age >= 3.8) {
        const { x, y } = b;
        bossDefeated = true; boss = null; clearEffects();
        dust(x, y, 60); callbacks.onBossDefeated?.(x, y);
      }
      return;
    }
    if (b.state === 'transition') {
      if (b.age >= 1.5) { setState(b, 'idle'); b.recovery = 1; }
      return;
    }
    for (const key of Object.keys(b.cooldowns)) b.cooldowns[key] -= dt;
    if (distance(player, UMBRIEL.lair) < 850 && Math.hypot(player.x, player.y) > UMBRIEL.safeRadius) b.alerted = true;
    if (distance(player, UMBRIEL.lair) > 1400) {
      b.alerted = false; clearEffects();
      if (!['idle', 'move', 'hurt', 'recover'].includes(b.state)) setState(b, 'idle');
    }
    if (!b.alerted) {
      b.x += (UMBRIEL.lair.x - b.x) * Math.min(1, dt);
      b.y += (UMBRIEL.lair.y - b.y) * Math.min(1, dt);
      return;
    }
    if (b.state === 'pulse') {
      while (b.fired < 3 && b.age >= 1.2 + b.fired * 0.5) {
        rings.push({ x: b.x, y: b.y, radius: 0, previous: 0, max: 700, speed: 235, hit: false, damage: 12 });
        b.fired++;
      }
      if (b.fired === 3 && rings.length === 0) recover(1.4);
    } else if (b.state === 'shards') {
      const waves = b.phase === 3 ? 2 : 1;
      if (b.fired < waves && b.age >= 1.1 + b.fired * 1.65) { fireShards(player); b.fired++; }
      if (b.fired === waves && shards.length === 0 && b.age > 1.2) recover(1.1);
    } else if (b.state === 'mirror') {
      b.x += Math.cos(clock * 0.5) * 12 * dt;
      b.y += Math.sin(clock * 0.5) * 12 * dt;
      limitTo(b, UMBRIEL.lair, UMBRIEL.arena - 200);
      if (b.age >= 1.5 && !b.fired) {
        makeShard(b.x, b.y, Math.atan2(player.y - b.y, player.x - b.x), true); b.fired = 1;
      }
      if (b.age >= 5 && shards.length === 0) recover(1.2);
    } else if (b.state === 'gravity') {
      if (b.age >= 3.5) recover(1);
    } else if (b.state === 'fracture') {
      if (b.age >= 2.3) recover(1.2);
    } else if (b.state === 'eclipse') {
      if (b.age >= 2 && b.age < 5) {
        const d = distance(player, b);
        if (d < 850 && d > 25) {
          const pull = 70 + (b.age - 2) * 18; // Always weaker than 190-unit walking.
          player.push?.((b.x - player.x) / d * pull * dt, (b.y - player.y) / d * pull * dt);
        }
      }
      if (b.age >= 5 && !b.fired) {
        rings.push({ x: b.x, y: b.y, radius: 0, previous: 0, max: 660, speed: 880, damage: 30, hit: false });
        dust(b.x, b.y, 55); b.fired = 1;
      }
      if (b.age >= 6) { setState(b, 'exposed'); }
    } else if (b.state === 'exposed') {
      if (b.age >= 3) recover(0.7);
    } else if (b.state === 'hurt') {
      if (b.age >= 0.28) recover(0.5);
    } else if (b.state === 'recover') {
      if (b.age >= b.recovery) setState(b, 'idle');
    } else {
      b.recovery = Math.max(0, b.recovery - dt);
      const choices = b.phase === 1 ? ['pulse', 'shards']
        : b.phase === 2 ? ['mirror', 'gravity', 'fracture', 'pulse', 'shards']
          : ['eclipse', 'mirror', 'gravity', 'fracture', 'pulse', 'shards'];
      // The longest-ready ability wins, so frequent pulses cannot starve shards
      // or the longer-cooldown mechanics in later phases.
      const available = choices.filter(name => b.cooldowns[name] <= 0)
        .sort((a, c) => b.cooldowns[a] - b.cooldowns[c])[0];
      // No new pattern starts before the previous hazards have disappeared.
      if (available && !rings.length && !shards.length && !fields.length && b.recovery <= 0) attackStart(available, player);
      else {
        const d = distance(player, b), a = Math.atan2(player.y - b.y, player.x - b.x);
        const speed = [0, 52, 70, 84][b.phase]; // Phase 3 is 20% faster than phase 2.
        const radial = d > 200 ? 1 : d < 155 ? -0.5 : 0;
        b.x += (Math.cos(a) * radial + Math.cos(a + Math.PI / 2) * 0.15) * speed * dt;
        b.y += (Math.sin(a) * radial + Math.sin(a + Math.PI / 2) * 0.15) * speed * dt;
        limitTo(b, UMBRIEL.lair, UMBRIEL.arena - 200);
        const state = radial ? 'move' : 'idle';
        if (b.state !== state) setState(b, state);
      }
    }
    // The solid core never puts the player farther than punch reach.
    const d = distance(player, b);
    if (d < UMBRIEL.bossRadius + 16 && d > 0) {
      const push = UMBRIEL.bossRadius + 16 - d;
      player.push?.((player.x - b.x) / d * push, (player.y - b.y) / d * push);
    }
  }

  function update(dt, player) {
    if (!artReady) return; // Never let invisible monsters damage the player.
    clock += dt; lastPlayer = player; damageCooldown = Math.max(0, damageCooldown - dt);
    for (const m of reavers) {
      reaverUpdate(m, dt, player);
      limitTo(m, { x: 0, y: 0 }, UMBRIEL.radius - 80);
    }
    reavers = reavers.filter(m => m.state !== 'die' || m.age < 1.1);
    // Resolve hazards before advancing the boss scheduler.
    for (const ring of rings) {
      ring.previous = ring.radius; ring.radius += ring.speed * dt;
      const d = distance(player, ring);
      if (!ring.hit && d + 16 >= ring.previous && d - 16 <= Math.min(ring.radius, ring.max)) {
        ring.hit = true; damage(player, ring.damage, 'NOCTURNUS — VOID SHOCKWAVE');
      }
    }
    rings = rings.filter(r => r.radius <= r.max);
    for (const shard of shards) {
      const x = shard.x, y = shard.y;
      shard.x += shard.vx * dt; shard.y += shard.vy * dt; shard.age += dt;
      if (segmentDistance(player.x, player.y, x, y, shard.x, shard.y) < 23) {
        shard.hit = true; damage(player, 14, 'NOCTURNUS — OBSIDIAN JUDGMENT'); dust(shard.x, shard.y, 8);
      }
    }
    shards = shards.filter(s => !s.hit && s.age < 2.8);
    for (const field of fields) {
      field.age += dt;
      if (field.type === 'fracture' && field.age >= 1.5 && !field.hit && inFracture(player.x, player.y, field)) {
        field.hit = true; damage(player, 18, 'NOCTURNUS — SHADOW FRACTURE');
      }
    }
    fields = fields.filter(f => f.age < (f.type === 'gravity' ? 3.5 : 2.3));
    for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    particles = particles.filter(p => p.life > 0);
    for (const echo of echoes) echo.life -= dt;
    echoes = echoes.filter(e => e.life > 0);
    bossUpdate(dt, player);
    // Regulars separate gently, with a bounded population.
    for (let i = 0; i < reavers.length; i++) for (let j = i + 1; j < reavers.length; j++) {
      const a = reavers[i], b = reavers[j], d = distance(a, b);
      if (d > 0 && d < 46 && !a.state.startsWith('burrow') && !b.state.startsWith('burrow')) {
        const push = (46 - d) * 0.5;
        const x = (b.x - a.x) / d * push, y = (b.y - a.y) / d * push;
        a.x -= x; a.y -= y; b.x += x; b.y += y;
      }
    }
  }

  function strike({ x, y, angle = 0, range, arc = Math.PI, damage: amount = 1,
    knockback = 190, energy = false, hitSet = null }) {
    if (!artReady) return [];
    const results = [];
    function canHit(m, reach) {
      const d = Math.hypot(m.x - x, m.y - y);
      return !(hitSet?.has(m)) && d <= range + reach &&
        (arc >= Math.PI || d < 30 || Math.abs(angleDiff(Math.atan2(m.y - y, m.x - x), angle)) <= arc);
    }
    for (const m of reavers) {
      if (m.state === 'die' || ['burrowHidden', 'burrowWarn'].includes(m.state) || !canHit(m, 22)) continue;
      hitSet?.add(m); m.hp -= amount; m.alerted = true;
      const d = Math.hypot(m.x - x, m.y - y) || 1;
      m.vx = (m.x - x) / d * knockback; m.vy = (m.y - y) / d * knockback;
      if (m.hp <= 0) { setState(m, 'die'); respawns.push(30); }
      else setState(m, 'hurt');
      results.push({ x: m.x, y: m.y, killed: m.hp <= 0, boss: false });
    }
    if (boss && !['die', 'transition'].includes(boss.state) && canHit(boss, UMBRIEL.bossRadius)) {
      hitSet?.add(boss);
      boss.hp -= amount * (energy ? 0.6 : 1) * (boss.state === 'exposed' ? 1.3 : boss.state === 'recover' ? 1.1 : 1);
      boss.alerted = true; boss.hurtAge = 0.28;
      if (boss.hp <= 0) { boss.hp = 0; setState(boss, 'die'); clearEffects(); }
      else {
        const phase = phaseFor(boss.hp);
        if (phase > boss.phase) {
          boss.phase = phase; clearEffects(); setState(boss, 'transition');
          callbacks.onBossPhase?.(phase);
        } else if (['idle', 'move'].includes(boss.state)) setState(boss, 'hurt');
      }
      results.push({ x: boss.x, y: boss.y, killed: boss.hp <= 0, boss: true });
    }
    return results;
  }

  const controlMultiplier = (x, y) => fields.some(f => f.type === 'gravity' && f.age >= 1.5 &&
    f.age < 3.5 && Math.hypot(x - f.x, y - f.y) < f.radius) ? -1 : 1;

  // ---------- monochrome pixel rendering ----------
  function ring(ctx, x, y, r, color = '#FFFFFF', size = 3, rotation = 0) {
    ctx.fillStyle = color;
    const count = Math.min(150, Math.max(16, Math.ceil(r * 0.45)));
    for (let i = 0; i < count; i++) {
      const a = rotation + i / count * TAU;
      ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), size, size);
    }
  }
  function sprite(ctx, prefix, animation, age, x, y, size, angle = 0, alpha = 1, silhouette = false) {
    const anims = prefix === 'umbriel_reaver' ? REAVER_ANIMATIONS : NOCTURNUS_ANIMATIONS;
    const [frames, seconds] = anims[animation];
    const loop = ['idle', 'move', 'run'].includes(animation);
    const frame = loop ? Math.floor(age / seconds) % frames : Math.min(frames - 1, Math.floor(age / seconds));
    const image = assets[`${prefix}_${animation}_${frame + 1}`];
    if (!image) return; // Missing supplied art is never replaced with another monster.
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha *= alpha;
    ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(angle);
    if (silhouette) ctx.filter = 'grayscale(1) brightness(0.15)';
    const scale = size / Math.max(image.width || image.naturalWidth, image.height || image.naturalHeight);
    const w = (image.width || image.naturalWidth) * scale, h = (image.height || image.naturalHeight) * scale;
    ctx.drawImage(image, Math.round(-w / 2), Math.round(-h / 2), Math.round(w), Math.round(h));
    ctx.restore();
  }
  function reaverAnimation(m) {
    if (['idle', 'move', 'run', 'attack', 'hurt', 'die'].includes(m.state)) return m.state;
    if (m.state === 'dash') return 'run';
    return 'idle';
  }
  function bossAnimation(b) {
    if (b.state === 'shards' && b.phase === 3 && b.age >= 1.65) return ['shards', b.age - 1.65];
    if (NOCTURNUS_ANIMATIONS[b.state]) return [b.state, b.age];
    if (b.state === 'mirror') return b.age < 1.5 ? ['pulse', b.age * 0.8] : ['move', b.age];
    if (b.state === 'fracture') return ['gravity', b.age];
    if (b.state === 'exposed') return ['eclipse', 5.99];
    return ['idle', b.age];
  }
  function bossSprite(ctx, b, cameraX, cameraY, clone = false) {
    const x = cameraX + b.x, y = cameraY + b.y + Math.sin(clock * 1.6) * 6;
    const [anim, age] = bossAnimation(b);
    const alpha = b.state === 'die' ? clamp((3.8 - b.age) / 1, 0, 1)
      : clone ? Math.min(clamp((b.age - 0.4) / 0.4, 0, 1), clamp((5 - b.age) / 0.7, 0, 1)) : 1;
    sprite(ctx, 'umbriel_boss', anim, age, x, y, 660, 0, alpha, clone);
    if (clone) return;
    ctx.save(); ctx.globalAlpha *= alpha;
    // Floating pieces are separate effects; the character frames keep one scale.
    if (b.state !== 'exposed') for (let i = 0; i < 7; i++) {
      const speed = b.state === 'eclipse' ? 2.3 : b.phase === 3 ? 1.1 : 0.35;
      const a = clock * speed + i / 7 * TAU;
      const death = b.state === 'die' ? clamp(1 - b.age / 3.2, 0, 1) : 1;
      const r = (110 + b.phase * 12) * death;
      const sx = Math.round(x + Math.cos(a) * r), sy = Math.round(y + Math.sin(a) * r * 0.7);
      ctx.fillStyle = '#151515'; ctx.strokeStyle = '#A0A0A0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx, sy - 12); ctx.lineTo(sx + 7, sy);
      ctx.lineTo(sx, sy + 13); ctx.lineTo(sx - 6, sy); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    const blackCore = b.state === 'eclipse' && b.age < 5 || b.phase === 3 && !['exposed', 'mirror'].includes(b.state);
    ctx.fillStyle = blackCore ? '#050505' : '#FFFFFF';
    const pulse = b.state === 'exposed' ? 10 : 3 + Math.max(0, Math.sin(clock * 4)) * 3;
    ctx.fillRect(Math.round(x - pulse / 2), Math.round(y - pulse / 2), pulse, pulse);
    if (b.state === 'exposed') ring(ctx, x, y, 34, '#FFFFFF', 3, clock);
    if (b.state === 'die' && b.age > 2.8) ring(ctx, x, y, (b.age - 2.8) * 220, '#FFFFFF', 3);
    ctx.restore();
  }
  function draw(ctx, cameraX, cameraY, width, height) {
    if (!artReady) return;
    for (const echo of echoes) sprite(ctx, 'umbriel_reaver', 'run', 0, cameraX + echo.x,
      cameraY + echo.y, 200, echo.angle, echo.life / 0.45 * 0.25, true);
    for (const m of reavers) {
      const x = cameraX + m.x, y = cameraY + m.y;
      if (x < -250 || y < -250 || x > width + 250 || y > height + 250) continue;
      if (['burrowHidden', 'burrowWarn'].includes(m.state)) {
        ring(ctx, x, y, 25 + Math.sin(clock * 8) * 4, '#383838', 3); continue;
      }
      const alpha = m.state === 'burrowSink' ? 1 - m.age / 0.5 : m.state === 'die' ? Math.min(1, (1.1 - m.age) / 0.35) : 1;
      if (m.state === 'burrowSink') {
        ctx.fillStyle = '#050505'; ctx.beginPath(); ctx.ellipse(x, y, 38, 15, 0, 0, TAU); ctx.fill();
      }
      sprite(ctx, 'umbriel_reaver', reaverAnimation(m), m.age, x,
        y + (m.state === 'burrowSink' ? m.age * 28 : 0), 200, m.angle, alpha);
    }
    if (boss) {
      if (boss.state === 'mirror' && boss.age >= 0.4 && boss.age < 5) {
        for (let i = 0; i < 3; i++) {
          const a = i / 3 * TAU + clock * 0.1;
          bossSprite(ctx, { ...boss, x: UMBRIEL.lair.x + Math.cos(a) * 420,
            y: UMBRIEL.lair.y + Math.sin(a) * 420 }, cameraX, cameraY, true);
        }
      }
      bossSprite(ctx, boss, cameraX, cameraY);
    }
  }
  function drawGlow(ctx, cameraX, cameraY, width, height) {
    if (!artReady) return;
    ctx.save(); ctx.imageSmoothingEnabled = false;
    if (boss?.state === 'eclipse' && boss.age < 5) {
      // Limit darkness opacity: astronaut and warning rings remain readable.
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.42, boss.age / 2 * 0.42)})`;
      ctx.fillRect(0, 0, width, height);
      const x = cameraX + boss.x, y = cameraY + boss.y;
      ring(ctx, x, y, 660, '#FFFFFF', 4, clock * 0.1);
      ring(ctx, x, y, 850, '#A0A0A0', 3);
      for (let i = 0; i < 32; i++) {
        const t = (clock * 0.55 + i / 32) % 1, a = i * 2.399 + t * 4;
        const r = (1 - t) * 650;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 3, 3);
      }
    }
    if (boss?.state === 'eclipse' && boss.age >= 5 && boss.age < 5.22) {
      ctx.fillStyle = `rgba(255,255,255,${(5.22 - boss.age) * 0.65})`;
      ctx.fillRect(0, 0, width, height);
    }
    for (const m of reavers) {
      const x = cameraX + m.x, y = cameraY + m.y;
      if (m.state === 'burrowWarn') ring(ctx, x, y, 75, '#FFFFFF', 3, clock);
      if (m.state === 'dashWarn') {
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.setLineDash([5, 6]);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(m.angle) * 270, y + Math.sin(m.angle) * 270); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    for (const f of fields) {
      const x = cameraX + f.x, y = cameraY + f.y;
      if (f.type === 'gravity') {
        const active = f.age >= 1.5;
        ring(ctx, x, y, f.radius, active && Math.sin(clock * 9) < 0 ? '#383838' : '#FFFFFF', 4, clock * 0.1);
        ctx.fillStyle = 'rgba(160,160,160,0.08)'; ctx.beginPath(); ctx.arc(x, y, f.radius, 0, TAU); ctx.fill();
        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
        ctx.fillText(active ? 'GRAVITY INVERSION' : 'LEAVE THE GRAVITY FIELD', x, y - f.radius - 15);
      } else {
        const active = f.age >= 1.5;
        for (let i = 0; i < 8; i += 2) {
          const a = FRACTURE_ANGLES[i] + f.rotation, b = FRACTURE_ANGLES[i + 1] + f.rotation;
          ctx.fillStyle = active ? 'rgba(255,255,255,0.32)' : 'rgba(5,5,5,0.45)';
          ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, 150, b, a, true);
          ctx.lineTo(x + Math.cos(a) * 920, y + Math.sin(a) * 920);
          ctx.arc(x, y, 920, a, b); ctx.closePath(); ctx.fill(); ctx.stroke();
          // Jagged white fissures echo the wedge hitboxes, not extra damage.
          ctx.beginPath();
          for (let k = 0; k < 8; k++) {
            const r = 150 + k * 105, t = (a + b) / 2 + Math.sin(k * 4) * 0.05;
            const px = x + Math.cos(t) * r, py = y + Math.sin(t) * r;
            if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      }
    }
    if (boss && ['pulse', 'shards', 'mirror'].includes(boss.state)) {
      const x = cameraX + boss.x, y = cameraY + boss.y;
      if (boss.state === 'pulse' && boss.age < 1.2) ring(ctx, x, y, 700, '#A0A0A0', 2);
      if (boss.state === 'shards') {
        const waveAge = boss.age - boss.fired * 1.65;
        if (waveAge < 1.1 && boss.fired < (boss.phase === 3 ? 2 : 1) && lastPlayer) {
          const a = Math.atan2(lastPlayer.y - boss.y, lastPlayer.x - boss.x);
          ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1; ctx.setLineDash([4, 8]);
          for (let i = -3; i <= 3; i++) {
            const angle = a + i * 0.2;
            ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * 145, y + Math.sin(angle) * 145);
            ctx.lineTo(x + Math.cos(angle) * 950, y + Math.sin(angle) * 950); ctx.stroke();
          }
          ctx.setLineDash([]);
        }
      }
    }
    for (const r of rings) ring(ctx, cameraX + r.x, cameraY + r.y, r.radius, '#FFFFFF', r.damage === 30 ? 6 : 3);
    for (const s of shards) {
      ctx.save(); ctx.translate(Math.round(cameraX + s.x), Math.round(cameraY + s.y)); ctx.rotate(s.angle);
      ctx.fillStyle = s.white ? '#FFFFFF' : '#050505'; ctx.strokeStyle = '#A0A0A0';
      ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-8, -5); ctx.lineTo(-4, 0); ctx.lineTo(-8, 5); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    for (const p of particles) {
      ctx.globalAlpha = Math.min(1, p.life / 0.5); ctx.fillStyle = p.shade;
      ctx.fillRect(Math.round(cameraX + p.x), Math.round(cameraY + p.y), 3, 3);
    }
    ctx.globalAlpha = 1;
    if (lastPlayer && controlMultiplier(lastPlayer.x, lastPlayer.y) < 0) {
      ctx.fillStyle = '#050505'; ctx.fillRect(width / 2 - 180, height - 130, 360, 30);
      ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
      ctx.fillText('GRAVITY INVERTED — DIRECTIONS REVERSED', width / 2, height - 110);
    }
    ctx.restore();
  }
  function drawBossBar(ctx, width, px, py) {
    if (!artReady || !boss || !boss.alerted && Math.hypot(px - boss.x, py - boss.y) > 1000) return;
    const w = Math.min(520, width - 80), x = (width - w) / 2, y = 168;
    const names = ['THE AWAKENING', 'THE FRACTURE', 'THE ETERNAL ECLIPSE'];
    const labels = {
      pulse: 'VOID PULSE — DODGE THE RINGS', shards: 'OBSIDIAN JUDGMENT — FIND A GAP',
      mirror: 'SHADOW MIRROR — LOOK FOR THE WHITE CORE', gravity: 'GRAVITY INVERSION — LEAVE THE FIELD',
      fracture: 'SHADOW FRACTURE — STAND IN UNMARKED GROUND', eclipse: 'ECLIPSE COLLAPSE — REACH THE OUTER RING',
      exposed: 'CORE EXPOSED — ATTACK NOW (+30%)', transition: 'PHASE TRANSITION', die: 'THE VOID SOVEREIGN FALLS'
    };
    ctx.save(); ctx.fillStyle = 'rgba(5,5,5,0.94)'; ctx.fillRect(x - 12, y - 35, w + 24, 68);
    ctx.strokeStyle = '#A0A0A0'; ctx.strokeRect(x - 12, y - 35, w + 24, 68);
    ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
    ctx.fillText('NOCTURNUS — THE VOID SOVEREIGN', width / 2, y - 16);
    ctx.fillStyle = '#383838'; ctx.fillRect(x, y, w, 9);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x, y, w * Math.max(0, boss.hp / UMBRIEL.bossHp), 9);
    ctx.fillStyle = '#A0A0A0';
    for (const fraction of [0.7, 0.35]) ctx.fillRect(x + w * fraction, y - 2, 2, 13);
    ctx.font = 'bold 10px monospace'; ctx.fillStyle = '#FFFFFF';
    ctx.fillText(labels[boss.state] || `PHASE ${boss.phase} — ${names[boss.phase - 1]}`, width / 2, y + 24);
    ctx.restore();
  }
  spawnAll();
  return {
    update, strike, draw, drawGlow, drawBossBar, drawSwing() {}, tickRespawns,
    respawn: spawnAll, controlMultiplier, isReady: () => artReady, lair: { ...UMBRIEL.lair },
    isBossDefeated: () => bossDefeated,
    save: () => ({ bossDefeated, bossHp: boss?.hp ?? 0, phase: boss?.phase ?? 3,
      dying: boss?.state === 'die', deathAge: boss?.state === 'die' ? boss.age : 0 }),
    load(data) {
      clearEffects(); particles = []; damageCooldown = 0;
      bossDefeated = Boolean(data?.bossDefeated);
      boss = bossDefeated ? null : freshBoss();
      if (boss && Number.isFinite(data?.bossHp)) {
        boss.hp = clamp(data.bossHp, 0, UMBRIEL.bossHp); boss.phase = phaseFor(boss.hp);
        if (data.dying || boss.hp === 0) { setState(boss, 'die'); boss.age = clamp(data.deathAge || 0, 0, 3.79); }
      }
    },
    list: () => ({ stalkers: reavers.map(m => ({ x: m.x, y: m.y, state: m.state, hp: m.hp, alerted: m.alerted })),
      boss: boss ? { x: boss.x, y: boss.y, state: boss.state, hp: boss.hp, phase: boss.phase, alerted: boss.alerted, age: boss.age } : null,
      bossDefeated, effects: { rings: rings.length, shards: shards.length, fields: fields.map(f => ({ ...f })),
        particles: particles.length, echoes: echoes.length } }),
    // Same test hook as the other planetary bosses; phase changes use real logic.
    debugSetBossHp(hp) {
      if (!boss || bossDefeated) return;
      boss.hp = clamp(hp, 0, UMBRIEL.bossHp);
      if (boss.hp === 0) { clearEffects(); setState(boss, 'die'); }
      else if (phaseFor(boss.hp) > boss.phase) {
        boss.phase = phaseFor(boss.hp); clearEffects(); setState(boss, 'transition'); callbacks.onBossPhase?.(boss.phase);
      }
    }
  };
}
