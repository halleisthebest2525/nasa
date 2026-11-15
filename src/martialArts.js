// ==========================================
// MARTIAL ARTS
// The astronaut has no weapons: every attack comes from their own body.
// They start with a PUNCH and learn more techniques by:
//   1. meeting the requirement (reaching a world / beating a boss), and
//   2. paying SCRAPS in the Martial Arts menu (K).
//
// To add a new technique, add one entry to SKILLS below. The "type"
// decides how it works:
//   'melee'      one hit in a cone in front of the player
//   'dash'       the player flies forward and hits everything on the way
//   'projectile' an energy wave that travels in a straight line
//   'combo'      several fast hits, then one big finishing strike
//
// This file never touches the monsters directly: it calls
// enemies.strike(...) which every monster file provides.
// ==========================================

export const SKILLS = [
  {
    id: 'punch',
    key: '1',
    name: 'PUNCH',
    tier: 1,
    world: 'THE MOON',
    type: 'melee',
    description: 'A quick straight punch. Weak, but it is always ready.',
    special: 'FASTEST ATTACK · CAN BE USED BETWEEN OTHER SKILLS',
    cost: 0,
    requires: null,
    requireText: 'KNOWN FROM THE START',
    damage: 1,
    range: 68,
    arc: 0.95,           // half-angle of the hit cone (radians)
    knockback: 170,
    cooldown: 0.32,
    busy: 0.14,          // attack animation: nothing else can start during it
    sound: 'punch'
  },
  {
    id: 'flyingKick',
    key: '2',
    name: 'FLYING KICK',
    tier: 2,
    world: 'MARS',
    type: 'dash',
    description: 'Leap forward feet first. Closes the gap and hits everything on the way.',
    special: 'MOVES YOU FORWARD · HITS EVERY ENEMY ON THE PATH ONCE',
    cost: 250,
    requires: 'reachedMars',
    requireText: 'FIND THE MARS STAR MAP',
    damage: 4,
    range: 220,          // distance travelled
    dashTime: 0.26,
    hitRadius: 50,
    knockback: 260,
    cooldown: 3.5,
    busy: 0.3,
    sound: 'dash'
  },
  {
    id: 'energyWave',
    key: '3',
    name: 'ENERGY WAVE',
    tier: 3,
    world: 'EUROPA',
    type: 'projectile',
    description: 'Push your inner energy out through your palms as a flying wave.',
    special: 'RANGED · STOPS AT THE FIRST ENEMY · BOSSES RESIST ENERGY (60%)',
    cost: 600,
    requires: 'marsBoss',
    requireText: 'DEFEAT ARES COLOSSUS (MARS BOSS)',
    damage: 5,
    range: 520,          // distance the wave travels
    speed: 520,
    radius: 26,
    pierce: 1,           // enemies it can hit before it bursts
    knockback: 220,
    cooldown: 5,
    busy: 0.3,
    sound: 'wave',
    colors: ['#fff6cf', '#ffd35a', '#ff9a2e']
  },
  {
    id: 'advancedWave',
    key: '4',
    name: 'ADVANCED ENERGY WAVE',
    tier: 4,
    world: 'TITAN',
    type: 'projectile',
    description: 'The same technique, mastered: a larger, denser wave that keeps going.',
    special: 'RANGED · PASSES THROUGH 3 ENEMIES · BOSSES RESIST ENERGY (60%)',
    cost: 1200,
    requires: 'europaBoss',
    requireText: 'DEFEAT THE CRYOLITH LEVIATHAN (EUROPA BOSS)',
    damage: 9,
    range: 720,
    speed: 470,
    radius: 44,
    pierce: 3,
    knockback: 300,
    cooldown: 9,
    busy: 0.45,
    sound: 'bigWave',
    colors: ['#f2fbff', '#7fd8ff', '#3a7bff']
  },
  {
    id: 'finisher',
    key: '5',
    name: 'NINE WORLDS FINISHER',
    tier: 5,
    world: 'URANUS',
    type: 'combo',
    description: 'Everything you have learned in one move: five rapid strikes, then a palm strike that shakes the ground.',
    special: '5 FAST HITS + 1 HEAVY FINISHING STRIKE · LONG COOLDOWN',
    cost: 2500,
    requires: 'titanBeaten',
    requireText: 'COMPLETE TITAN (OPEN THE TITAN CHEST)',
    damage: 1.5,         // each fast hit
    hits: 5,
    hitInterval: 0.11,
    range: 96,
    arc: 1.3,
    knockback: 60,
    finisherDamage: 10,
    finisherRange: 140,
    finisherArc: 1.25,
    finisherKnockback: 460,
    cooldown: 20,
    busy: 0.95,
    sound: 'punch'
  }
];

