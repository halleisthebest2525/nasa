// ==========================================
// BOSS CO-OP HELPER (used by the four boss files)
//  - more boss HP and boss damage in multiplayer (see difficulty.js)
//  - reports every hit on the boss, so all players share one HP bar
//  - the multiplayer-only SPECIAL SKILL of each boss
// In solo play none of this does anything.
//
// SPECIAL SKILLS (level = number of players, 2-4)
//   Mars    METEOR STORM    : burning circles fall on and around you (2+level of them)
//   Europa  GLACIAL NOVA    : a frozen ring explodes around the boss; stand close
//                             to it or far away. 4 players: then a blast at its feet
//   Titan   NITROGEN VORTEX : you are pulled toward the boss, then its centre explodes
//   Umbriel VOID BARRAGE    : (1+level) blasts follow your steps; keep moving
// ==========================================

import { coopState } from './state.js';

const SKILLS = {
  mars:    { name: 'METEOR STORM',    color: '255,123,74' },
  europa:  { name: 'GLACIAL NOVA',    color: '159,230,255' },
  titan:   { name: 'NITROGEN VORTEX', color: '201,176,255' },
  umbriel: { name: 'VOID BARRAGE',    color: '255,255,255' }
};

const FIRST_USE = 7;          // seconds of fighting before the first special skill
const MAX_RANGE = 900;        // only used when the player is this close to the boss
const BLAST_TIME = 0.35;      // explosion flash after a mark goes off

const skillsOn = () => coopState.active && coopState.difficulty.skills;
const level = () => coopState.difficulty.skillLevel || 2;

