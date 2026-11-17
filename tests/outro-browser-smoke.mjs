// Optional real-browser check of the final cutscene:
//   node tests/outro-browser-smoke.mjs [screenshot-folder]
// Uses an installed Chrome and the DevTools protocol; no dependencies.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const integration = process.argv.includes('--integration');
const shotsArg = process.argv.slice(2).find(arg => !arg.startsWith('--'));
const shots = shotsArg ? path.resolve(shotsArg) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nasareth-outro-'));
const browserPath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const requested = decodeURIComponent(req.url.split('?')[0]);
  const file = path.resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    // Expose setup handles only in this test server, never in the game files.
    if (integration && file === path.join(root, 'src', 'main.js')) {
      data = Buffer.concat([data, Buffer.from('\nwindow.__outroTest = { partsSystem, earthBase };\n')]);
    }
    res.end(data);
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = spawn(browserPath, ['--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
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
  const pending = new Map(), errors = [], warnings = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled' && ['warning', 'error'].includes(message.params.type)) warnings.push(message.params.args.map(a => a.value).join(' '));
    if (message.id) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timeout = setTimeout(() => { pending.delete(id); reject(Error('DevTools timed out: ' + method)); }, 60000);
    pending.set(id, { resolve(value) { clearTimeout(timeout); resolve(value); }, reject(error) { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const size = (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const shot = async name => {
    if (!shots) return;
    const image = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(shots, name + '.png'), Buffer.from(image.data, 'base64'));
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await size(1280, 720);
  if (integration) {
    await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/' });
    await wait(800);
    await evaluate(`(async () => {
      localStorage.setItem('nasareth.pending-load', JSON.stringify({ launchComplete: true }));
      await import('./src/main.js');
      document.querySelector('#main-menu').classList.add('menu-hidden');
      const { partsSystem, earthBase } = window.__outroTest;
      for (const type of partsSystem.types()) {
        partsSystem.getParts().inventory.push({ type, rarity: 'legendary' });
      }
      earthBase.open();
    })()`);
    const types = await evaluate('window.__outroTest.partsSystem.types()');
    assert.equal(types.length, 5);
    assert.equal(await evaluate('!!document.querySelector(".nso-stage")'), false, 'owning modules alone does not trigger the ending');
    const click = async selector => {
      const point = await evaluate(`(() => {
        const node = document.querySelector(${JSON.stringify(selector)});
        node.scrollIntoView({ block: 'center' });
        const r = node.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()`);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    };
    for (const type of types.slice(0, -1)) {
      await click(`.earth-part[data-type="${type}"][data-rarity="legendary"]`);
      assert.equal(await evaluate('!!document.querySelector(".nso-stage")'), false, 'partial fitting does not trigger the ending');
    }
    await click(`.earth-part[data-type="${types.at(-1)}"][data-rarity="legendary"]`);
    console.log('Fitted modules:', await evaluate('window.__outroTest.partsSystem.getInstalled()'));
    console.log('Browser errors:', errors.map(e => e.exception?.description || e.text), warnings);
    const deadline = Date.now() + 15000;
    while (!await evaluate('!!document.querySelector(".nso-stage")?.__outro?.scene')) {
      if (Date.now() > deadline) throw Error('Final legendary fitting did not start the cutscene');
      await wait(100);
    }
    assert.equal(await evaluate('document.querySelectorAll(".nso-stage").length'), 1);
    const before = await evaluate('document.querySelector(".nso-stage").__outro.time');
    await wait(1000);
    assert.ok(await evaluate('document.querySelector(".nso-stage").__outro.time') > before + 500, 'cutscene clock advances');
    await click('.nso-skip');
    await wait(400);
    assert.equal(await evaluate('!!document.querySelector(".nso-stage")'), false);
    await wait(3000);
    const credits = await evaluate(`(() => {
      const root = document.querySelector('#end-credits').shadowRoot;
      return {
        credits: [...root.querySelectorAll('.credit')].map(c => [c.querySelector('.role')?.textContent || '', c.querySelector('.name').textContent]),
        crawling: root.querySelector('#stage').classList.contains('play')
      };
    })()`);
    assert.deepEqual(credits.credits, [
      ['Developer', 'Winston Lee'],
      ['Developer', 'Brandon Kim'],
      ['Main Tester', 'Harang You'],
      ['Art, Co-Developer', 'Jinmo Koo'],
      ['Audio Director', 'Dylan Son'],
      ['Manager, Editor', 'Daniel Kim'],
      ['', 'Students of Fayston Preparatory of Suji']
    ]);
    assert.ok(credits.crawling, 'credits crawl like the prologue');
    await wait(6000);
    await shot('end-credits');
    await size(390, 844);
    await wait(100);
    assert.equal(await evaluate(`(() => {
      const root = document.querySelector('#end-credits').shadowRoot;
      const r = root.querySelector('.crawl').getBoundingClientRect();
      const b = root.querySelector('button').getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && b.right <= innerWidth && b.bottom <= innerHeight;
    })()`), true, 'credits and Continue stay on screen in portrait');
    await shot('end-credits-portrait');
    await size(1280, 720);
    const continuePoint = await evaluate(`(() => {
      const r = document.querySelector('#end-credits').shadowRoot.querySelector('button').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...continuePoint });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...continuePoint });
    assert.equal(await evaluate('!!document.querySelector("#end-credits")'), false);
    assert.equal(await evaluate('window.__outroTest.earthBase.isOpen()'), true);
    await click(`.earth-part[data-type="${types[0]}"][data-rarity="legendary"]`);
    assert.equal(await evaluate('!!document.querySelector(".nso-stage")'), false, 'refitting does not replay the ending');
    const saved = await evaluate('window.NasarethGame.save("Ending integration test")');
    assert.equal(saved.snapshot.outroPlayed, true, 'ending flag persists in the save');
    assert.deepEqual(errors.map(e => e.exception?.description || e.text), []);
    assert.deepEqual(warnings, []);
    console.log('PASS: fitting all five legendary modules starts the ending; credits crawl with the exact names in desktop and portrait; Continue returns to the shipyard; refitting does not replay; completion saves.');
  } else {
  await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/NASARETH_FINAL_CUTSCENE/index.html' });
  await wait(800);
  await evaluate(`import('./cutscene.js').then(m => { window.__outro = m; return m.preloadOutro(); }).then(list => list.filter(Boolean).length)`)
    .then(count => assert.equal(count, 23, 'all 23 illustrations load'));

  // 1. Key moments, each started at its own time (startAt), then screenshotted.
  const moments = [
    ['01-earth', 2500], ['02-modules-panel', 8200], ['03-commander-panel', 12600], ['04-genesis', 18400],
    ['07-asteroid', 32800], ['09-alert-panel', 43500], ['12-helmet', 57500], ['13-authorize', 63400],
    ['14-awakens', 68600], ['15-launch', 72000], ['18-engines-panel', 88200], ['19-before', 92600],
    ['19-flash', 93500], ['20-silence', 101500], ['21-diverted', 108500], ['22-watch', 112500], ['23-title', 121500]
  ];
  for (const [name, at] of moments) {
    await evaluate(`window.__done = null; window.__outro.playOutro({ startAt: ${at}, audio: false, onComplete: r => { window.__done = r; } }); true`);
    await wait(name === '19-flash' ? 150 : 1300);
    const info = await evaluate(`(() => {
      const s = document.querySelector('.nso-stage');
      const cap = document.querySelector('.nso-cap.nso-show');
      const art = document.querySelector('.nso-art').getBoundingClientRect();
      const caps = document.querySelector('.nso-captions');
      return { scene: s.__outro.scene, layers: s.__outro.layers,
        caption: cap ? cap.textContent : null,
        capZ: getComputedStyle(caps).zIndex, artZ: getComputedStyle(document.querySelector('.nso-art')).zIndex,
        art: [Math.round(art.left), Math.round(art.top), Math.round(art.width), Math.round(art.height)] };
    })()`);
    console.log(name.padEnd(20), JSON.stringify(info));
    assert.ok(Number(info.capZ) > Number(info.artZ), 'captions sit above the artwork');
    assert.ok(Math.abs(info.art[2] / info.art[3] - 16 / 9) < 0.01, 'art box keeps 16:9');
    await shot(name);
    await evaluate(`document.querySelector('.nso-stage').__outro.skip()`);
    await wait(400);
    assert.equal(await evaluate('JSON.stringify(window.__done)'), '{"skipped":true}');
  }

  // 2. Other window sizes: wide, portrait (captions move below the picture).
  for (const [w, h, name] of [[1920, 1080, 'size-1080p'], [700, 1000, 'size-portrait']]) {
    await size(w, h);
    await evaluate(`window.__outro.playOutro({ startAt: 7600, audio: false }); true`);
    await wait(1500);
    const geo = await evaluate(`(() => {
      const art = document.querySelector('.nso-art').getBoundingClientRect();
      const cap = document.querySelector('.nso-cap').getBoundingClientRect();
      const films = [...document.querySelectorAll('.nso-film')].map(f => f.getBoundingClientRect());
      return { art: [art.left, art.top, art.right, art.bottom], cap: [cap.left, cap.top, cap.right, cap.bottom],
               filmTopBottom: films[0].bottom, filmBottomTop: films[1].top, vw: innerWidth, vh: innerHeight };
    })()`);
    console.log(name.padEnd(20), JSON.stringify(geo));
    assert.ok(geo.art[1] >= geo.filmTopBottom - 0.5 && geo.art[3] <= geo.filmBottomTop + 0.5, 'filmstrips never cover the art');
    assert.ok(geo.cap[0] >= 0 && geo.cap[2] <= geo.vw && geo.cap[3] <= geo.filmBottomTop + 0.5, 'caption fully on screen, above the filmstrip');
    await shot(name);
    await evaluate(`document.querySelector('.nso-stage').__outro.skip()`);
    await wait(400);
  }
  await size(1280, 720);

  // 3. The whole timeline, fast: every scene appears in order, completion fires once.
  const visited = await evaluate(`new Promise(resolve => {
    const seen = []; let calls = 0;
    window.__outro.playOutro({ timeScale: 24, audio: false, onComplete: () => { calls++; } }).then(r => {
      setTimeout(() => resolve({ seen, calls, result: r }), 300);
    });
    const poll = setInterval(() => {
      const s = document.querySelector('.nso-stage');
      const id = s && s.__outro && s.__outro.scene;
      if (id && seen[seen.length - 1] !== id) seen.push(id);
      if (!s) clearInterval(poll);
    }, 16);
  })`);
  console.log('full run'.padEnd(20), visited.seen.length, 'scenes, onComplete x' + visited.calls, JSON.stringify(visited.result));
  assert.equal(visited.seen.length, 23);
  assert.deepEqual(visited.seen, Array.from({ length: 23 }, (_, i) => `frame_${String(i + 1).padStart(2, '0')}`));
  assert.equal(visited.calls, 1);
  assert.equal(visited.result.skipped, false);

  // 4. Skip with the button and with Escape: stops at once, completion fires once.
  for (const how of ['button', 'escape']) {
    const r = await evaluate(`new Promise(resolve => {
      let calls = 0;
      window.__outro.playOutro({ audio: false, onComplete: () => calls++ }).then(result => setTimeout(() => resolve({ calls, result, left: !!document.querySelector('.nso-stage') }), 500));
      setTimeout(() => {
        if (${JSON.stringify(how)} === 'button') document.querySelector('.nso-skip').click();
        else window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        document.querySelector('.nso-skip')?.click();
      }, 1200);
    })`);
    console.log(('skip ' + how).padEnd(20), JSON.stringify(r));
    assert.equal(r.calls, 1);
    assert.equal(r.result.skipped, true);
    assert.equal(r.left, false, 'stage removed after skipping');
  }

  assert.deepEqual(errors.map(e => e.exception?.description || e.text), []);
  assert.deepEqual(warnings, []);
  console.log('PASS: 23 frames load, play in order, captions stay above the art, skip and completion work.');
  }
} finally {
  socket?.close();
  browser.kill();
  server.close();
  server.closeAllConnections();
}