const BY_ID = Object.fromEntries(SKILLS.map(skill => [skill.id, skill]));

// Total damage of one use (shown in the menu).
export function skillDamageText(skill) {
  if (skill.type === 'combo') return `${skill.hits} x ${skill.damage} + ${skill.finisherDamage}`;
  return String(skill.damage);
}

// ---------- ICONS (drawn by code, pixel style) ----------
// Draws a skill icon inside a size x size box at (x, y).
export function drawSkillIcon(ctx, id, x, y, size, color = '#e8ecdc') {
  const u = size / 16;   // the icon is designed on a 16 x 16 grid
  const box = (gx, gy, gw, gh, fill = color) => {
    ctx.fillStyle = fill;
    ctx.fillRect(Math.round(x + gx * u), Math.round(y + gy * u), Math.ceil(gw * u), Math.ceil(gh * u));
  };

  if (id === 'punch') {
    box(2, 6, 5, 5);                 // arm
    box(7, 4, 6, 8);                 // fist
    box(13, 5, 1, 6);
    box(9, 6, 1, 4, '#101614');      // knuckle lines
    box(11, 6, 1, 4, '#101614');
  } else if (id === 'kick') {
    box(3, 2, 3, 7);                 // thigh
    box(5, 8, 7, 3);                 // shin
    box(10, 10, 4, 3);               // boot
    box(12, 9, 2, 1);
    box(2, 13, 3, 1, '#7b8578');     // sweep line
    box(6, 14, 6, 1, '#7b8578');
  } else if (id === 'flyingKick') {
    box(6, 6, 6, 3);                 // leg
    box(11, 5, 4, 5);                // boot
    box(4, 4, 3, 3);                 // body
    box(0, 3, 3, 1, '#7b8578');      // speed lines
    box(1, 7, 4, 1, '#7b8578');
    box(0, 11, 3, 1, '#7b8578');
  } else if (id === 'energyWave') {
    box(9, 2, 3, 2, '#ffd35a');      // crescent
    box(11, 4, 3, 3, '#ffd35a');
    box(12, 7, 3, 2, '#fff6cf');
    box(11, 9, 3, 3, '#ffd35a');
    box(9, 12, 3, 2, '#ffd35a');
    box(2, 7, 5, 2);                 // palms
  } else if (id === 'advancedWave') {
    box(8, 1, 3, 2, '#7fd8ff');
    box(10, 3, 3, 3, '#7fd8ff');
    box(12, 6, 3, 4, '#f2fbff');
    box(10, 10, 3, 3, '#7fd8ff');
    box(8, 13, 3, 2, '#7fd8ff');
    box(5, 6, 4, 4, '#f2fbff');      // core
    box(1, 7, 3, 2);
  } else {
    // finisher: a star burst
    box(7, 1, 2, 14, '#ffe27a');
    box(1, 7, 14, 2, '#ffe27a');
    box(4, 4, 8, 8, '#ffe27a');
    box(6, 6, 4, 4, '#ffffff');
    box(2, 2, 2, 2);
    box(12, 2, 2, 2);
    box(2, 12, 2, 2);
    box(12, 12, 2, 2);
  }
}

