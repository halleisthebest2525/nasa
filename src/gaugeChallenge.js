// ==========================================
// GAUGE CHALLENGE (Earth launch + Moon landing)
// Hold the mouse button (or Space): the gauge fills.
// Release inside the green zone to succeed.
// If the gauge reaches 100% while held, it is an OVERLOAD (fail).
// ==========================================

const RESULT_PAUSE_MS = 950;

const overlay = document.createElement('div');

overlay.style.cssText = `
  position:fixed;
  inset:0;
  z-index:95;
  display:none;
  align-items:flex-start;
  justify-content:center;
  padding-top:160px;
  box-sizing:border-box;
  background:rgba(0,0,0,.35);
  font-family:monospace;
  color:#d5dfc6;
  user-select:none;
  touch-action:none;
`;

overlay.innerHTML = `
  <div style="
    width:min(480px,92vw);
    padding:26px 28px;
    background:#151a18;
    border:1px solid #89917b;
    box-shadow:0 15px 60px #000;
    text-align:center;
  ">
    <div id="gauge-kicker" style="color:#9eae8e;font-size:11px;letter-spacing:3px"></div>
    <div id="gauge-title" style="margin:8px 0 6px;font-size:24px;letter-spacing:4px;color:#dce8c9"></div>
    <div id="gauge-counter" style="color:#c7d5ae;font-size:12px;letter-spacing:2px"></div>
    <div id="gauge-pips" style="display:flex;justify-content:center;gap:5px;margin:12px 0 4px"></div>

    <div style="
      position:relative;
      height:30px;
      margin:18px 0 8px;
      background:#0b100e;
      border:1px solid #65765d;
      overflow:hidden;
    ">
      <div id="gauge-zone" style="
        position:absolute;top:0;bottom:0;
        background:rgba(120,200,120,.35);
        border-left:2px solid #8fd88f;
        border-right:2px solid #8fd88f;
      "></div>
      <div id="gauge-fill" style="
        position:absolute;left:0;top:0;bottom:0;width:0;
        background:linear-gradient(90deg,#4f6a48,#d5b66b);
        opacity:.85;
      "></div>
      <div id="gauge-needle" style="
        position:absolute;top:-2px;bottom:-2px;width:3px;left:0;
        background:#f2f0e0;box-shadow:0 0 6px #f2f0e0;
      "></div>
    </div>

    <div style="display:flex;justify-content:space-between;color:#596456;font-size:9px">
      <span>0%</span><span>THRUST</span><span>100%</span>
    </div>

    <div id="gauge-result" style="min-height:22px;margin-top:14px;font-size:15px;letter-spacing:3px;font-weight:bold"></div>
    <div id="gauge-hint" style="margin-top:8px;color:#858b7e;font-size:10px;letter-spacing:1px"></div>
  </div>
`;

document.body.appendChild(overlay);

const el = id => overlay.querySelector(`#${id}`);

let active = null;

function render() {
  const c = active;

  el('gauge-fill').style.width = `${c.fill}%`;
  el('gauge-needle').style.left = `calc(${c.fill}% - 1px)`;
  el('gauge-zone').style.left = `${c.zoneStart}%`;
  el('gauge-zone').style.width = `${c.zoneSize}%`;

  const limited = Number.isFinite(c.maxAttempts);

  el('gauge-counter').textContent = limited
    ? `SUCCESSES ${c.successes} / ${c.required}  ·  ATTEMPT ${Math.min(c.attempts + 1, c.maxAttempts)} / ${c.maxAttempts}`
    : `ATTEMPT ${c.attempts + 1}`;

  // One box per attempt (only when the number of attempts is limited).
  const pips = el('gauge-pips');

  if (limited) {
    pips.innerHTML = c.history.concat(
      Array(c.maxAttempts - c.history.length).fill(null)
    ).map(result => `<span style="
      width:14px;height:14px;display:inline-block;
      border:1px solid #65765d;
      background:${result === null ? '#0b100e' : result ? '#7fbf6a' : '#b64d3f'};
    "></span>`).join('');
  } else {
    pips.innerHTML = '';
  }
}

