// ==========================================
// LUNAR CRAWLER: the Moon's regular enemy.
// 18 frames: Idle 4 · Walk 4 · Attack 4 · Hit 2 · Death 4
// Sprites face RIGHT; they are flipped when the crawler faces left.
// ==========================================

const SURFACE_RADIUS = 4800;
const COUNT = 7;                 // crawlers on the Moon at once
const MIN_SPAWN_DISTANCE = 700;  // from the ship and the player

// One scale for every frame, so the crawler never changes size.
const SPRITE_SCALE = 0.27;

const MAX_HP = 3;
const WALK_SPEED = 95;           // player walks 190, exhausted 85
const ACCELERATION = 4;          // how fast velocity reaches its target
const AGGRO_RANGE = 420;         // starts chasing
const GIVE_UP_RANGE = 750;       // stops chasing
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

  function spawnAll(playerX = 0, playerY = 0) {
    crawlers = [];

    for (let i = 0; i < COUNT; i++) {
      let x;
      let y;

      do {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.sqrt(Math.random()) * SURFACE_RADIUS * 0.85;

        x = Math.cos(angle) * distance;
        y = Math.sin(angle) * distance;
      } while (
        Math.hypot(x, y) < MIN_SPAWN_DISTANCE ||
        Math.hypot(x - playerX, y - playerY) < MIN_SPAWN_DISTANCE
      );

      crawlers.push({
        x,
        y,
        vx: 0,
        vy: 0,
        hp: MAX_HP,
        state: 'idle',
        frame: Math.floor(Math.random() * 4), // not all in sync
        frameTimer: Math.random() * 0.18,
        facing: Math.random() < 0.5 ? -1 : 1,
        cooldown: 0,
        damageDone: false,
        fade: 1
      });
    }
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
        const chasing =
          distance < AGGRO_RANGE ||
          (crawler.state === 'walk' && distance < GIVE_UP_RANGE);

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
    }

    // Remove crawlers whose death animation has fully faded.
    crawlers = crawlers.filter(crawler => crawler.fade > 0);
  }

  // Player melee attack. Returns true if the attack was used.
  function playerAttack(playerX, playerY, playerAngle) {
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

      crawler.hp -= 1;

      // Knockback away from the player.
      const length = distance || 1;
      crawler.vx = dx / length * 190;
      crawler.vy = dy / length * 190;

      if (crawler.hp <= 0) {
        setState(crawler, 'death');
      } else {
        crawler.state = 'idle'; // force a fresh hit animation
        setState(crawler, 'hit');
      }
    }

    return true;
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
    respawn: spawnAll,
    count: () => crawlers.length
  };
}
