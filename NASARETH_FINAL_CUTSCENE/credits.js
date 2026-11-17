// END CREDITS: shown after the final cutscene in every ending (single
// player and multiplayer). Styled like the opening prologue: a star field,
// a title card, then the names crawl up and away into space.
// Edit the names here.
export const CREDITS = [
  { role: 'Developer', name: 'Winston Lee' },
  { role: 'Developer', name: 'Brandon Kim' },
  { role: 'Main Tester', name: 'Harang You' },
  { role: 'Art, Co-Developer', name: 'Jinmo Koo' },
  { role: 'Audio Director', name: 'Dylan Son' },
  { role: 'Manager, Editor', name: 'Daniel Kim' },
  { role: '', name: 'Students of Fayston Preparatory of Suji' }
];

// The same credits as plain lines ("Role Name").
export const CREDIT_TEXT = CREDITS
  .map(credit => (credit.role ? `${credit.role} ${credit.name}` : credit.name))
  .join('\n');

const CRAWL_SECONDS = 46;
const TITLE_SECONDS = 2.6;

const escapeHtml = value => String(value).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const CREDITS_MARKUP = `
<style>
:host{color-scheme:dark}*{box-sizing:border-box}
.screen{position:absolute;inset:0;overflow:hidden;background:#020308;color:#f2cf78;font-family:Arial,Helvetica,sans-serif}
#space{position:absolute;inset:0;width:100%;height:100%}
.vignette{position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(ellipse at center,transparent 30%,rgba(0,0,0,.8) 100%)}
.stage{position:absolute;inset:0;z-index:1;perspective:1250px;overflow:hidden}
.fade{position:absolute;inset:0;z-index:2;pointer-events:none;background:linear-gradient(to bottom,#020308 0%,rgba(2,3,8,.98) 8%,transparent 38%,transparent 88%,#020308 100%)}
.crawl{position:absolute;left:50%;top:100%;width:min(1120px,94vw);transform-origin:50% 100%;transform:translateX(-50%) rotateX(43deg);text-align:center;font-weight:900;font-size:clamp(38px,5.8vw,82px);line-height:1.25;letter-spacing:.005em;animation:rise ${CRAWL_SECONDS}s linear forwards;animation-play-state:paused;text-shadow:0 0 8px rgba(255,196,84,.13)}
.crawl h1{font-size:1.25em;letter-spacing:.12em;margin:0 0 1.2em}
.crawl .eyebrow{font-family:system-ui,sans-serif;font-size:.48em;letter-spacing:.38em;margin-bottom:1.3em}
.credit{margin:0 0 1.35em}
.credit .role{display:block;font-family:system-ui,sans-serif;font-weight:600;font-size:.46em;letter-spacing:.3em;text-transform:uppercase;color:#c0b184;margin-bottom:.35em}
.credit .name{display:block}
.thanks{margin-top:1.8em;font-size:.9em;letter-spacing:.1em}
.stage.play .crawl{animation-play-state:running}
@keyframes rise{from{top:100%}to{top:var(--end-top,-1800px)}}
.hint{position:absolute;z-index:4;top:20px;left:0;right:0;text-align:center;color:#a9b2c6;font:12px system-ui,sans-serif;letter-spacing:.18em}
.intro{position:absolute;inset:0;z-index:3;display:grid;place-items:center;text-align:center;background:#020308;transition:opacity 1.3s}
.intro.hidden{opacity:0;pointer-events:none}
.intro h2{font-size:clamp(25px,5vw,65px);letter-spacing:.15em;margin:0}
.intro p{font:14px system-ui,sans-serif;letter-spacing:.35em;color:#c0b184}
button{position:absolute;z-index:5;bottom:max(22px,env(safe-area-inset-bottom));right:24px;padding:11px 16px;color:#f1e0a8;background:#121a2c;border:1px solid #6a7690;border-radius:6px;font:12px system-ui,sans-serif;letter-spacing:2px;cursor:pointer}
button:hover,button:focus-visible{background:#24324a;outline:2px solid #f1e0a8}
@media(max-width:650px){.crawl{font-size:clamp(32px,7vw,48px);width:94vw;transform:translateX(-50%) rotateX(37deg)}}
</style>
<div class="screen">
  <canvas id="space"></canvas><div class="vignette"></div>
  <div class="hint">2035 · NASA FINAL RECOVERY MISSION · END CREDITS</div>
  <div class="stage" id="stage">
    <div class="crawl">
      <div class="eyebrow">MISSION COMPLETE</div>
      <h1>PROJECT: NASARETH</h1>
      ${CREDITS.map(credit => `<div class="credit">${credit.role ? `<span class="role">${escapeHtml(credit.role)}</span>` : ''}<span class="name">${escapeHtml(credit.name)}</span></div>`).join('')}
      <div class="thanks">THANK YOU FOR PLAYING</div>
    </div>
    <div class="fade"></div>
  </div>
  <div class="intro" id="intro"><div><p>GENESIS · RESTORED</p><h2>PROJECT: NASARETH</h2><p>THE END</p></div></div>
  <button type="button">CONTINUE</button>
</div>`;