// game = {
//   getPlayer()            -> { x, y, angle }
//   movePlayer(dx, dy)     moves the player (flying kick)
//   getEnemies()           -> the current planet's monsters (or null)
//   getScraps() / spendScraps(amount)
//   getProgress()          -> { reachedMars, marsBoss, europaBoss, titanBeaten, neptuneBoss }
//   onKill(result)         a monster died: { x, y, boss }
//   message(text)          short text on screen
//   sfx                    sound effects (sfx.js)
// }
export function createMartialArts(game) {
  const unlocked = new Set(['punch']);
  const cooldowns = {};      // skill id -> seconds until it can be used again
  const flash = {};          // skill id -> short highlight in the skill bar

  let busy = 0;              // an attack animation is playing
  let action = null;         // flying kick / finisher in progress
  let projectiles = [];
  let effects = [];          // short visual effects, in world coordinates
  let clock = 0;
  let messageCooldown = 0;

  const sound = name => {
    if (game.sfx && game.sfx[name]) game.sfx[name]();
  };

  // ---------- unlocking / buying ----------
  function requirementMet(skill) {
    if (!skill.requires) return true;
    return Boolean(game.getProgress()[skill.requires]);
  }

  // 'unlocked'  already learned
  // 'available' requirement met and enough scraps
  // 'poor'      requirement met, not enough scraps yet
  // 'locked'    requirement not met
  function status(id) {
    const skill = BY_ID[id];

    if (unlocked.has(id)) return 'unlocked';
    if (!requirementMet(skill)) return 'locked';
    return game.getScraps() >= skill.cost ? 'available' : 'poor';
  }

  function buy(id) {
    const skill = BY_ID[id];
    if (!skill) return { ok: false, message: 'UNKNOWN SKILL' };

    const state = status(id);

    if (state === 'unlocked') return { ok: false, message: `${skill.name} IS ALREADY LEARNED` };

    if (state === 'locked') {
      sound('deny');
      return { ok: false, message: `LOCKED · ${skill.requireText}` };
    }

    if (state === 'poor') {
      sound('deny');
      return {
        ok: false,
        message: `NOT ENOUGH SCRAPS · ${skill.name} COSTS ${skill.cost} · YOU NEED ${skill.cost - game.getScraps()} MORE`
      };
    }

    game.spendScraps(skill.cost);
    unlocked.add(id);
    sound('buy');

    return {
      ok: true,
      message: `${skill.name} LEARNED · -${skill.cost} SCRAPS · ${game.getScraps()} LEFT · PRESS ${skill.key} TO USE`
    };
  }

  // ---------- hitting monsters ----------
  function hit(options) {
    const enemies = game.getEnemies();
    if (!enemies || !enemies.strike) return [];

    const results = enemies.strike(options);

    for (const result of results) {
      effects.push({ type: 'impact', x: result.x, y: result.y, time: 0, duration: 0.2, big: result.killed });
      if (result.killed && game.onKill) game.onKill(result);
    }

    if (results.length) sound('hit');
    return results;
  }

  // ---------- using a skill ----------
  function use(id) {
    const skill = BY_ID[id];
    if (!skill) return false;

    if (!unlocked.has(id)) {
      if (messageCooldown <= 0) {
        game.message(`${skill.name} NOT LEARNED · PRESS K FOR MARTIAL ARTS`);
        messageCooldown = 1.5;
      }
      return false;
    }

    if (busy > 0 || action || (cooldowns[id] || 0) > 0) return false;

    const player = game.getPlayer();

    cooldowns[id] = skill.cooldown;
    busy = skill.busy;
    flash[id] = 0.18;
    sound(skill.sound);

    if (skill.type === 'melee') {
      hit({
        x: player.x, y: player.y, angle: player.angle,
        range: skill.range, arc: skill.arc, damage: skill.damage, knockback: skill.knockback
      });

      effects.push({ type: id, follow: true, angle: player.angle, time: 0, duration: skill.busy + 0.06, skill });
    } else if (skill.type === 'dash') {
      action = { type: 'dash', skill, angle: player.angle, time: 0, hitSet: new Set(), trailTimer: 0 };
    } else if (skill.type === 'projectile') {
      effects.push({ type: 'cast', follow: true, angle: player.angle, time: 0, duration: 0.25, skill });

      projectiles.push({
        skill,
        x: player.x + Math.cos(player.angle) * 22,
        y: player.y + Math.sin(player.angle) * 22,
        angle: player.angle,
        travelled: 0,
        hits: 0,
        hitSet: new Set(),
        fade: 1,
        dying: false
      });
    } else if (skill.type === 'combo') {
      action = { type: 'combo', skill, time: 0, hitsDone: 0 };
    }

    return true;
  }

  function burst(projectile) {
    projectile.dying = true;
    effects.push({
      type: 'burst', x: projectile.x, y: projectile.y, time: 0, duration: 0.3,
      radius: projectile.skill.radius * 1.6, colors: projectile.skill.colors
    });
  }

  // ---------- update ----------
  function update(dt) {
    clock += dt;
    busy = Math.max(0, busy - dt);
    messageCooldown = Math.max(0, messageCooldown - dt);

    for (const id of Object.keys(cooldowns)) cooldowns[id] = Math.max(0, cooldowns[id] - dt);
    for (const id of Object.keys(flash)) flash[id] = Math.max(0, flash[id] - dt);

    const player = game.getPlayer();

    if (action && action.type === 'dash') {
      // FLYING KICK: move forward and hit everything touched, once each.
      const skill = action.skill;
      const step = Math.min(dt, skill.dashTime - action.time);
      const distance = skill.range / skill.dashTime * step;

      game.movePlayer(Math.cos(action.angle) * distance, Math.sin(action.angle) * distance);
      action.time += dt;

      const now = game.getPlayer();

      hit({
        x: now.x, y: now.y, angle: action.angle,
        range: skill.hitRadius, arc: Math.PI, damage: skill.damage,
        knockback: skill.knockback, hitSet: action.hitSet
      });

      action.trailTimer -= dt;

      if (action.trailTimer <= 0) {
        action.trailTimer = 0.035;
        effects.push({ type: 'afterimage', x: now.x, y: now.y, angle: action.angle, time: 0, duration: 0.25 });
      }

      if (action.time >= skill.dashTime) action = null;
    } else if (action && action.type === 'combo') {
      // FINISHER: fast hits, then the heavy strike.
      const skill = action.skill;
      action.time += dt;

      while (action.hitsDone < skill.hits && action.time >= action.hitsDone * skill.hitInterval) {
        hit({
          x: player.x, y: player.y, angle: player.angle,
          range: skill.range, arc: skill.arc, damage: skill.damage, knockback: skill.knockback
        });

        effects.push({
          type: 'flurry', follow: true, angle: player.angle, time: 0, duration: 0.12,
          side: action.hitsDone % 2 ? 1 : -1
        });

        sound('punch');
        action.hitsDone += 1;
      }

      const finisherAt = skill.hits * skill.hitInterval + 0.16;

      if (action.time >= finisherAt) {
        hit({
          x: player.x, y: player.y, angle: player.angle,
          range: skill.finisherRange, arc: skill.finisherArc,
          damage: skill.finisherDamage, knockback: skill.finisherKnockback
        });

        effects.push({ type: 'finisher', x: player.x, y: player.y, angle: player.angle, time: 0, duration: 0.45, skill });
        sound('finisher');
        action = null;
      }
    }

    // ENERGY WAVES
    for (const projectile of projectiles) {
      if (projectile.dying) {
        projectile.fade -= dt * 6;
        continue;
      }

      const skill = projectile.skill;
      const distance = skill.speed * dt;

      projectile.x += Math.cos(projectile.angle) * distance;
      projectile.y += Math.sin(projectile.angle) * distance;
      projectile.travelled += distance;

      const results = hit({
        x: projectile.x, y: projectile.y, angle: projectile.angle,
        range: skill.radius, arc: Math.PI, damage: skill.damage,
        knockback: skill.knockback, energy: true, hitSet: projectile.hitSet
      });

      projectile.hits += results.length;

      if (projectile.hits >= skill.pierce) burst(projectile);
      else if (projectile.travelled >= skill.range) projectile.dying = true;   // fades out at the end of its range
    }

    projectiles = projectiles.filter(projectile => projectile.fade > 0);

    for (const effect of effects) effect.time += dt;
    effects = effects.filter(effect => effect.time < effect.duration);
  }

  // ---------- drawing: player poses + hits (under the darkness) ----------
  const GLOVE = '#d8d2c0';
  const SUIT = '#8f988c';

  function drawEffect(ctx, effect, x, y) {
    const t = effect.time / effect.duration;   // 0 -> 1

    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));

    if (effect.type === 'punch') {
      ctx.rotate(effect.angle);
      const reach = 12 + Math.sin(Math.min(1, t * 1.4) * Math.PI) * 26;

      ctx.fillStyle = SUIT;
      ctx.fillRect(6, 3, reach - 6, 4);          // arm
      ctx.fillStyle = GLOVE;
      ctx.fillRect(reach - 2, 1, 9, 8);          // fist

      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, effect.skill.range * 0.72, -0.45, 0.45);
      ctx.stroke();
    } else if (effect.type === 'kick') {
      // The leg sweeps from one side to the other.
      const sweep = -effect.skill.arc + t * effect.skill.arc * 2;

      ctx.rotate(effect.angle);

      ctx.globalAlpha = 0.75 * (1 - t * 0.6);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, 0, effect.skill.range * 0.74, -effect.skill.arc, sweep);
      ctx.stroke();

      ctx.strokeStyle = '#bcd6e6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, effect.skill.range * 0.6, -effect.skill.arc, sweep);
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.rotate(sweep);
      ctx.fillStyle = SUIT;
      ctx.fillRect(6, -3, 34, 6);                // leg
      ctx.fillStyle = '#3a423f';
      ctx.fillRect(38, -5, 12, 10);              // boot
    } else if (effect.type === 'flurry') {
      ctx.rotate(effect.angle);
      const reach = 14 + Math.sin(t * Math.PI) * 30;

      ctx.fillStyle = GLOVE;
      ctx.fillRect(reach, effect.side * 9 - 4, 9, 8);

      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(reach + 12, effect.side * 9 - 1, 14, 2);
      ctx.fillRect(reach + 10, effect.side * 9 - 7, 8, 2);
      ctx.fillRect(reach + 10, effect.side * 9 + 5, 8, 2);
    } else if (effect.type === 'afterimage') {
      // Flying kick: fading copies of the player + speed lines.
      ctx.rotate(effect.angle);
      ctx.globalAlpha = 0.45 * (1 - t);
      ctx.fillStyle = '#cfe6f2';
      ctx.fillRect(-9, -9, 18, 18);
      ctx.fillRect(8, -3, 22, 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-46, -12, 30, 2);
      ctx.fillRect(-58, 0, 40, 2);
      ctx.fillRect(-46, 11, 30, 2);
    } else if (effect.type === 'impact') {
      // A hit landed: a small star of sparks on the monster.
      const reach = (effect.big ? 16 : 9) + t * (effect.big ? 30 : 18);

      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = effect.big ? '#ffe27a' : '#ffffff';

      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4 + 0.3;
        ctx.fillRect(Math.round(Math.cos(angle) * reach) - 2, Math.round(Math.sin(angle) * reach) - 2, 4, 4);
      }

      ctx.fillRect(-3, -3, 6, 6);
    }

    ctx.restore();
  }

  function draw(ctx, cameraX, cameraY) {
    const player = game.getPlayer();

    // The leg stays out in front during a flying kick.
    if (action && action.type === 'dash') {
      ctx.save();
      ctx.translate(Math.round(cameraX + player.x), Math.round(cameraY + player.y));
      ctx.rotate(action.angle);
      ctx.fillStyle = SUIT;
      ctx.fillRect(6, -3, 26, 6);
      ctx.fillStyle = '#3a423f';
      ctx.fillRect(30, -6, 13, 12);
      ctx.restore();
    }

    for (const effect of effects) {
      if (['cast', 'burst', 'finisher'].includes(effect.type)) continue;   // drawn in drawGlow

      const x = cameraX + (effect.follow ? player.x : effect.x);
      const y = cameraY + (effect.follow ? player.y : effect.y);

      drawEffect(ctx, effect, x, y);
    }
  }

  // ---------- drawing: energy (shines through the darkness) ----------
  function drawWave(ctx, projectile, x, y) {
    const skill = projectile.skill;
    const [core, mid, outer] = skill.colors;
    const r = skill.radius;
    const pulse = 1 + Math.sin(clock * 30) * 0.06;

    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(projectile.angle);
    ctx.globalAlpha = Math.max(0, Math.min(1, projectile.fade));
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'butt';

    // A crescent of energy, open side towards the player.
    ctx.strokeStyle = outer;
    ctx.lineWidth = r * 0.55;
    ctx.beginPath();
    ctx.arc(-r * 0.55, 0, r * pulse, -1.15, 1.15);
    ctx.stroke();

    ctx.strokeStyle = mid;
    ctx.lineWidth = r * 0.34;
    ctx.beginPath();
    ctx.arc(-r * 0.55, 0, r * pulse, -1.0, 1.0);
    ctx.stroke();

    ctx.strokeStyle = core;
    ctx.lineWidth = r * 0.14;
    ctx.beginPath();
    ctx.arc(-r * 0.55, 0, r * pulse, -0.8, 0.8);
    ctx.stroke();

    // The advanced wave carries a dense core.
    if (skill.pierce > 1) {
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(-r * 0.2, 0, r * 0.28 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = mid;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(-r * 0.2, 0, r * 0.5, clock * 9, clock * 9 + 4.2);
      ctx.stroke();
    }

    // Wisps of energy trailing behind.
    ctx.fillStyle = mid;

    for (let i = 0; i < 7; i++) {
      const back = ((clock * 3 + i * 0.37) % 1) * r * 2.2;
      const side = Math.sin(i * 2.4 + clock * 5) * r * 0.7;
      const size = 4 - Math.floor(back / (r * 0.8));

      if (size > 0) ctx.fillRect(Math.round(-r * 0.7 - back), Math.round(side), size, size);
    }

    ctx.restore();
  }

  function drawGlow(ctx, cameraX, cameraY) {
    const player = game.getPlayer();

    for (const effect of effects) {
      const x = cameraX + (effect.follow ? player.x : effect.x);
      const y = cameraY + (effect.follow ? player.y : effect.y);
      const t = effect.time / effect.duration;

      if (effect.type === 'cast') {
        // Palms pushed forward, energy gathering.
        const [core, mid] = effect.skill.colors;

        ctx.save();
        ctx.translate(Math.round(x), Math.round(y));
        ctx.rotate(effect.angle);
        ctx.fillStyle = GLOVE;
        ctx.fillRect(12, -9, 7, 6);
        ctx.fillRect(12, 3, 7, 6);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = mid;
        ctx.beginPath();
        ctx.arc(24, 0, 8 + t * effect.skill.radius * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(24, 0, 5 + t * 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (effect.type === 'burst') {
        const [core, mid] = effect.colors;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = mid;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(x, y, effect.radius * (0.4 + t * 0.8), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = core;

        for (let i = 0; i < 10; i++) {
          const angle = i * Math.PI / 5;
          const reach = effect.radius * (0.3 + t);
          ctx.fillRect(Math.round(x + Math.cos(angle) * reach) - 2, Math.round(y + Math.sin(angle) * reach) - 2, 4, 4);
        }

        ctx.restore();
      } else if (effect.type === 'finisher') {
        // The heavy palm strike: a cone of force and a ground ring.
        const skill = effect.skill;

        ctx.save();
        ctx.translate(Math.round(x), Math.round(y));
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - t;

        ctx.strokeStyle = '#ffe27a';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(0, 0, skill.finisherRange * (0.3 + t * 0.8), 0, Math.PI * 2);
        ctx.stroke();

        ctx.rotate(effect.angle);
        ctx.fillStyle = `rgba(255, 240, 180, ${0.5 * (1 - t)})`;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, skill.finisherRange * (0.5 + t * 0.5), -skill.finisherArc, skill.finisherArc);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        for (let i = -3; i <= 3; i++) {
          const angle = i * skill.finisherArc / 3.2;
          const reach = skill.finisherRange * (0.45 + t * 0.6);
          ctx.fillRect(Math.round(Math.cos(angle) * reach) - 3, Math.round(Math.sin(angle) * reach) - 3, 6, 6);
        }

        ctx.restore();
      }
    }

    for (const projectile of projectiles) {
      drawWave(ctx, projectile, cameraX + projectile.x, cameraY + projectile.y);
    }
  }

  // ---------- drawing: skill bar (bottom centre of the screen) ----------
  function drawHud(ctx, width, height) {
    const slot = 46;
    const gap = 6;
    const total = SKILLS.length * slot + (SKILLS.length - 1) * gap;
    const left = Math.round((width - total) / 2);
    const top = height - 112;

    ctx.save();

    // Scrap balance.
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(width / 2 - 92, top - 26, 184, 20);
    ctx.fillStyle = '#e0c78e';
    ctx.fillText(`SCRAPS ${game.getScraps()} · K = SKILLS`, width / 2, top - 12);

    SKILLS.forEach((skill, index) => {
      const x = left + index * (slot + gap);
      const state = status(skill.id);
      const learned = state === 'unlocked';
      const remaining = cooldowns[skill.id] || 0;

      ctx.fillStyle = 'rgba(8, 12, 11, 0.88)';
      ctx.fillRect(x, top, slot, slot);

      drawSkillIcon(ctx, skill.id, x + 7, top + 7, slot - 14, learned ? '#e8ecdc' : '#4a524c');

      if (!learned) {
        // Not learned: dimmed. A gold corner means "you can buy this now".
        ctx.fillStyle = 'rgba(8, 12, 11, 0.6)';
        ctx.fillRect(x, top, slot, slot);

        if (state === 'available') {
          ctx.fillStyle = '#e0c78e';
          ctx.fillRect(x + slot - 12, top, 12, 4);
          ctx.fillRect(x + slot - 4, top, 4, 12);
        }
      } else if (remaining > 0) {
        // Cooldown: a dark cover that drains from the top.
        const part = Math.min(1, remaining / skill.cooldown);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.fillRect(x, top + slot * (1 - part), slot, slot * part);

        if (remaining >= 1) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 14px monospace';
          ctx.fillText(String(Math.ceil(remaining)), x + slot / 2, top + slot / 2 + 5);
        }
      }

      ctx.strokeStyle = (flash[skill.id] || 0) > 0
        ? '#ffffff'
        : learned ? (remaining > 0 ? '#59625a' : '#a9c48e') : '#343b36';
      ctx.lineWidth = (flash[skill.id] || 0) > 0 ? 3 : 1;
      ctx.strokeRect(x + 0.5, top + 0.5, slot - 1, slot - 1);

      // Key number.
      ctx.fillStyle = learned ? '#d5dfb4' : '#5c645d';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(skill.key, x + 4, top + 12);
      ctx.textAlign = 'center';
    });

    ctx.restore();
  }

  return {
    use,
    useByKey(key) {
      const skill = SKILLS.find(entry => entry.key === key);
      return skill ? use(skill.id) : false;
    },
    update,
    draw,
    drawGlow,
    drawHud,
    status,
    buy,
    isUnlocked: id => unlocked.has(id),
    unlockedCount: () => unlocked.size,
    cooldownOf: id => cooldowns[id] || 0,
    isBusy: () => busy > 0 || Boolean(action),

    // Stops everything in progress (leaving the planet, sleeping...).
    reset() {
      action = null;
      projectiles = [];
      effects = [];
      busy = 0;
    },

    save: () => ({ unlocked: [...unlocked] }),

    load(data) {
      unlocked.clear();
      unlocked.add('punch');

      if (data && Array.isArray(data.unlocked)) {
        for (const id of data.unlocked) if (BY_ID[id]) unlocked.add(id);
      }

      for (const id of Object.keys(cooldowns)) cooldowns[id] = 0;
      this.reset();
    }
  };
}
