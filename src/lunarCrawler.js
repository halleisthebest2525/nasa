// ==========================================
// LUNAR CRAWLER: the Moon's regular enemy.
// 18 frames: Idle 4 · Walk 4 · Attack 4 · Hit 2 · Death 4
// Sprites face RIGHT; they are flipped when the crawler faces left.
// ==========================================

const SURFACE_RADIUS = 4800;
const COUNT = 13;                // crawlers on the Moon at once
const MIN_SPAWN_DISTANCE = 700;  // from the ship and the player
const SHIP_SAFE_DISTANCE = 500;  // respawns never appear next to the ship

// Safe zone around the landed ship (the exit door puts you at 230).
// Crawlers stop chasing you here and cannot walk into it.
const SHIP_SAFE_RADIUS = 300;

// After a crawler is killed, a new one appears this many seconds later,
// somewhere the player cannot see (beyond their light).
const RESPAWN_DELAY = 30;
const RESPAWN_MARGIN = 250;      // extra distance beyond the player's view

// One scale for every frame, so the crawler never changes size.
const SPRITE_SCALE = 0.27;

const MAX_HP = 3;
const WALK_SPEED = 95;           // player walks 190, exhausted 85
const ACCELERATION = 4;          // how fast velocity reaches its target
// CRAWLER SENSES (different from the player's view on purpose):
// - SIGHT: a cone in front of the crawler, longer than the player's
//   own view without a flashlight (~170).
// - NEARBY: always notices the player close by, from any direction.
const SIGHT_RANGE = 480;
const SIGHT_HALF_ANGLE = Math.PI / 3;   // 120° cone in total
const NOTICE_RANGE = 260;
const GIVE_UP_RANGE = 800;       // stops chasing beyond this

// Idle crawlers look around (turn their cone) every few seconds.
const LOOK_MIN_TIME = 2;
const LOOK_MAX_TIME = 4.5;
const LOOK_TURN_SPEED = 2;       // radians per second
const ATTACK_RANGE = 52;         // starts an attack
const HIT_RANGE = 68;            // attack still lands within this
const ATTACK_DAMAGE = 12;        // player health
const ATTACK_COOLDOWN = 1.1;
const DAMAGE_FRAME = 2;          // Attack_03: the slash frame
const BODY_RADIUS = 26;          // crawlers push each other apart

// Seconds per frame for each animation.
const ANIMATIONS = {
  idle:   { frames: 4, time: 0.18, loop: true },
  walk:   { frames: 4, time: 0.11, loop: true },
  attack: { frames: 4, time: 0.12, loop: false },
  hit:    { frames: 2, time: 0.12, loop: false },
  death:  { frames: 4, time: 0.14, loop: false }
};

const DEATH_FADE = 0.6; // last death frame fades out, then removed

// PLAYER MELEE ATTACK
const PLAYER_ATTACK_RANGE = 80;
const PLAYER_ATTACK_ARC = Math.PI / 2.4; // each side of facing direction
const PLAYER_ATTACK_COOLDOWN = 0.4;
const SWING_TIME = 0.15;