let playing = null;

export function playEndCredits() {
  if (playing) return playing;
  playing = showCredits().finally(() => { playing = null; });
  return playing;
}

function showCredits() {
  const previousFocus = document.activeElement;
  const host = document.createElement('div');
  host.id = 'end-credits';
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  host.setAttribute('aria-label', 'End credits');
  host.style.cssText = 'position:fixed;inset:0;z-index:100001;background:#020308;overflow:hidden;';

  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = CREDITS_MARKUP;

  const screen = root.querySelector('.screen');
  const canvas = root.querySelector('#space');
  const stage = root.querySelector('#stage');
  const crawl = root.querySelector('.crawl');
  const intro = root.querySelector('#intro');
  const button = root.querySelector('button');

  // A disabled canvas/GPU must not prevent the credits from playing.
  let ctx = null;
  try { ctx = canvas.getContext('2d'); } catch { /* plain background is fine */ }

  let stars = [];
  let width = 0;
  let height = 0;
  let frame = 0;
  let titleTimer = 0;
  let endTimer = 0;
  let closed = false;
  let finish;
  const done = new Promise(resolve => { finish = resolve; });

  function resize() {
    width = screen.clientWidth || window.innerWidth;
    height = screen.clientHeight || window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
    stars = Array.from({ length: Math.min(500, Math.max(110, Math.floor(width * height / 4400))) }, () => ({
      x: Math.random() * width, y: Math.random() * height,
      size: 0.3 + Math.random() * 1.3, alpha: 0.3 + Math.random() * 0.7
    }));
    crawl.style.setProperty('--end-top', `${-Math.ceil(crawl.scrollHeight * 0.9) - height * 0.12}px`);
  }

  function draw(time) {
    if (closed || !ctx) return;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#020308';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#eaf1ff';
    for (const star of stars) {
      ctx.globalAlpha = star.alpha * (0.83 + 0.17 * Math.sin(time * 0.0008 + star.x));
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    ctx.globalAlpha = 1;
    frame = requestAnimationFrame(draw);
  }

  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(titleTimer);
    clearTimeout(endTimer);
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    host.remove();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    finish();
  }

  // The game must not react to keys while the credits are up.
  function onKey(event) {
    event.stopImmediatePropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      if (event.type === 'keyup') close();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      button.focus();
    } else if (event.key !== 'Enter' && event.key !== ' ') {
      event.preventDefault();
    }
  }

  crawl.addEventListener('animationend', event => {
    if (event.target === crawl && event.animationName === 'rise') setTimeout(close, 1200);
  });
  button.addEventListener('click', close);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  window.addEventListener('resize', resize);

  document.body.appendChild(host);
  button.focus({ preventScroll: true });
  resize();
  frame = requestAnimationFrame(draw);

  titleTimer = setTimeout(() => {
    if (closed) return;
    intro.classList.add('hidden');
    stage.classList.add('play');
  }, TITLE_SECONDS * 1000);

  // Fallback for browsers which suppress animationend events.
  endTimer = setTimeout(close, (TITLE_SECONDS + CRAWL_SECONDS + 3) * 1000);

  return done;
}
