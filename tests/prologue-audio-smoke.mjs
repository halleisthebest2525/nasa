// Optional real-browser portability and audio check:
// node tests/prologue-audio-smoke.mjs
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
  const requested = decodeURIComponent(req.url.split('?')[0]);
  // Mimic a shared/nested deployment where iframes are blocked and the old
  // standalone cutscene file was not copied. The bundled story must still run.
  res.setHeader('Content-Security-Policy', "frame-src 'none'");
  if (requested.endsWith('/prologue.html')) { res.writeHead(404).end(); return; }
  const relative = requested.replace(/^\/portable(?=\/)/, '');
  const file = path.resolve(root, '.' + (relative === '/' ? '/index.html' : relative));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = spawn(browserPath, ['--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--window-size=1280,800', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
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
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__audioPlayers=[];window.Audio=new Proxy(window.Audio,{construct(Type,args){const audio=Reflect.construct(Type,args);window.__audioPlayers.push(audio);return audio;}});" });
  await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/portable/' });
  const until = async (expression, limit=15000) => {
    const deadline=Date.now()+limit;
    while(Date.now()<deadline){if(await evaluate(expression))return;await wait(100);}
    throw Error('Timed out waiting for '+expression);
  };
  await until('!!document.querySelector("#singleplayer-button") && window.__audioPlayers?.length>0');
  assert.equal(await evaluate('!!document.querySelector("#run-prologue")'), false);
  const click = async selector => {
    const point=await evaluate('(()=>{const parts='+JSON.stringify(selector)+'.split(" >>> ");let node=document.querySelector(parts.shift());for(const part of parts)node=node.shadowRoot.querySelector(part);const r=node.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  };
  await click('#singleplayer-button');
  await click('#new-game');
  await until('!!document.querySelector("#run-prologue")');
  await wait(1000);
  const state=()=>evaluate('(()=>{const a=window.__audioPlayers[0];return {src:a.currentSrc,paused:a.paused,muted:a.muted,volume:a.volume,time:a.currentTime,readyState:a.readyState,error:a.error?.code,prologue:!!document.querySelector("#run-prologue")};})()');
  const first=await state();
  await wait(1800);
  const second=await state();
  const story=await evaluate('(()=>{const root=document.querySelector("#run-prologue").shadowRoot;return {running:root.querySelector("#stage").classList.contains("play"),animation:getComputedStyle(root.querySelector(".crawl")).animationPlayState,frames:document.querySelectorAll("iframe").length};})()');
  assert.equal(story.running,true);
  assert.equal(story.animation,'running');
  assert.equal(story.frames,0);
  assert.equal(second.prologue,true);
  assert.equal(second.paused,false);
  assert.equal(second.muted,false);
  assert.ok(second.volume>0);
  assert.ok(second.readyState>=2);
  assert.ok(second.time-first.time>1,'Audio playback did not advance');
  assert.ok(!second.error);
  console.log('CUTSCENE AUDIO: '+JSON.stringify({first,second}));
  await click('#run-prologue >>> #skip');
  await until('!!window.NasarethGame && document.querySelector("#game").classList.contains("game-active")',30000);
  const after=await state();
  assert.equal(after.prologue,false);
  assert.equal(after.paused,true);
  assert.deepEqual(errors,[]);
  console.log('PASS: cutscene scrolls and plays music under a nested URL with iframes blocked and prologue.html unavailable; Skip starts gameplay.');

} finally {
  socket?.close();
  browser.kill();
  server.close();
  server.closeAllConnections();
}