export function createLunarCrawlers(assets) {
  // Preloaded frames: frames.walk[0] ... frames.walk[3], etc.
  const frames = {};

  for (const [name, animation] of Object.entries(ANIMATIONS)) {
    frames[name] = [];

    for (let i = 1; i <= animation.frames; i++) {
      frames[name].push(assets[`crawler_${name}_${i}`] || null);
    }
  }

  let crawlers = [];
  let playerCooldown = 0;
  let swingTimer = 0;
  let swingAngle = 0;

  // Seconds left until each pending respawn (one entry per kill).
  let respawnTimers = [];

  // Random point on the surface, at least minFromPlayer away from the
  // player and away from the ship (Moon centre).
  function randomSpawnPoint(playerX, playerY, minFromPlayer, minFromShip) {
    let x = 0;
    let y = 0;

    for (let tries = 0; tries < 300; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * SURFACE_RADIUS * 0.85;

      x = Math.cos(angle) * distance;
      y = Math.sin(angle) * distance;

      if (
        Math.hypot(x, y) >= minFromShip &&
        Math.hypot(x - playerX, y - playerY) >= minFromPlayer
      ) break;
    }

    return { x, y };
  }

  function createCrawler(x, y) {
    const lookAngle = Math.random() * Math.PI * 2;

    return {
      x,
      y,
      vx: 0,
      vy: 0,
      hp: MAX_HP,
      state: 'idle',
      frame: Math.floor(Math.random() * 4), // not all in sync
      frameTimer: Math.random() * 0.18,
      facing: Math.cos(lookAngle) < 0 ? -1 : 1,
      lookAngle,                  // where the sight cone points
      lookTarget: lookAngle,
      lookTimer: LOOK_MIN_TIME + Math.random() * LOOK_MAX_TIME,
      alerted: false,             // true while chasing the player
      cooldown: 0,
      damageDone: false,
      deathDone: false,
      fade: 1
    };
  }

  // Fills the Moon with a full group (game start, load, new day).
  function spawnAll(playerX = 0, playerY = 0) {
    crawlers = [];
    respawnTimers = [];

    for (let i = 0; i < COUNT; i++) {
      const point = randomSpawnPoint(playerX, playerY, MIN_SPAWN_DISTANCE, MIN_SPAWN_DISTANCE);
      crawlers.push(createCrawler(point.x, point.y));
    }
  }

  // Counts down respawn timers. Runs in every game mode (not only on the
  // Moon), so "30 seconds later" is real game time.
  // player = { x, y, viewDistance }
  function tickRespawns(dt, player) {
    if (respawnTimers.length === 0) return;

    respawnTimers = respawnTimers.map(time => time - dt);

    while (respawnTimers.length && respawnTimers[0] <= 0) {
      respawnTimers.shift();

      // Never more than COUNT alive (including dying ones).
      if (crawlers.length >= COUNT) continue;

      // Outside the player's view: beyond their light, plus a margin.
      const minDistance = Math.max(
        MIN_SPAWN_DISTANCE,
        (player.viewDistance || 0) + RESPAWN_MARGIN
      );

      const point = randomSpawnPoint(player.x, player.y, minDistance, SHIP_SAFE_DISTANCE);
      crawlers.push(createCrawler(point.x, point.y));
    }
  }

  // Turns an angle smoothly toward a target angle.
  function turnToward(current, target, maxStep) {
    let difference = target - current;
    difference = Math.atan2(Math.sin(difference), Math.cos(difference));

    if (Math.abs(difference) <= maxStep) return target;
    return current + Math.sign(difference) * maxStep;
  }

  // Can this crawler notice the player right now?
  function noticesPlayer(crawler, dx, dy, distance) {
    if (distance <= NOTICE_RANGE) return true;   // close: always
    if (distance > SIGHT_RANGE) return false;

    let difference = Math.atan2(dy, dx) - crawler.lookAngle;
    difference = Math.atan2(Math.sin(difference), Math.cos(difference));

    return Math.abs(difference) <= SIGHT_HALF_ANGLE;   // inside the cone
  }

  function setState(crawler, state) {
    if (crawler.state === state) return;

    crawler.state = state;
    crawler.frame = 0;
    crawler.frameTimer = 0;
    crawler.damageDone = false;
  }

  // Advances the animation. Returns true when a non-looping one finished.
  function animate(crawler, dt) {
    const animation = ANIMATIONS[crawler.state];

    crawler.frameTimer += dt;

    while (crawler.frameTimer >= animation.time) {
      crawler.frameTimer -= animation.time;

      if (crawler.frame < animation.frames - 1) {
        crawler.frame += 1;
      } else if (animation.loop) {
        crawler.frame = 0;
      } else {
        return true;
      }
    }

    return false;
  }

  // Smoothly changes velocity toward (targetVX, targetVY).
  function steer(crawler, targetVX, targetVY, dt) {
    const blend = Math.min(1, ACCELERATION * dt);

    crawler.vx += (targetVX - crawler.vx) * blend;
    crawler.vy += (targetVY - crawler.vy) * blend;
  }

  // player = { x, y, damage(amount) }

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

    const speed = WALK_SPEED * 0.6;

    steer(m, dx / distance * speed, dy / distance * speed, dt);

    // Looks where it is going (so its sight cone moves with it).
    m.lookAngle = Math.atan2(dy, dx);
    m.lookTarget = m.lookAngle;
    return true;
  }

  function update(dt, player) {
    playerCooldown = Math.max(0, playerCooldown - dt);
    swingTimer = Math.max(0, swingTimer - dt);

    for (const crawler of crawlers) {
      crawler.cooldown = Math.max(0, crawler.cooldown - dt);

      const dx = player.x - crawler.x;
      const dy = player.y - crawler.y;
      const distance = Math.hypot(dx, dy);

      if (crawler.state === 'death') {
        steer(crawler, 0, 0, dt);

        // Play all 4 death frames once, then hold the last one and fade out.
        if (crawler.deathDone) {
          crawler.fade = Math.max(0, crawler.fade - dt / DEATH_FADE);
        } else if (animate(crawler, dt)) {
          crawler.deathDone = true;
        }
      } else if (crawler.state === 'hit') {
        // Knockback slows down, then back to fighting.
        steer(crawler, 0, 0, dt * 0.6);

        if (animate(crawler, dt)) setState(crawler, 'idle');
      } else if (crawler.state === 'attack') {
        steer(crawler, 0, 0, dt);

        // Damage happens on the slash frame, only once per attack.
        if (
          crawler.frame === DAMAGE_FRAME &&
          !crawler.damageDone
        ) {
          crawler.damageDone = true;

          if (distance <= HIT_RANGE) {
            player.damage(ATTACK_DAMAGE);
          }
        }

        if (animate(crawler, dt)) {
          crawler.cooldown = ATTACK_COOLDOWN;
          setState(crawler, 'idle');
        }
      } else {
        // IDLE or WALK.

        // Spot the player (sight cone, or always when close).
        if (!crawler.alerted && noticesPlayer(crawler, dx, dy, distance)) {
          crawler.alerted = true;
        }

        // Lose the player when they get far enough away.
        if (crawler.alerted && distance > GIVE_UP_RANGE) {
          crawler.alerted = false;
        }

        if (crawler.alerted) {
          // Keep looking at the player while chasing.
          crawler.lookAngle = Math.atan2(dy, dx);
          crawler.lookTarget = crawler.lookAngle;
        } else {
          // Idle: look around now and then (turns the sight cone).
          crawler.lookTimer -= dt;

          if (crawler.lookTimer <= 0) {
            crawler.lookTarget = crawler.lookAngle + (Math.random() - 0.5) * Math.PI * 1.6;
            crawler.lookTimer = LOOK_MIN_TIME + Math.random() * (LOOK_MAX_TIME - LOOK_MIN_TIME);
          }

          crawler.lookAngle = turnToward(crawler.lookAngle, crawler.lookTarget, LOOK_TURN_SPEED * dt);

          if (Math.abs(Math.cos(crawler.lookAngle)) > 0.2) {
            crawler.facing = Math.cos(crawler.lookAngle) < 0 ? -1 : 1;
          }
        }

        // Near the ship is a safe zone: crawlers lose interest there.
        if (Math.hypot(player.x, player.y) < SHIP_SAFE_RADIUS) {
          crawler.alerted = false;
        }

        // While chasing (even when waiting for the next attack), face the player.
        if (crawler.alerted && Math.abs(dx) > 8) {
          crawler.facing = dx < 0 ? -1 : 1;
        }

        const chasing = crawler.alerted;

        if (distance <= ATTACK_RANGE && crawler.cooldown <= 0) {
          crawler.facing = dx < 0 ? -1 : 1;
          setState(crawler, 'attack');
        } else if (chasing && distance > ATTACK_RANGE * 0.8) {
          steer(
            crawler,
            dx / distance * WALK_SPEED,
            dy / distance * WALK_SPEED,
            dt
          );
          setState(crawler, 'walk');
        } else if (!chasing && wander(crawler, dt)) {
          setState(crawler, 'walk');
        } else {
          steer(crawler, 0, 0, dt);

          // Only switch to idle once it has nearly stopped.
          if (Math.hypot(crawler.vx, crawler.vy) < 12) {
            setState(crawler, 'idle');
          }
        }

        animate(crawler, dt);
      }

      // Face the direction of movement (or the player when attacking).
      if (Math.abs(crawler.vx) > 8 && crawler.state === 'walk') {
        crawler.facing = crawler.vx < 0 ? -1 : 1;
      }

      crawler.x += crawler.vx * dt;
      crawler.y += crawler.vy * dt;
    }

    // Keep crawlers from overlapping each other and stay on the surface.
    for (let i = 0; i < crawlers.length; i++) {
      const a = crawlers[i];

      for (let j = i + 1; j < crawlers.length; j++) {
        const b = crawlers[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 0.01 && distance < BODY_RADIUS * 2) {
          const push = (BODY_RADIUS * 2 - distance) / 2;

          a.x -= dx / distance * push;
          a.y -= dy / distance * push;
          b.x += dx / distance * push;
          b.y += dy / distance * push;
        }
      }

      const fromCenter = Math.hypot(a.x, a.y);
      const limit = SURFACE_RADIUS - 60;

      if (fromCenter > limit) {
        a.x = a.x / fromCenter * limit;
        a.y = a.y / fromCenter * limit;
      }

      // Crawlers cannot walk into the ship's safe zone (the ship is at 0,0).
      if (fromCenter < SHIP_SAFE_RADIUS && fromCenter > 0.01) {
        a.x = a.x / fromCenter * SHIP_SAFE_RADIUS;
        a.y = a.y / fromCenter * SHIP_SAFE_RADIUS;
      }
    }

    // Remove crawlers whose death animation has fully faded.
    crawlers = crawlers.filter(crawler => crawler.fade > 0);
  }

  // Player melee attack. Returns true if the attack was used.
  // damage = player's weapon damage (1 = starting weapon).
  function playerAttack(playerX, playerY, playerAngle, damage = 1) {
    if (playerCooldown > 0) return false;

    playerCooldown = PLAYER_ATTACK_COOLDOWN;
    swingTimer = SWING_TIME;
    swingAngle = playerAngle;

    for (const crawler of crawlers) {
      if (crawler.state === 'death') continue;

      const dx = crawler.x - playerX;
      const dy = crawler.y - playerY;
      const distance = Math.hypot(dx, dy);

      if (distance > PLAYER_ATTACK_RANGE) continue;

      let difference = Math.atan2(dy, dx) - playerAngle;
      difference = Math.atan2(Math.sin(difference), Math.cos(difference));

      // Very close crawlers are always hit, even slightly behind.
      if (Math.abs(difference) > PLAYER_ATTACK_ARC && distance > 30) continue;

      crawler.hp -= damage;
      crawler.alerted = true; // getting hit always makes it chase you

      // Knockback away from the player.
      const length = distance || 1;
      crawler.vx = dx / length * 190;
      crawler.vy = dy / length * 190;

      if (crawler.hp <= 0) {
        setState(crawler, 'death');

        // A replacement appears RESPAWN_DELAY seconds after this kill.
        respawnTimers.push(RESPAWN_DELAY);
      } else {
        crawler.state = 'idle'; // force a fresh hit animation
        setState(crawler, 'hit');
      }
    }

    return true;
  }

  // Generic hit used by the martial-arts system (martialArts.js).
  // arc = half-angle of the attack cone (Math.PI = all around).
  // hitSet (optional): monsters already hit by this attack are skipped.
  // Returns one entry per monster hit: { x, y, killed, boss }.
  function strike({ x, y, angle = 0, range, arc = Math.PI, damage = 1, knockback = 190, hitSet = null }) {
    const results = [];

    for (const crawler of crawlers) {
      if (crawler.state === 'death') continue;
      if (hitSet && hitSet.has(crawler)) continue;

      const dx = crawler.x - x;
      const dy = crawler.y - y;
      const distance = Math.hypot(dx, dy);

      if (distance > range + 12) continue;

      if (arc < Math.PI && distance > 30) {
        let difference = Math.atan2(dy, dx) - angle;
        difference = Math.atan2(Math.sin(difference), Math.cos(difference));
        if (Math.abs(difference) > arc) continue;
      }

      if (hitSet) hitSet.add(crawler);

      crawler.hp -= damage;
      crawler.alerted = true;

      const length = distance || 1;
      crawler.vx = dx / length * knockback;
      crawler.vy = dy / length * knockback;

      if (crawler.hp <= 0) {
        setState(crawler, 'death');
        respawnTimers.push(RESPAWN_DELAY);
      } else {
        crawler.state = 'idle';
        setState(crawler, 'hit');
      }

      results.push({ x: crawler.x, y: crawler.y, killed: crawler.hp <= 0, boss: false });
    }

    return results;
  }

  function drawCrawler(ctx, crawler, x, y) {
    const image = frames[crawler.state][crawler.frame];

    if (!image || !image.complete || image.naturalWidth === 0) return;

    const w = Math.round(image.naturalWidth * SPRITE_SCALE);
    const h = Math.round(image.naturalHeight * SPRITE_SCALE);

    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));

    // Ground shadow.
    if (crawler.state !== 'death') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 2, 30, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = crawler.fade;
    ctx.imageSmoothingEnabled = false;
    ctx.scale(crawler.facing, 1);

    // Anchored at bottom-centre, so frames of different sizes line up.
    ctx.drawImage(image, -w / 2, -h + 6, w, h);

    ctx.restore();
  }

  // Draws crawlers in world space (camera = screen position of world 0,0).
  function draw(ctx, cameraX, cameraY, width, height) {
    for (const crawler of crawlers) {
      const x = cameraX + crawler.x;
      const y = cameraY + crawler.y;

      if (x < -100 || y < -100 || x > width + 100 || y > height + 100) continue;

      drawCrawler(ctx, crawler, x, y);
    }
  }

  // Short white swing arc in front of the player.
  function drawSwing(ctx, centerX, centerY) {
    if (swingTimer <= 0) return;

    const progress = 1 - swingTimer / SWING_TIME;

    ctx.save();
    ctx.globalAlpha = 0.7 * (1 - progress);
    ctx.strokeStyle = '#e8ecdc';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(
      centerX,
      centerY,
      PLAYER_ATTACK_RANGE * 0.6,
      swingAngle - PLAYER_ATTACK_ARC + progress * 0.4,
      swingAngle + PLAYER_ATTACK_ARC * progress
    );
    ctx.stroke();
    ctx.restore();
  }

  spawnAll();

  return {
    update,
    draw,
    drawSwing,
    playerAttack,
    strike,
    respawn: spawnAll,
    tickRespawns,
    count: () => crawlers.length,

    // Read-only snapshot for testing / debugging.
    list: () => crawlers.map(c => ({
      x: Math.round(c.x),
      y: Math.round(c.y),
      state: c.state,
      hp: c.hp,
      alerted: c.alerted
    })),
    pendingRespawns: () => respawnTimers.map(time => Math.round(time * 10) / 10)
  };
}
