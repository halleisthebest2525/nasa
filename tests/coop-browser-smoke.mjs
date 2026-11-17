// Real-browser check of 2-player co-op, using the local test link
// (two tabs in one browser talk through a BroadcastChannel):
//   node tests/coop-browser-smoke.mjs [screenshot-folder]
// Uses an installed Chrome and the DevTools protocol; no dependencies.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const shots = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nasareth-coop-'));
const browserPath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.mp3': 'audio/mpeg' };

const server = http.createServer((req, res) => {
  const requested = decodeURIComponent(req.url.split('?')[0]);
  const file = path.resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    // Test handles exist only in this test server, never in the game files.
    if (file === path.join(root, 'src', 'main.js')) {
      data = Buffer.concat([data, Buffer.from('\nwindow.__coopTest = { get coop() { return coop; }, marsMonsters, partsSystem, moonSurface, landed: () => landedPlanet };\n')]);
    }
    res.end(data);
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = spawn(browserPath, [
  '--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
  '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720',
  // Both tabs must keep running their game loops.
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--user-data-dir=' + profile, 'about:blank'
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const pages = [];

// Each player gets their own WINDOW (a background tab would pause its game loop).
let browserSocket = null;
let browserSerial = 0;

async function newWindow() {
  if (!browserSocket) {
    browserSocket = new WebSocket(endpoint);
    await new Promise(resolve => browserSocket.addEventListener('open', resolve, { once: true }));
  }
  const id = ++browserSerial;
  const reply = new Promise(resolve => {
    browserSocket.addEventListener('message', function listen(event) {
      const message = JSON.parse(event.data);
      if (message.id === id) { browserSocket.removeEventListener('message', listen); resolve(message.result); }
    });
  });
  browserSocket.send(JSON.stringify({ id, method: 'Target.createTarget', params: { url: 'about:blank', newWindow: true } }));
  const { targetId } = await reply;
  const list = await (await fetch(`http://${new URL(endpoint).host}/json`)).json();
  return list.find(item => item.id === targetId);
}

async function openPage(url) {
  const target = await newWindow();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let serial = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const until = async (expression, label, ms = 15000) => {
    const deadline = Date.now() + ms;
    while (!await evaluate(expression)) {
      if (Date.now() > deadline) {
        const status = await evaluate('[location.href, document.querySelector("#coop-status")?.textContent, document.querySelector("#lobby-status")?.textContent].join(" | ")');
        throw Error(`Timed out: ${label} (${status}) ${errors.join(' ; ')}`);
      }
      await wait(150);
    }
  };
  const shot = async name => {
    if (!shots) return;
    await send('Page.bringToFront');
    const image = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(shots, name + '.png'), Buffer.from(image.data, 'base64'));
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await wait(800);
  const page = { send, evaluate, until, shot, errors, socket };
  pages.push(page);
  return page;
}

let endpoint;
try {
  endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Browser startup timed out')), 20000);
    browser.on('error', reject);
    browser.stderr.on('data', chunk => {
      const match = chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });

  // ---------- HOST (tab A) ----------
  const a = await openPage(`${base}/?coop=local`);
  await a.until('!!document.querySelector("#multiplayer-button")', 'menu A');
  // A saved expedition on Mars, standing near the Ares Colossus lair.
  await a.evaluate(`localStorage.setItem('nasareth.saves.v1', JSON.stringify([{ id: 'coop-test', name: 'Coop Test', savedAt: new Date().toISOString(), snapshot: {
    launchComplete: true, gameMode: 'moon', landedPlanet: 'mars', landedOnMoon: true, gameMinutes: 600, hull: 100,
    ship: { x: 0, y: 0, angle: -Math.PI / 2 },
    survival: { health: 100000, stamina: 100, oxygen: 100, shipOxygen: 100, fuel: 100, medkits: 2 },
    moon: { x: -2650, y: -2600, scraps: { credits: 321 },
      parts: { inventory: [], installed: { engine: 'base', fuelTank: 'base', energyModule: 'base', hullCargo: 'base', computer: 'base' } },
      progress: { chestDetector: true, opened: { moon: true }, maps: { mars: true } } }
  } }]))`);
  await a.evaluate(`(() => {
    document.querySelector('#multiplayer-button').click();
    document.querySelector('#coop-name').value = 'Alpha';
    document.querySelector('#coop-host').click();
  })()`);
  await a.until('/^[A-Z0-9]{5}$/.test(document.querySelector("#lobby-code").textContent)', 'room code');
  const code = await a.evaluate('document.querySelector("#lobby-code").textContent');
  assert.equal(await a.evaluate('document.querySelector("#lobby-start-new").disabled'), true, 'cannot start alone');

  // ---------- GUEST (tab B) ----------
  const b = await openPage(`${base}/?coop=local`);
  await b.until('!!document.querySelector("#multiplayer-button")', 'menu B');
  await b.evaluate(`(() => {
    document.querySelector('#multiplayer-button').click();
    document.querySelector('#coop-name').value = 'Bravo';
    document.querySelector('#coop-code').value = ${JSON.stringify(code.toLowerCase())};
    document.querySelector('#coop-join').click();
  })()`);
  await a.until('document.querySelectorAll("#lobby-players .coop-player").length === 2', 'host sees 2 players');
  await b.until('!document.querySelector("#view-lobby").hidden', 'guest lobby');
  assert.match(await a.evaluate('document.querySelector("#lobby-difficulty").textContent'), /2 PLAYERS · BOSS HP x1\.8 · BOSS DAMAGE x1\.20/);
  assert.equal(await b.evaluate('document.querySelector("#lobby-host-actions").style.display'), 'none', 'guests cannot start');
  await a.shot('coop-lobby');

  // Host continues the saved game; the guest joins it (no prologue).
  await a.evaluate('document.querySelector("#lobby-start-save").click()');
  await a.until('!!window.__coopTest?.coop', 'host game');
  await b.until('!!window.__coopTest?.coop', 'guest game');

  // ---------- shared credits ----------
  await b.until('window.__coopTest.moonSurface.scraps.credits === 321', 'guest receives team credits');
  await a.evaluate('window.__coopTest.moonSurface.scraps.credits += 50');
  await b.until('window.__coopTest.moonSurface.scraps.credits === 371', 'guest sees host income');
  await b.evaluate('window.__coopTest.moonSurface.scraps.credits -= 21');
  await a.until('window.__coopTest.moonSurface.scraps.credits === 350', 'host sees guest spending');

  // ---------- same modules on every planet ----------
  const ids = side => side.evaluate(`['moon','mars','europa','titan','umbriel'].map(p => window.__coopTest.coop.itemsFor(p).map(i => i.id).join())`);
  await b.until('!!window.__coopTest.coop.itemsFor("mars")', 'guest team items');
  assert.deepEqual(await ids(b), await ids(a), 'every player sees the same modules');

  // A guest pick-up (on the planet the guest is on) counts for the whole team.
  const guestPlanet = await b.evaluate('window.__coopTest.landed()');
  const picked = await b.evaluate(`(() => {
    const parts = window.__coopTest.partsSystem.getParts();
    const part = parts.items.find(item => !item.collected);
    part.collected = true;
    parts.inventory.push({ id: part.id, type: part.type, rarity: part.rarity });
    return part.id;
  })()`);
  await a.until(`window.__coopTest.coop.itemsFor(${JSON.stringify(guestPlanet)}).some(i => i.id === ${JSON.stringify(picked)} && i.collected)`, 'host sees module collected');
  await a.until(`window.__coopTest.partsSystem.getParts().inventory.some(i => i.id === ${JSON.stringify(picked)})`, 'module in team inventory');

  // ---------- harder boss, shared HP ----------
  const bossHp = side => side.evaluate('window.__coopTest.marsMonsters.list().boss?.hp ?? null');
  assert.equal(await bossHp(a), 50, '2-player Ares Colossus has 28 x 1.8 HP');
  assert.equal(await bossHp(b), 50);
  await a.evaluate(`(() => { const m = window.__coopTest.marsMonsters, boss = m.list().boss;
    m.strike({ x: boss.x, y: boss.y, range: 120, damage: 5 }); })()`);
  await b.until('window.__coopTest.marsMonsters.list().boss.hp === 45', 'guest sees host hit');
  await b.evaluate(`(() => { const m = window.__coopTest.marsMonsters, boss = m.list().boss;
    m.strike({ x: boss.x, y: boss.y, range: 120, damage: 4 }); })()`);
  await a.until('window.__coopTest.marsMonsters.list().boss.hp <= 41', 'host sees guest hit');

  // ---------- co-op special skill (host stands next to the boss) ----------
  await a.send('Page.bringToFront');
  await a.until('/METEOR STORM/.test(window.__coopTest.moonSurface.scraps.pickupMessage) && window.__coopTest.moonSurface.scraps.pickupTimer > 0',
    'Ares Colossus uses METEOR STORM', 20000);
  await a.shot('coop-meteor-storm');
  assert.match(await b.evaluate('document.querySelector("#coop-party").textContent'), /Alpha.*ON MARS/, 'guest sees where the host is');

  // ---------- team boss kill ----------
  await a.evaluate(`(() => { const m = window.__coopTest.marsMonsters, boss = m.list().boss;
    m.strike({ x: boss.x, y: boss.y, range: 120, damage: 999 }); })()`);
  await b.until('window.__coopTest.marsMonsters.isBossDefeated()', 'guest gets the boss kill', 20000);
  await b.until(`window.__coopTest.coop.itemsFor('mars').some(i => i.id === 'boss-reward-mars-0' && i.rarity === 'mythic')`, 'boss reward placed once for the team');
  assert.equal((await a.evaluate(`window.__coopTest.coop.itemsFor('mars').filter(i => i.reward).length`)), 1, 'exactly one reward');

  // ---------- the ending plays for everyone ----------
  await b.evaluate('window.__coopTest.coop.reportEnding()');
  await a.until('!!document.querySelector(".nso-stage")', 'host sees the ending');

  assert.deepEqual(a.errors, [], 'host has no runtime errors');
  assert.deepEqual(b.errors, [], 'guest has no runtime errors');
  console.log('PASS: lobby (2 players, difficulty shown, only host starts), host continues a saved game, shared credits both ways, identical planet modules, shared pick-ups, 2-player boss HP x1.8 with hits shared both ways, METEOR STORM special skill, one team boss reward, ending for everyone, no runtime errors.');
} finally {
  for (const page of pages) page.socket.close();
  browserSocket?.close();
  browser.kill();
  server.close();
  await wait(500);
  fs.rmSync(profile, { recursive: true, force: true });
}
