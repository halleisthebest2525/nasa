// ==========================================
// CO-OP SESSION (lobby + message relay)
// The host's browser is the hub: guests only talk to the host, and the
// host passes every message on to the other guests.
//
// Message frame: { t: type, d: data, from: playerId, to: playerId|null }
// Player ids: 'host' for the host, a random id for each guest.
// ==========================================

import { openRoom, joinRoom, makeRoomCode, cleanRoomCode } from './net.js';
import { MAX_PLAYERS } from './difficulty.js';

export const PLAYER_COLORS = ['#f2d46f', '#71b9e8', '#e07a6a', '#8fd59a'];

const handlers = new Map();      // type -> Set of fn(data, from)
const rosterHandlers = new Set();

export const session = {
  role: null,        // 'host' | 'guest' | null
  code: '',
  myId: null,
  myName: '',
  players: [],       // [{ id, name, index }]
  started: false,
  startInfo: null,
  // Host only.
  room: null,
  links: new Map(),  // guestId -> link
  // Guest only.
  hostLink: null
};

export const isInSession = () => session.role !== null;
export const isHost = () => session.role === 'host';

export const cleanName = text =>
  String(text || '').replace(/[^\w .\-가-힣]/g, '').trim().slice(0, 14) || 'PILOT';

export function playerColor(id) {
  const player = session.players.find(p => p.id === id);
  return PLAYER_COLORS[player ? player.index : 0];
}

export function playerName(id) {
  return session.players.find(p => p.id === id)?.name || 'PILOT';
}

export function on(type, fn) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(fn);
  return () => handlers.get(type).delete(fn);
}

export function onRoster(fn) {
  rosterHandlers.add(fn);
  return () => rosterHandlers.delete(fn);
}

function emit(type, data, from) {
  for (const fn of handlers.get(type) || []) {
    try { fn(data, from); } catch (error) { console.error(`Co-op handler "${type}" failed:`, error); }
  }
}

function emitRoster() {
  for (const fn of rosterHandlers) {
    try { fn(session.players); } catch (error) { console.error('Co-op roster handler failed:', error); }
  }
}

// ---------- sending ----------
// to = null: everyone else. to = an id: only that player.
export function send(type, data = null, to = null) {
  if (!session.role) return;
  const frame = { t: type, d: data, from: session.myId, to };

  if (session.role === 'host') {
    for (const [id, link] of session.links) {
      if (!to || to === id) link.send(frame);
    }
  } else if (session.hostLink) {
    session.hostLink.send(frame);
  }
}

// ---------- host ----------
function broadcastRoster() {
  send('roster', { players: session.players });
  emitRoster();
}

function freeIndex() {
  for (let i = 1; i < MAX_PLAYERS; i++) {
    if (!session.players.some(p => p.index === i)) return i;
  }
  return -1;
}

function acceptGuest(link) {
  let joined = false;

  link.onData(frame => {
    if (!frame || typeof frame !== 'object') return;

    if (frame.t === 'hello') {
      if (joined) return;
      const index = freeIndex();

      if (index < 0) {
        link.send({ t: 'full', d: null, from: 'host', to: link.id });
        setTimeout(() => link.close(), 300);
        return;
      }

      joined = true;
      session.links.set(link.id, link);
      session.players.push({ id: link.id, name: cleanName(frame.d?.name), index });
      link.send({
        t: 'welcome',
        d: { id: link.id, players: session.players, started: session.started, startInfo: session.startInfo },
        from: 'host',
        to: link.id
      });
      broadcastRoster();
      emit('join', { id: link.id }, link.id);
      return;
    }

    if (!joined) return;

    // Never trust the sender field: the host knows who sent it.
    const relayed = { t: frame.t, d: frame.d, from: link.id, to: frame.to || null };

    if (!relayed.to || relayed.to === 'host') emit(relayed.t, relayed.d, relayed.from);

    if (relayed.to !== 'host') {
      for (const [id, other] of session.links) {
        if (id !== link.id && (!relayed.to || relayed.to === id)) other.send(relayed);
      }
    }
  });

  link.onClose(() => {
    if (!session.links.has(link.id)) return;
    session.links.delete(link.id);
    session.players = session.players.filter(p => p.id !== link.id);
    broadcastRoster();
    send('leave', { id: link.id });
    emit('leave', { id: link.id }, link.id);
  });
}

export async function hostSession(name) {
  leaveSession();

  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = makeRoomCode();

    try {
      const room = await openRoom(code, acceptGuest, () => emit('host-lost', null, 'host'));
      session.role = 'host';
      session.code = code;
      session.myId = 'host';
      session.myName = cleanName(name);
      session.players = [{ id: 'host', name: session.myName, index: 0 }];
      session.room = room;
      emitRoster();
      return code;
    } catch (error) {
      lastError = error;
      if (!/IN USE/.test(error.message)) break;
    }
  }

  throw lastError || Error('COULD NOT OPEN A ROOM');
}

export function startSession(info) {
  if (session.role !== 'host') return;
  session.started = true;
  session.startInfo = info;
  send('start', info);
}

// ---------- guest ----------
export async function joinSession(code, name) {
  leaveSession();

  const room = cleanRoomCode(code);
  if (room.length < 4) throw Error('ENTER THE ROOM CODE FROM THE HOST');

  const link = await joinRoom(room);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { link.close(); reject(Error('THE HOST DID NOT ANSWER')); }, 10000);
    let welcomed = false;

    link.onData(frame => {
      if (!frame || typeof frame !== 'object') return;

      if (frame.t === 'full') {
        clearTimeout(timer);
        reject(Error('THAT ROOM IS FULL (4 PLAYERS MAX)'));
        return;
      }

      if (frame.t === 'welcome' && !welcomed) {
        welcomed = true;
        clearTimeout(timer);
        session.role = 'guest';
        session.code = room;
        session.myId = frame.d.id;
        session.myName = cleanName(name);
        session.players = frame.d.players || [];
        session.started = Boolean(frame.d.started);
        session.startInfo = frame.d.startInfo || null;
        session.hostLink = link;
        emitRoster();
        resolve({ started: session.started, startInfo: session.startInfo });
        return;
      }

      if (!welcomed) return;

      if (frame.t === 'roster') {
        session.players = frame.d.players || [];
        emitRoster();
      } else if (frame.t === 'start') {
        session.started = true;
        session.startInfo = frame.d;
      }

      emit(frame.t, frame.d, frame.from);
    });

    link.onClose(() => {
      if (!welcomed) { clearTimeout(timer); reject(Error('CONNECTION CLOSED')); return; }
      if (session.hostLink !== link) return;
      session.hostLink = null;
      emit('host-lost', null, 'host');
    });

    link.send({ t: 'hello', d: { name: cleanName(name) }, from: null, to: 'host' });
  });
}

// ---------- leaving ----------
export function leaveSession() {
  if (session.role === 'host') {
    for (const link of session.links.values()) link.close();
    session.room?.close();
  } else if (session.role === 'guest') {
    const link = session.hostLink;
    session.hostLink = null;
    link?.close();
  }

  session.role = null;
  session.code = '';
  session.myId = null;
  session.players = [];
  session.started = false;
  session.startInfo = null;
  session.room = null;
  session.links = new Map();
  emitRoster();
}