function newZone() {
  const c = active;
  // Random position each attempt, kept between 35% and 92%.
  c.zoneStart = 35 + Math.random() * (57 - c.zoneSize);
  c.fill = 0;
}

function showResult(text, color) {
  const result = el('gauge-result');
  result.textContent = text;
  result.style.color = color;
}

function finishAttempt(success, reason) {
  const c = active;

  c.state = 'result';
  c.attempts += 1;
  c.history.push(success);

  if (success) {
    c.successes += 1;
    showResult('ON TARGET', '#8fd88f');
  } else {
    showResult(reason, '#e45d4c');
  }

  render();

  // Lets main.js apply damage. Returning false stops the challenge.
  const keepGoing = c.onAttempt(success) !== false;

  const remaining = c.maxAttempts - c.attempts;
  const needed = c.required - c.successes;

  setTimeout(() => {
    if (active !== c) return;

    if (!keepGoing) return end({ success: false, aborted: true });
    if (needed <= 0) return end({ success: true });
    if (remaining < needed) return end({ success: false });

    newZone();
    c.state = 'ready';
    showResult('', '');
    render();
  }, RESULT_PAUSE_MS);
}

function end(outcome) {
  const c = active;

  active = null;
  overlay.style.display = 'none';
  cancelAnimationFrame(c.frame);

  c.resolve({
    success: false,
    aborted: false,
    successes: c.successes,
    attempts: c.attempts,
    ...outcome
  });
}

function tick(time) {
  const c = active;

  if (!c || c.state !== 'filling') return;

  const dt = Math.min(0.05, (time - c.lastTime) / 1000 || 0);
  c.lastTime = time;

  c.fill = Math.min(100, c.fill + dt / c.fillSeconds * 100);
  render();

  if (c.fill >= 100) {
    finishAttempt(false, 'OVERLOAD · TOO MUCH THRUST');
    return;
  }

  c.frame = requestAnimationFrame(tick);
}

function press() {
  const c = active;

  if (!c || c.state !== 'ready') return;

  c.state = 'filling';
  c.fill = 0;
  c.lastTime = performance.now();
  showResult('', '');
  c.frame = requestAnimationFrame(tick);
}

function release() {
  const c = active;

  if (!c || c.state !== 'filling') return;

  cancelAnimationFrame(c.frame);

  const inZone =
    c.fill >= c.zoneStart &&
    c.fill <= c.zoneStart + c.zoneSize;

  const reason = c.fill < c.zoneStart
    ? 'TOO WEAK'
    : 'TOO STRONG';

  finishAttempt(inZone, reason);
}

overlay.addEventListener('pointerdown', event => {
  event.preventDefault();
  press();
});

window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
overlay.addEventListener('contextmenu', event => event.preventDefault());

window.addEventListener('keydown', event => {
  if (!active || event.key !== ' ') return;
  event.preventDefault();
  if (!event.repeat) press();
});

window.addEventListener('keyup', event => {
  if (!active || event.key !== ' ') return;
  release();
});

export function isGaugeChallengeActive() {
  return active !== null;
}

// Starts a challenge. Resolves with { success, aborted, successes, attempts }.
export function runGaugeChallenge({
  kicker = '',
  title = '',
  hint = 'HOLD MOUSE BUTTON OR SPACE · RELEASE IN THE GREEN ZONE',
  required = 1,
  maxAttempts = Infinity,
  fillSeconds = 1.5,
  zoneSize = 15,
  onAttempt = () => true
} = {}) {
  return new Promise(resolve => {
    active = {
      required,
      maxAttempts,
      fillSeconds,
      zoneSize,
      onAttempt,
      resolve,
      successes: 0,
      attempts: 0,
      history: [],
      state: 'ready',
      fill: 0,
      zoneStart: 50,
      lastTime: 0,
      frame: 0
    };

    el('gauge-kicker').textContent = kicker;
    el('gauge-title').textContent = title;
    el('gauge-hint').textContent = hint;
    showResult('', '');

    newZone();
    render();
    overlay.style.display = 'flex';
  });
}
