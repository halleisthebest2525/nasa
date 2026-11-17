// ==========================================
// CO-OP GAME SYNC (runs inside the game, only in multiplayer)
//
// Every player has their own ship, suit, oxygen and health, and flies /
// walks freely. The TEAM shares everything else:
//   - scraps (credits)            -> every gain/spend is sent as +/- amount
//   - ship modules (inventory and fitted parts: one ship design for all)
//   - the modules lying on each planet (picked up once, for everyone)
//   - chests, star maps, beaten worlds
//   - boss HP (one shared bar), boss kills and boss rewards
//   - the ending: when the ship is complete, everyone sees the ending
//
// The HOST keeps the official team state. Guests send changes ("patch")
// to the host; the host merges them and sends the new team state to all.
// ==========================================

import { session, on, send, isHost, playerName, playerColor } from './session.js';
import { coopState, setCoopActive, setCoopPlayers } from './state.js';
import { generatePlanetParts } from '../partsSystem.js';

const WORLDS = ['moon', 'mars', 'europa', 'titan', 'umbriel'];
const BOSS_WORLDS = ['mars', 'europa', 'titan', 'umbriel'];
const POSITION_RATE = 0.1;    // send my position 10x per second
const POLL_RATE = 0.3;        // look for team changes 3x per second
const REMOTE_TIMEOUT = 6;     // seconds without news = hide that player

const BOSS_NAMES = {
  mars: 'ARES COLOSSUS',
  europa: 'CRYOLITH LEVIATHAN',
  titan: 'NITROGEN WRAITH',
  umbriel: 'NOCTURNUS, THE VOID SOVEREIGN'
};

const clone = value => (value === undefined ? undefined : structuredClone(value));

