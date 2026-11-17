// ==========================================
// CO-OP NETWORK LINKS
// Online: PeerJS (browser-to-browser WebRTC). The free PeerJS server is
// only used to introduce the players; game data then flows directly
// between the browsers. Works on GitHub Pages (no game server needed).
//
// Local test mode: add ?coop=local to the address. Tabs in the SAME
// browser then talk through a BroadcastChannel (no internet needed).
//
// Both return "links" with the same shape:
//   { id, send(object), onData(fn), onClose(fn), close() }
// ==========================================

const PEERJS_URL = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
const ROOM_PREFIX = 'nasareth-coop-';

export const useLocalTransport = () =>
  new URLSearchParams(location.search).get('coop') === 'local';

const randomId = () => Math.random().toString(36).slice(2, 10);

// Room codes avoid letters that look alike (0/O, 1/I/L).
export function makeRoomCode() {
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += letters[Math.floor(Math.random() * letters.length)];
  return code;
}

export const cleanRoomCode = text =>
  String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

function makeLink(id, sendRaw, closeRaw) {
  const dataHandlers = [];
  const closeHandlers = [];
  let closed = false;

  return {
    id,
    send(object) { if (!closed) sendRaw(object); },
    onData(fn) { dataHandlers.push(fn); },
    onClose(fn) { closeHandlers.push(fn); },
    close() { if (!closed) { closed = true; closeRaw(); closeHandlers.forEach(fn => fn()); } },
    // Used by the transports themselves.
    _receive(object) { if (!closed) dataHandlers.forEach(fn => fn(object)); },
    _closed() { if (!closed) { closed = true; closeHandlers.forEach(fn => fn()); } }
  };
}

// ---------- PEERJS (online) ----------
let peerLibrary = null;

function loadPeerJs() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (peerLibrary) return peerLibrary;

  peerLibrary = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PEERJS_URL;
    script.async = true;
    script.onload = () => (window.Peer ? resolve(window.Peer) : reject(Error('PeerJS did not load')));
    script.onerror = () => { peerLibrary = null; reject(Error('Could not download the multiplayer library. Check your internet connection.')); };
    document.head.appendChild(script);
  });

  return peerLibrary;
}

function peerErrorText(error) {
  if (error?.type === 'unavailable-id') return 'THAT ROOM CODE IS ALREADY IN USE';
  if (error?.type === 'peer-unavailable') return 'ROOM NOT FOUND · CHECK THE CODE';
  if (error?.type === 'network' || error?.type === 'server-error' || error?.type === 'socket-error') {
    return 'CANNOT REACH THE MULTIPLAYER SERVER · CHECK YOUR INTERNET';
  }
  if (error?.type === 'browser-incompatible') return 'THIS BROWSER DOES NOT SUPPORT MULTIPLAYER';
  return String(error?.message || error || 'CONNECTION FAILED').toUpperCase();
}

async function hostOnline(code, onGuest, onLost) {
  const Peer = await loadPeerJs();

  return new Promise((resolve, reject) => {
    const peer = new Peer(ROOM_PREFIX + code, { debug: 0 });
    let opened = false;

    peer.on('open', () => {
      opened = true;
      resolve({ close: () => peer.destroy() });
    });

    peer.on('connection', conn => {
      const link = makeLink(randomId(), data => conn.send(data), () => conn.close());
      conn.on('open', () => onGuest(link));
      conn.on('data', data => link._receive(data));
      conn.on('close', () => link._closed());
      conn.on('error', () => link._closed());
    });

    peer.on('error', error => {
      if (!opened) { peer.destroy(); reject(Error(peerErrorText(error))); }
      else console.warn('Multiplayer:', peerErrorText(error));
    });

    peer.on('disconnected', () => {
      // Lost the introduction server only: existing players stay connected.
      if (opened && !peer.destroyed) peer.reconnect();
    });

    peer.on('close', () => { if (opened) onLost(); });
  });
}