// options = { planet, BOSS, bossName, getBoss(), callbacks }
export function createBossCoop({ planet, BOSS, bossName, getBoss, callbacks = {} }) {
  const skill = SKILLS[planet];
  const baseHp = BOSS.hp;

  let cooldown = FIRST_USE;
  let running = null;   // { kind, time, next, left } while a skill is being cast
  let marks = [];       // { x, y, inner, outer, fuse, time, damage, cause, done }

  // Boss HP follows the co-op difficulty (keeps the same % when it changes).
  function refresh() {
    const want = Math.round(baseHp * (coopState.active ? coopState.difficulty.hp : 1));
    if (want === BOSS.hp) return;

    const boss = getBoss();
    if (boss && boss.state !== 'die') boss.hp = Math.max(0.1, boss.hp / BOSS.hp * want);
    BOSS.hp = want;
  }

  // The boss hits harder in co-op: wrap player.damage with the multiplier.
  function scalePlayer(player) {
    const multiplier = coopState.active ? coopState.difficulty.damage : 1;
    if (multiplier === 1) return player;

    return new Proxy(player, {
      get(target, key) {
        if (key === 'damage') return (amount, ...rest) => target.damage(amount * multiplier, ...rest);
        const value = target[key];
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  }

  // A local player hit the boss: tell the other players.
  function reportHit(amount) {
    if (coopState.active && amount > 0 && callbacks.onBossDamaged) callbacks.onBossDamaged(amount);
  }

  function addMark(x, y, outer, fuse, damage, inner = 0) {
    marks.push({ x, y, inner, outer, fuse, time: 0, damage, cause: `${bossName} · ${skill.name}`, done: false });
  }

  function start(boss, player) {
    const lv = level();

    if (callbacks.onCoopSkill) callbacks.onCoopSkill(`${bossName} USES ${skill.name}`);

    if (planet === 'mars') {
      const count = 2 + lv;
      addMark(player.x, player.y, 62, 1.4, 12);
      for (let i = 1; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const reach = 70 + Math.random() * 170;
        addMark(player.x + Math.cos(angle) * reach, player.y + Math.sin(angle) * reach, 62, 1.4 + i * 0.12, 12);
      }
    } else if (planet === 'europa') {
      addMark(boss.x, boss.y, 470, 1.7, 16, 150);
      if (lv >= 4) addMark(boss.x, boss.y, 210, 2.7, 14);
    } else if (planet === 'titan') {
      running = { kind: 'vortex', time: 2.3, x: boss.x, y: boss.y, pull: 95 + lv * 20 };
      addMark(boss.x, boss.y, 165, 2.4, 18);
    } else if (planet === 'umbriel') {
      running = { kind: 'barrage', next: 0, left: 1 + lv };
    }
  }

  function runSkill(dt, boss, player) {
    if (running.kind === 'vortex') {
      running.time -= dt;
      const dx = running.x - player.x;
      const dy = running.y - player.y;
      const distance = Math.hypot(dx, dy);

      if (distance > 30 && distance < 700) {
        const step = Math.min(distance - 30, running.pull * dt);
        player.push(dx / distance * step, dy / distance * step);
      }

      if (running.time <= 0) running = null;
    } else if (running.kind === 'barrage') {
      running.next -= dt;

      if (running.next <= 0) {
        addMark(player.x, player.y, 72, 1.1, 12);
        running.left -= 1;
        running.next = 0.45;
        if (running.left <= 0) running = null;
      }
    }
  }

  function updateMarks(dt, player) {
    for (const mark of marks) {
      mark.time += dt;

      if (!mark.done && mark.time >= mark.fuse) {
        mark.done = true;
        const distance = Math.hypot(player.x - mark.x, player.y - mark.y);
        if (distance <= mark.outer && distance >= mark.inner) player.damage(mark.damage, mark.cause);
      }
    }

    marks = marks.filter(mark => mark.time < mark.fuse + BLAST_TIME);
  }

  // player = the scaled player (see scalePlayer).
  function update(dt, boss, player, playerSafe) {
    refresh();
    updateMarks(dt, player);

    if (!skillsOn() || !boss || boss.state === 'die') {
      running = null;
      return;
    }

    if (running) {
      runSkill(dt, boss, player);
      return;
    }

    // The timer only runs while the boss is actually fighting.
    if (!boss.alerted || playerSafe) return;

    cooldown -= dt;

    if (cooldown <= 0 && Math.hypot(player.x - boss.x, player.y - boss.y) < MAX_RANGE) {
      cooldown = coopState.difficulty.skillCooldown;
      start(boss, player);
    }
  }

  function clear() {
    running = null;
    marks = [];
    cooldown = FIRST_USE;
  }

  // Drawn above the darkness so the warnings are always visible.
  function drawGlow(ctx, cameraX, cameraY) {
    if (!marks.length && !running) return;

    const rgb = skill.color;
    ctx.save();

    if (running?.kind === 'vortex') {
      const x = cameraX + running.x;
      const y = cameraY + running.y;
      const spin = performance.now() / 260;

      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(${rgb},${0.5 - i * 0.12})`;
        ctx.beginPath();
        ctx.arc(x, y, 210 + i * 90, spin + i, spin + i + Math.PI * 1.3);
        ctx.stroke();
      }
    }

    for (const mark of marks) {
      const x = cameraX + mark.x;
      const y = cameraY + mark.y;

      if (!mark.done) {
        const charge = Math.min(1, mark.time / mark.fuse);

        ctx.beginPath();
        ctx.arc(x, y, mark.outer, 0, Math.PI * 2);
        if (mark.inner > 0) ctx.arc(x, y, mark.inner, 0, Math.PI * 2, true);
        ctx.fillStyle = `rgba(${rgb},${0.08 + 0.22 * charge})`;
        ctx.fill('evenodd');

        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(${rgb},${0.45 + 0.5 * charge})`;
        ctx.beginPath();
        ctx.arc(x, y, mark.outer, 0, Math.PI * 2);
        ctx.stroke();
        if (mark.inner > 0) {
          ctx.beginPath();
          ctx.arc(x, y, mark.inner, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Shrinking ring = time left before it goes off.
        ctx.strokeStyle = `rgba(${rgb},0.9)`;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(2, mark.outer * (1 - charge)), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const flash = 1 - (mark.time - mark.fuse) / BLAST_TIME;

        ctx.beginPath();
        ctx.arc(x, y, mark.outer, 0, Math.PI * 2);
        if (mark.inner > 0) ctx.arc(x, y, mark.inner, 0, Math.PI * 2, true);
        ctx.fillStyle = `rgba(${rgb},${0.55 * Math.max(0, flash)})`;
        ctx.fill('evenodd');
      }
    }

    ctx.restore();
  }

  return { refresh, scalePlayer, reportHit, update, drawGlow, clear, skillName: skill.name };
}
