// Optional real-browser smoke test. Run with node tests/warp-browser-smoke.mjs.
// Uses an installed Chrome and the built-in DevTools protocol; no dependencies.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nasareth-warp-'));
const browserPath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
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
  await send('Runtime.enable');
  console.log('Browser connected.');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port });
  await wait(1000);
  await evaluate(`(async () => {
    localStorage.setItem('nasareth.pending-load', JSON.stringify({launchComplete:true,gameMode:'driving',gameMinutes:600,ship:{x:0,y:0,angle:-Math.PI/2},survival:{health:64,stamina:75,oxygen:82,shipOxygen:93,fuel:65,medkits:2},moon:{scraps:{credits:321},parts:{inventory:[{id:'test-engine',type:'engine',rarity:'rare'}],installed:{engine:'rare',fuelTank:'base',energyModule:'base',hullCargo:'base',computer:'base'}},progress:{opened:{moon:true,mars:true,europa:true,titan:true,umbriel:true}}}}));
    await import('./src/main.js');
    document.querySelector('#main-menu').style.display='none';
    document.querySelector('#game').classList.add('game-active');
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyT',key:'t'}));
    document.querySelector('.warp-go[data-id="mars"]').click();
    return true;
  })()`);
  console.log('Timelapse started.');
  await wait(2500);
  assert.equal(await evaluate(`NasarethGame.save('blocked-during-travel')`), null);
  assert.equal(await evaluate(`NasarethGame.pause()`), false);
  await evaluate(`for(const key of ['e','b','h','Escape','t']) window.dispatchEvent(new KeyboardEvent('keydown',{key,code:'Key'+key.toUpperCase(),cancelable:true}));`);
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  const screenshotPath = path.join(profile, 'timelapse.png');
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  await wait(4200);
  const arrivalScreenshot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(profile, 'arrival.png'), Buffer.from(arrivalScreenshot.data, 'base64'));
  await wait(1400);
  const saved = await evaluate(`NasarethGame.pause(); NasarethGame.save('arrival-check')`);
  assert.ok(saved);
  assert.equal(saved.snapshot.gameMode, 'driving');
  assert.equal(saved.snapshot.landedOnMoon, false);
  assert.equal(saved.snapshot.moon.progress.opened.mars, true);
  assert.equal(saved.snapshot.survival.health, 64);
  assert.equal(saved.snapshot.survival.stamina, 75);
  assert.equal(saved.snapshot.survival.oxygen, 82);
  assert.equal(saved.snapshot.survival.medkits, 2);
  assert.equal(saved.snapshot.moon.scraps.credits, 321);
  assert.equal(saved.snapshot.moon.parts.installed.engine, 'rare');
  assert.equal(saved.snapshot.moon.parts.inventory[0].id, 'test-engine');
  assert.ok(Number.isFinite(saved.snapshot.ship.x));
  await evaluate(`NasarethGame.resume();window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyT',key:'t'}));document.querySelector('.warp-go[data-id="earth"]').click();`);
  await wait(8100);
  assert.equal(await evaluate(`!![...document.querySelectorAll('button')].find(b => b.id === 'earth-launch' && b.offsetParent)`), true);
  assert.deepEqual(errors, []);
  console.log('PASS: browser timelapse, input/save lock, orbit arrival, repeated travel to Earth shipyard, preserved inventory/modules/stats/progress, no runtime exceptions.');
  console.log('Screenshot: ' + screenshotPath);
} finally {
  socket?.close();
  browser.kill();
  server.close();
  server.closeAllConnections();
}