async function joinOnline(code) {
  const Peer = await loadPeerJs();

  return new Promise((resolve, reject) => {
    const peer = new Peer({ debug: 0 });
    let connected = false;
    const timer = setTimeout(() => {
      if (!connected) { peer.destroy(); reject(Error('ROOM NOT FOUND · CHECK THE CODE')); }
    }, 15000);

    peer.on('open', () => {
      const conn = peer.connect(ROOM_PREFIX + code, { reliable: true, serialization: 'json' });
      const link = makeLink('host', data => conn.send(data), () => { conn.close(); peer.destroy(); });

      conn.on('open', () => {
        connected = true;
        clearTimeout(timer);
        resolve(link);
      });
      conn.on('data', data => link._receive(data));
      conn.on('close', () => link._closed());
      conn.on('error', () => link._closed());
    });

    peer.on('error', error => {
      if (!connected) { clearTimeout(timer); peer.destroy(); reject(Error(peerErrorText(error))); }
    });
  });
}

// ---------- BROADCASTCHANNEL (same browser, for testing) ----------
function channel(code) {
  return new BroadcastChannel(ROOM_PREFIX + 'local-' + code);
}

async function hostLocal(code, onGuest) {
  const bus = channel(code);

  // Is another tab already hosting this code?
  const taken = await new Promise(resolve => {
    const probe = randomId();
    const timer = setTimeout(() => { bus.removeEventListener('message', listen); resolve(false); }, 300);
    function listen(event) {
      if (event.data?.kind === 'host-here' && event.data.to === probe) {
        clearTimeout(timer);
        bus.removeEventListener('message', listen);
        resolve(true);
      }
    }
    bus.addEventListener('message', listen);
    bus.postMessage({ kind: 'who-hosts', from: probe });
  });

  if (taken) { bus.close(); throw Error('THAT ROOM CODE IS ALREADY IN USE'); }

  const links = new Map();

  bus.addEventListener('message', event => {
    const message = event.data || {};

    if (message.kind === 'who-hosts') {
      bus.postMessage({ kind: 'host-here', to: message.from });
    } else if (message.kind === 'hello' && !links.has(message.from)) {
      const guestId = message.from;
      const link = makeLink(guestId,
        data => bus.postMessage({ kind: 'data', from: 'host', to: guestId, data }),
        () => { bus.postMessage({ kind: 'bye', from: 'host', to: guestId }); links.delete(guestId); });
      links.set(guestId, link);
      bus.postMessage({ kind: 'accept', to: guestId });
      onGuest(link);
    } else if (message.kind === 'data' && message.to === 'host') {
      links.get(message.from)?._receive(message.data);
    } else if (message.kind === 'bye' && message.to === 'host') {
      links.get(message.from)?._closed();
      links.delete(message.from);
    }
  });

  const announceClose = () => {
    for (const id of links.keys()) bus.postMessage({ kind: 'bye', from: 'host', to: id });
  };
  window.addEventListener('pagehide', announceClose);

  return { close: () => { announceClose(); bus.close(); } };
}

function joinLocal(code) {
  const bus = channel(code);
  const myId = randomId();

  return new Promise((resolve, reject) => {
    let link = null;
    const timer = setTimeout(() => {
      if (!link) { bus.close(); reject(Error('ROOM NOT FOUND · CHECK THE CODE')); }
    }, 1500);

    bus.addEventListener('message', event => {
      const message = event.data || {};
      if (message.to !== myId) return;

      if (message.kind === 'accept' && !link) {
        clearTimeout(timer);
        link = makeLink('host',
          data => bus.postMessage({ kind: 'data', from: myId, to: 'host', data }),
          () => { bus.postMessage({ kind: 'bye', from: myId, to: 'host' }); bus.close(); });
        window.addEventListener('pagehide', () => link.close());
        resolve(link);
      } else if (message.kind === 'data') {
        link?._receive(message.data);
      } else if (message.kind === 'bye') {
        link?._closed();
      }
    });

    bus.postMessage({ kind: 'hello', from: myId });
  });
}

// ---------- public ----------
// onGuest(link) runs for each player who connects. onLost() runs if the
// host's own connection dies. Resolves to { close() }.
export function openRoom(code, onGuest, onLost = () => {}) {
  return useLocalTransport() ? hostLocal(code, onGuest) : hostOnline(code, onGuest, onLost);
}

// Resolves to a link to the host.
export function joinRoom(code) {
  return useLocalTransport() ? joinLocal(code) : joinOnline(code);
}