// Compares two values no matter in which order their keys were added.
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort()
      .filter(key => value[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

const same = (a, b) => stable(a) === stable(b);

// Chest/map progress: anything done by anyone counts for the team.
function mergeProgress(base = {}, extra = {}) {
  const result = {
    chestDetector: Boolean(base.chestDetector || extra.chestDetector),
    chests: { ...(base.chests || {}) },
    opened: { ...(base.opened || {}), ...(extra.opened || {}) },
    maps: { ...(base.maps || {}), ...(extra.maps || {}) }
  };

  for (const [planet, chest] of Object.entries(extra.chests || {})) {
    if (chest && !result.chests[planet]) result.chests[planet] = chest;
  }

  for (const planet of Object.keys(result.opened)) {
    if (result.opened[planet]) result.chests[planet] = null;
  }

  return result;
}

// api: see main.js (search "attachCoopGame").
export function attachCoopGame(api) {
  if (!session.role || !coopState.active) return null;

  const { partsSystem, chestQuest, moonSurface, bosses } = api;
  const scraps = moonSurface.scraps;
  const parts = () => partsSystem.getParts();

  let team = null;            // last official team state
  let attached = true;
  let applyingRemote = false;
  let positionTimer = 0;
  let pollTimer = 0;
  let teamDirty = false;      // host: send the team state soon
  let gotFirstTeam = false;
  let sentBossHp = '';        // host: last boss HP sent
  const remotes = new Map();  // id -> { target, shown, seen }
  const names = new Map();    // id -> name (kept after a player leaves)
  const announced = new Set(); // bosses whose defeat was already shown here
  const unsubscribe = [];

  // ---------- CREDITS: shared balance, sent as changes ----------
  let creditValue = Number(scraps.credits) || 0;

  Object.defineProperty(scraps, 'credits', {
    configurable: true,
    enumerable: true,
    get: () => creditValue,
    set(value) {
      const next = Number(value) || 0;
      const delta = next - creditValue;
      creditValue = next;
      if (attached && !applyingRemote && delta !== 0) send('credits', { delta });
    }
  });

  function setCreditsQuietly(value) {
    applyingRemote = true;
    scraps.credits = value;
    applyingRemote = false;
  }

  // ---------- local state -> patch ----------
  function localProgress() {
    return chestQuest.save();
  }

  // What this player has that the team state does not have yet.
  function diffLocal(base) {
    const patch = {};
    const local = parts();

    if (!base) return null;

    const known = new Set(base.inventory.map(part => part.id));
    const extra = local.inventory.filter(part => !known.has(part.id));
    if (extra.length) patch.inventory = clone(extra);

    if (!same(local.installed, base.installed)) patch.installed = clone(local.installed);

    const planet = api.getLandedPlanet();
    const teamItems = base.items[planet];
    if (teamItems) {
      const teamCollected = new Set(teamItems.filter(part => part.collected).map(part => part.id));
      const ids = new Set(teamItems.map(part => part.id));
      const collected = local.items
        .filter(part => part.collected && ids.has(part.id) && !teamCollected.has(part.id))
        .map(part => part.id);
      if (collected.length) patch.items = { planet, collected };
    }

    const merged = mergeProgress(base.progress, localProgress());
    if (!same(merged, base.progress)) patch.progress = localProgress();

    return Object.keys(patch).length ? patch : null;
  }

  function submit(patch) {
    if (!patch) return;
    if (isHost()) mergePatch(patch);
    else send('patch', patch, 'host');
  }

  // ---------- HOST: merge a patch into the team state ----------
  function mergePatch(patch) {
    if (!team || !patch || typeof patch !== 'object') return;

    if (Array.isArray(patch.inventory)) {
      const known = new Set(team.inventory.map(part => part.id));
      for (const part of patch.inventory) {
        if (part && part.id && !known.has(part.id)) {
          team.inventory.push({ id: part.id, type: part.type, rarity: part.rarity });
          known.add(part.id);
        }
      }
    }

    if (patch.installed && typeof patch.installed === 'object') {
      for (const type of partsSystem.types()) {
        if (typeof patch.installed[type] === 'string') team.installed[type] = patch.installed[type];
      }
    }

    if (patch.items && team.items[patch.items.planet]) {
      const wanted = new Set(patch.items.collected || []);
      for (const part of team.items[patch.items.planet]) {
        if (wanted.has(part.id)) part.collected = true;
      }
    }

    if (patch.progress) team.progress = mergeProgress(team.progress, patch.progress);

    teamDirty = true;
    applyTeam(team);
  }

  function broadcastTeam(to = null) {
    if (!team) return;
    team.credits = creditValue;
    team.players = coopState.players;
    send('team', team, to);
  }

  // ---------- everyone: use the team state ----------
  function applyTeam(next) {
    // First send anything we have that the team does not.
    if (!isHost()) submit(diffLocal(next));

    team = isHost() ? next : clone(next);
    setCoopPlayers(Math.max(coopState.players, Number(team.players) || 1));

    const local = parts();
    let modulesChanged = false;

    if (!same(local.inventory, team.inventory)) {
      local.inventory = clone(team.inventory);
      modulesChanged = true;
    }

    if (!same(local.installed, team.installed)) {
      for (const type of Object.keys(team.installed)) local.installed[type] = team.installed[type];
      modulesChanged = true;
    }

    for (const planet of WORLDS) {
      const items = team.items[planet];
      if (items && !same(api.getPlanetItems(planet), items)) api.setPlanetItems(planet, clone(items));
    }

    const progress = mergeProgress(team.progress, localProgress());
    if (!same(progress, localProgress())) chestQuest.load(progress);

    const state = api.getState();

    for (const planet of BOSS_WORLDS) {
      if (team.bossDefeated[planet]) {
        // Keep the death animation only if this player is watching it.
        const watching = state.mode === 'surface' && state.planet === planet;
        bosses[planet].markDefeated(!watching);
        api.unlockBossRarities(planet);

        if (!announced.has(planet)) {
          announced.add(planet);
          if (gotFirstTeam && !watching) {
            api.showTransmission(`YOUR TEAM DEFEATED ${BOSS_NAMES[planet]}\nITS REWARD LIES ON ${planet.toUpperCase()}`, '#f2d46f');
          }
        }
      } else if (Number.isFinite(team.bossHp[planet])) {
        bosses[planet].syncBossHp(team.bossHp[planet]);
      }
    }

    if (!gotFirstTeam && !isHost()) setCreditsQuietly(Number(team.credits) || 0);
    gotFirstTeam = true;

    if (modulesChanged) api.onModulesChanged();
    if (team.ending) api.playEnding();
  }

  // ---------- HOST: build the team state from the host's game ----------
  function createTeam() {
    const local = parts();
    const items = {};

    for (const planet of WORLDS) {
      const existing = api.getPlanetItems(planet);

      if (existing && existing.length) {
        items[planet] = clone(existing);
      } else {
        // Not visited yet: roll it now, once for everyone.
        items[planet] = generatePlanetParts(planet).map((part, i) => ({
          ...part,
          id: `${planet}-module-${i}-${Math.random().toString(36).slice(2, 8)}`
        }));
      }
    }

    const bossDefeated = {};
    const bossHp = {};
    for (const planet of BOSS_WORLDS) {
      bossDefeated[planet] = bosses[planet].isBossDefeated();
      bossHp[planet] = bosses[planet].getBossHp();
    }

    return {
      players: coopState.players,
      credits: creditValue,
      inventory: clone(local.inventory),
      installed: clone(local.installed),
      items,
      bossDefeated,
      bossHp,
      progress: localProgress(),
      ending: false
    };
  }

  // ---------- messages ----------
  unsubscribe.push(on('credits', data => {
    const delta = Number(data?.delta);
    if (!Number.isFinite(delta)) return;
    setCreditsQuietly(creditValue + delta);
  }));

  unsubscribe.push(on('team', data => {
    if (isHost() || !data || typeof data !== 'object') return;
    applyTeam(data);
  }));

  unsubscribe.push(on('patch', data => {
    if (isHost()) mergePatch(data);
  }));

  unsubscribe.push(on('need-team', (data, from) => {
    if (isHost()) broadcastTeam(from);
  }));

  unsubscribe.push(on('bossDmg', data => applyBossDamage(data?.planet, Number(data?.amount))));

  // Host -> everyone: the official boss HP (fixes any drift, e.g. after a
  // player slept and their copy of the boss came back at full HP).
  unsubscribe.push(on('bossHp', data => {
    if (isHost() || !team || !data) return;
    for (const planet of BOSS_WORLDS) {
      if (Number.isFinite(data[planet])) {
        team.bossHp[planet] = Math.min(team.bossHp[planet] ?? Infinity, data[planet]);
      }
    }
  }));

  unsubscribe.push(on('bossDown', data => {
    if (isHost()) hostBossDefeated(data);
  }));

  unsubscribe.push(on('ending', () => {
    if (team) team.ending = true;
    api.playEnding();
  }));

  unsubscribe.push(on('pos', (data, from) => {
    if (!data || from === session.myId) return;
    const remote = remotes.get(from) || { shown: null };
    remote.target = data;
    remote.seen = performance.now();
    if (!remote.shown) remote.shown = { ...data };
    remotes.set(from, remote);
  }));

  unsubscribe.push(on('downed', (data, from) => {
    api.showMessage(`${playerName(from)} WAS DOWNED · ${String(data?.cause || '').slice(0, 40)}`);
  }));

  unsubscribe.push(on('join', (data, from) => {
    if (!isHost()) return;
    setCoopPlayers(Math.max(coopState.players, session.players.length));
    broadcastTeam();
    api.showTransmission(`${playerName(from)} JOINED THE EXPEDITION`, playerColor(from));
  }));

  unsubscribe.push(on('leave', data => {
    const name = names.get(data?.id) || 'A PLAYER';
    remotes.delete(data?.id);
    api.showTransmission(`${name} LEFT THE EXPEDITION`, '#c9b8a0');
  }));

  unsubscribe.push(on('host-lost', () => {
    if (isHost()) return;
    detach();
    api.showTransmission('HOST DISCONNECTED\nTHE EXPEDITION CONTINUES IN SOLO MODE', '#e18b58');
  }));

  // ---------- bosses ----------
  function applyBossDamage(planet, amount) {
    if (!bosses[planet] || !Number.isFinite(amount) || amount <= 0) return;
    bosses[planet].applySharedDamage(amount);

    if (isHost() && team) {
      const hp = bosses[planet].getBossHp();
      if (hp !== null) team.bossHp[planet] = Math.min(team.bossHp[planet] ?? Infinity, hp);
    }
  }

  function hostBossDefeated(data) {
    const planet = data?.planet;
    if (!team || !BOSS_WORLDS.includes(planet) || team.bossDefeated[planet]) return;

    team.bossDefeated[planet] = true;
    team.bossHp[planet] = null;

    const rewards = Array.isArray(data.rewards) ? data.rewards.slice(0, 5) : [];
    rewards.forEach((reward, i) => {
      team.items[planet].push({
        id: `boss-reward-${planet}-${i}`,
        type: reward.type,
        rarity: reward.rarity,
        x: Math.round(reward.x),
        y: Math.round(reward.y),
        collected: false,
        reward: true
      });
    });

    teamDirty = true;
    applyTeam(team);
  }

  // ---------- presence ----------
  function myPresence() {
    const state = api.getState();
    const presence = {
      m: state.mode,
      p: state.planet,
      x: Math.round(state.x),
      y: Math.round(state.y),
      a: Math.round(state.angle * 100) / 100,
      mv: state.moving ? 1 : 0,
      hp: Math.round(state.health)
    };
    return presence;
  }

  function smoothRemotes(dt) {
    const now = performance.now();
    const blend = Math.min(1, dt * 12);

    for (const [id, remote] of remotes) {
      if (now - remote.seen > REMOTE_TIMEOUT * 1000 || !session.players.some(p => p.id === id)) {
        remotes.delete(id);
        continue;
      }

      const target = remote.target;
      const shown = remote.shown;

      // Teleports (landing, warping): jump straight there.
      if (shown.m !== target.m || shown.p !== target.p || Math.hypot(target.x - shown.x, target.y - shown.y) > 600) {
        remote.shown = { ...target };
        continue;
      }

      shown.x += (target.x - shown.x) * blend;
      shown.y += (target.y - shown.y) * blend;
      shown.a = target.a;
      shown.mv = target.mv;
      shown.hp = target.hp;
    }
  }

  // ---------- party strip (top left, above the ship status panel) ----------
  const panel = document.createElement('div');
  panel.id = 'coop-party';
  panel.style.cssText = `
    position:fixed; left:30px; top:14px; z-index:21; max-width:calc(50vw - 150px);
    display:flex; flex-wrap:wrap; align-items:center; gap:6px 14px;
    padding:8px 12px; background:rgba(0,0,0,.78); border:1px solid #3d4446;
    font:11px monospace; color:#cfd6d0; pointer-events:none; letter-spacing:1px;
  `;
  document.body.appendChild(panel);
  let panelText = '';

  const PLACE = { space: 'IN SPACE', surface: 'ON ', ship: 'IN SHIP · ', earth: 'EARTH SHIPYARD' };

  function updatePanel() {
    for (const player of session.players) names.set(player.id, player.name);

    const rows = session.players.map(player => {
      const me = player.id === session.myId;
      const info = me ? myPresence() : remotes.get(player.id)?.target;
      let where = 'CONNECTING…';

      if (info) {
        where = info.m === 'surface' || info.m === 'ship'
          ? PLACE[info.m] + String(info.p || '').toUpperCase()
          : PLACE[info.m] || 'IN SPACE';
      }

      return `<div><b style="color:${playerColor(player.id)}">${me ? '▶ ' : ''}${escapeHtml(player.name)}</b>` +
        ` <span style="color:#8a948d;font-size:10px">${where}${info && Number.isFinite(info.hp) ? ` · HP ${info.hp}` : ''}</span></div>`;
    });

    const html = `<div style="color:#999386;font-size:9px">CO-OP · ROOM ${session.code} · ${coopState.difficulty.label}</div>${rows.join('')}`;
    if (html !== panelText) {
      panelText = html;
      panel.innerHTML = html;
    }
  }

  // ---------- drawing other players ----------
  const onScreen = (x, y, width, height, margin = 40) =>
    x > -margin && y > -margin && x < width + margin && y < height + margin;

  function surfacePlayers() {
    const planet = api.getLandedPlanet();
    return [...remotes.entries()].filter(([, r]) => r.shown.m === 'surface' && r.shown.p === planet);
  }

  // Bodies are drawn with the world (they hide in the darkness like monsters).
  function drawSurfaceBodies(ctx, cameraX, cameraY, width, height) {
    for (const [id, remote] of surfacePlayers()) {
      const x = cameraX + remote.shown.x;
      const y = cameraY + remote.shown.y;
      if (!onScreen(x, y, width, height)) continue;

      ctx.save();
      ctx.strokeStyle = playerColor(id);
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 16, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      api.drawAstronaut(ctx, x, y, remote.shown.a);
    }
  }

  // Name tags and arrows are drawn above the darkness.
  function drawLabel(ctx, x, y, id, extra = '') {
    ctx.save();
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    const text = playerName(id) + extra;
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = 'rgba(0,0,0,.7)';
    ctx.fillRect(x - w / 2, y - 11, w, 14);
    ctx.fillStyle = playerColor(id);
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawEdgeArrow(ctx, dx, dy, width, height, id) {
    const angle = Math.atan2(dy, dx);
    const margin = 34;
    const cx = width / 2;
    const cy = height / 2;
    const scale = Math.min(
      (cx - margin) / Math.max(1, Math.abs(Math.cos(angle))),
      (cy - margin) / Math.max(0.0001, Math.abs(Math.sin(angle)))
    );
    const x = cx + Math.cos(angle) * scale;
    const y = cy + Math.sin(angle) * scale;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = playerColor(id);
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-6, -7);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    drawLabel(ctx, x - Math.cos(angle) * 26, y - Math.sin(angle) * 20 + 4, id, ` ${Math.round(Math.hypot(dx, dy))}m`);
  }

  function drawSurfaceLabels(ctx, cameraX, cameraY, width, height) {
    for (const [id, remote] of surfacePlayers()) {
      const x = cameraX + remote.shown.x;
      const y = cameraY + remote.shown.y;

      if (onScreen(x, y, width, height, -10)) drawLabel(ctx, x, y - 24, id);
      else drawEdgeArrow(ctx, x - width / 2, y - height / 2, width, height, id);
    }
  }

  function drawSpace(ctx, ship, width, height, sprite) {
    for (const [id, remote] of remotes) {
      if (remote.shown.m !== 'space') continue;

      const dx = remote.shown.x - ship.x;
      const dy = remote.shown.y - ship.y;
      const x = width / 2 + dx;
      const y = height / 2 + dy;

      if (!onScreen(x, y, width, height, -20)) {
        drawEdgeArrow(ctx, dx, dy, width, height, id);
        continue;
      }

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(remote.shown.a + Math.PI / 2);
      if (sprite && sprite.complete && sprite.naturalWidth > 0) {
        const scale = 64 / Math.max(sprite.naturalWidth, sprite.naturalHeight);
        ctx.drawImage(sprite, -sprite.naturalWidth * scale / 2, -sprite.naturalHeight * scale / 2,
          sprite.naturalWidth * scale, sprite.naturalHeight * scale);
      } else {
        ctx.fillStyle = playerColor(id);
        ctx.fillRect(-5, -18, 10, 30);
      }
      ctx.restore();

      drawLabel(ctx, x, y - 42, id);
    }
  }

  // ---------- every frame ----------
  function tick(dt) {
    if (!attached) return;

    smoothRemotes(dt);

    positionTimer -= dt;
    if (positionTimer <= 0) {
      positionTimer = POSITION_RATE;
      send('pos', myPresence());
      updatePanel();
    }

    pollTimer -= dt;
    if (pollTimer <= 0) {
      pollTimer = POLL_RATE;

      if (team) submit(diffLocal(team));
      else if (!isHost()) send('need-team', null, 'host');

      if (isHost() && teamDirty) {
        teamDirty = false;
        broadcastTeam();
      }

      if (team) {
        // A boss that came back at full HP (after sleeping) drops to the team HP.
        for (const planet of BOSS_WORLDS) {
          if (!team.bossDefeated[planet] && Number.isFinite(team.bossHp[planet])) {
            bosses[planet].syncBossHp(team.bossHp[planet]);
          }
        }

        if (isHost()) {
          const hp = stable(team.bossHp);
          if (hp !== sentBossHp) {
            sentBossHp = hp;
            send('bossHp', team.bossHp);
          }
        }
      }
    }
  }

  function detach() {
    attached = false;
    unsubscribe.forEach(fn => fn());
    remotes.clear();
    panel.remove();
    setCoopActive(false);
    if (api.onDetach) api.onDetach();
  }

  // ---------- start ----------
  if (isHost()) {
    team = createTeam();
    applyTeam(team);
    broadcastTeam();
  } else {
    send('need-team', null, 'host');
  }

  return {
    tick,
    drawSurfaceBodies,
    drawSurfaceLabels,
    drawSpace,
    isActive: () => attached,

    // Modules of a planet as the team knows them (null = not known).
    itemsFor: planet => (attached && team?.items[planet] ? clone(team.items[planet]) : null),

    reportBossDamage(planet, amount) {
      if (!attached) return;
      send('bossDmg', { planet, amount });
      if (isHost() && team) {
        const hp = bosses[planet]?.getBossHp();
        if (hp !== null && hp !== undefined) team.bossHp[planet] = Math.min(team.bossHp[planet] ?? Infinity, hp);
      }
    },

    // rewards = [{ x, y, type, rarity }]: the host places them once.
    reportBossDefeated(planet, rewards) {
      if (!attached) return;
      if (isHost()) hostBossDefeated({ planet, rewards });
      else send('bossDown', { planet, rewards }, 'host');
    },

    reportEnding() {
      if (!attached) return;
      if (team) team.ending = true;
      send('ending', null);
    },

    reportDowned(cause) {
      if (attached) send('downed', { cause });
    }
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
