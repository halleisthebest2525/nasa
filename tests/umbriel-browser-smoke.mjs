// Optional real-browser smoke test for Umbriel's monsters:
//   node tests/umbriel-browser-smoke.mjs [screenshot-folder]
// Uses an installed Chrome and the built-in DevTools protocol; no dependencies.
// Flies to Umbriel with the admin panel, lands, teleports to Nocturnus and
// checks that the fight runs (phase 1, then the phase 3 Eclipse) without
// runtime errors. Screenshots are written when a folder is given.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const shots = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nasareth-umbriel-'));
const browserPath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const server = http.createServer((req, res) => {
  const requested = decodeURIComponent(req.url.split('?')[0]);
  const file = path.resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.mp3': 'audio/mpeg' })[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = spawn(browserPath, ['--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,800', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Browser startup timed out')), 20000);
    browser.on('error', reject);
    browser.stderr.on('data', chunk => {
      const match = chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  const pages = await (await fetch('http://' + new URL(endpoint).host + '/json')).json();
  socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let serial = 0;
  const pending = new Map(), errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.id) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timeout = setTimeout(() => { pending.delete(id); reject(Error('DevTools timed out: ' + method)); }, 30000);
    pending.set(id, { resolve(value) { clearTimeout(timeout); resolve(value); }, reject(error) { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (expression, limit = 15000, step = 200) => {
    const deadline = Date.now() + limit;
    while (Date.now() < deadline) { const v = await evaluate(expression); if (v) return v; await wait(step); }
    throw Error('Timed out waiting for ' + expression);
  };
  const shot = async name => {
    if (!shots) return;
    const image = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(shots, name + '.png'), Buffer.from(image.data, 'base64'));
  };
  const adminClick = label => evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.startsWith(${JSON.stringify(label)}));
    if (!button) return 'NO BUTTON ' + ${JSON.stringify(label)};
    button.click();
    return button.parentElement.querySelector('div:last-child')?.textContent || 'clicked';
  })()`);

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/' });
  await wait(1000);

  // Every Umbriel frame must be served (assets.txt and the files agree).
  const missing = await evaluate(`(async () => {
    const text = await (await fetch('./assets.txt')).text();
    const lines = text.split(/\\r?\\n/).filter(l => l.startsWith('umbriel_'));
    const bad = [];
    for (const line of lines) {
      const url = line.split('=')[1];
      const ok = await new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth > 0); i.onerror = () => r(false); i.src = url; });
      if (!ok) bad.push(url);
    }
    return { count: lines.length, bad };
  })()`);
  assert.equal(missing.count, 73, 'assets.txt should list 73 Umbriel frames');
  assert.deepEqual(missing.bad, []);

  // A flying save with every star map, straight into space.
  await evaluate(`(async () => {
    localStorage.setItem('nasareth.pending-load', JSON.stringify({launchComplete:true,gameMode:'driving',gameMinutes:600,ship:{x:0,y:0,angle:-Math.PI/2},survival:{health:100,stamina:100,oxygen:100,shipOxygen:100,fuel:100,medkits:2},moon:{scraps:{credits:321},parts:{inventory:[],installed:{engine:'base',fuelTank:'base',energyModule:'base',hullCargo:'base',computer:'base'}},progress:{chestDetector:true,opened:{moon:true,mars:true,europa:true,titan:true},maps:{mars:true,europa:true,titan:true,umbriel:true}}}}));
    await import('./src/main.js');
    document.querySelector('#main-menu').style.display='none';
    document.querySelector('#game').classList.add('game-active');
    window.__NASA_ADMIN__.skipGauges = true;
    window.__NASA_ADMIN__.god = true;
    return true;
  })()`);
  await until('!!window.NasarethGame');

  console.log('FLY:', await adminClick('FLY TO UMBRIEL'));
  await wait(300);
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE',key:'e'}))`);

  // Landing is done when the boss teleport works.
  const landed = await until(`(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.startsWith('GO TO BOSS'));
    button.click();
    const status = button.parentElement.querySelector('div:last-child')?.textContent || '';
    return status.includes('TELEPORTED') ? status : '';
  })()`, 20000, 500);
  console.log('LAND:', landed);

  // Phase 1: the boss wakes up and fights.
  const seenStates = new Set();
  const deadline = Date.now() + 9000;
  let info;
  while (Date.now() < deadline) {
    info = await evaluate('NasarethGame.debugUmbriel()');
    seenStates.add(info.boss.state);
    if (info.boss.state === 'pulse' || info.boss.state === 'shard') { await shot('umbriel-phase1-attack'); }
    await wait(150);
  }
  await shot('umbriel-phase1');
  console.log('PHASE 1:', JSON.stringify({ boss: info.boss, reavers: info.stalkers.length, effects: info.effects, states: [...seenStates] }));
  assert.equal(info.boss.alerted, true, 'the boss should be fighting');
  assert.ok(info.stalkers.length >= 14);
  assert.ok(seenStates.has('pulse') || seenStates.has('shard'), 'no phase 1 ability was seen');

  // Phase 3: the Eclipse Collapse.
  await evaluate('NasarethGame.debugUmbrielBossHp(30)');
  const eclipse = await until(`(() => { const b = NasarethGame.debugUmbriel().boss; return b && b.state === 'eclipseCharge' ? b : null; })()`, 25000, 100);
  await wait(1500);
  await shot('umbriel-eclipse');
  console.log('ECLIPSE:', JSON.stringify(eclipse));
  const recovered = await until(`(() => { const b = NasarethGame.debugUmbriel().boss; return b && b.state === 'eclipseRecover' ? b : null; })()`, 10000, 100);
  await shot('umbriel-exposed');
  console.log('EXPOSED:', JSON.stringify(recovered));

  assert.deepEqual(errors.map(e => e.text + ' ' + (e.exception?.description || '')), []);
  console.log('PASS: Umbriel monsters load, Nocturnus fights through phase 1 and the Eclipse without errors.');
} finally {
  socket?.close();
  browser.kill();
  server.close();
  server.closeAllConnections();
}
