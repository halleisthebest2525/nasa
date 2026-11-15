// Credits remain real text so names and spacing are preserved exactly.
export const CREDIT_TEXT = `Winston Lee Developer
Brandon Kim Developer
Jinmo Koo Designer
Dylan  Son SFX Artist
Daniel Kim  General Manager
Joseph You Main Tester/  Debugger
Students of Fayston Preparatory of Suji

Thank You`;

const ART = new URL('./assets/images/credits-visor.png', import.meta.url).href;
let playing = null;

export function playEndCredits() {
  if (playing) return playing;
  playing = showCredits().finally(() => { playing = null; });
  return playing;
}

async function showCredits() {
  const previousFocus = document.activeElement;
  const host = document.createElement('div');
  host.id = 'end-credits';
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  host.setAttribute('aria-label', 'End credits');
  host.style.cssText = 'position:fixed;inset:0;z-index:100001;background:#02050a;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { color:#def8ff; font-family:Consolas,monospace; }
      * { box-sizing:border-box; }
      .screen { position:absolute; inset:0; display:flex; align-items:center;
        justify-content:center; overflow:hidden; background:#02050a; }
      .portrait { position:relative; flex-shrink:0; width:min(100vw,177.777svh);
        aspect-ratio:16/9; container-type:inline-size; opacity:0;
        transform:scale(.96); transition:opacity 1.8s ease,transform 3s ease-out; }
      .ready .portrait { opacity:1; transform:scale(1); }
      img { display:block; width:100%; height:100%; object-fit:contain;
        image-rendering:pixelated; }
      .glass { position:absolute; left:23%; right:23%; top:23%; bottom:29%;
        display:grid; place-items:center; border-radius:28%; overflow:hidden;
        background:radial-gradient(ellipse,rgba(2,12,22,.42),transparent 75%); }
      pre { margin:0; width:100%; text-align:center; white-space:pre;
        font:1.85cqw/1.48 Consolas,monospace; letter-spacing:-.035em;
        color:#d6f5ff; text-shadow:0 0 .32em #4ba9c0, .04em .1em 0 #4c829b;
        transform:perspective(700px) rotateX(7deg); opacity:0;
        transition:opacity 2s ease 1.2s; }
      .ready pre { opacity:.94; }
      .glint { position:absolute; inset:0; pointer-events:none;
        background:linear-gradient(112deg,transparent 18%,rgba(151,225,255,.07) 32%,
          transparent 44%,transparent 72%,rgba(151,225,255,.04) 86%,transparent);
        mix-blend-mode:screen; }
      button { position:absolute; bottom:max(24px,env(safe-area-inset-bottom)); right:24px;
        padding:12px 18px; color:#b8d2df; background:#08111de6;
        border:1px solid #405967; font:12px Consolas,monospace; letter-spacing:2px;
        cursor:pointer; }
      button:hover,button:focus-visible { color:white; border-color:#b1e7ef; outline:2px solid #87c8dc; }
      @media (max-aspect-ratio:1/1) { .portrait { width:min(145vw,160svh); } }
      @media (prefers-reduced-motion:reduce) {
        .portrait,pre { transition:none; transform:none; }
      }
    </style>
    <div class="screen">
      <div class="portrait">
        <img alt="An astronaut's dark visor reflecting the end credits">
        <div class="glass"><pre></pre><div class="glint"></div></div>
      </div>
      <button type="button">CONTINUE</button>
    </div>`;
  root.querySelector('pre').textContent = CREDIT_TEXT;
  const art = root.querySelector('img');
  art.src = ART;
  const button = root.querySelector('button');
  let finish;
  const done = new Promise(resolve => { finish = resolve; });
  let closed = false;
  let timer;
  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    host.remove();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    finish();
  }
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
  button.addEventListener('click', close);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  document.body.appendChild(host);
  button.focus({ preventScroll: true });
  // Keep Continue usable even if the illustration cannot be decoded.
  let revealed = false;
  function reveal() {
    if (closed || revealed) return;
    revealed = true;
    clearTimeout(timer);
    root.querySelector('.screen').classList.add('ready');
    timer = setTimeout(close, 30000);
  }
  timer = setTimeout(reveal, 4000);
  art.decode().catch(() => {}).then(reveal);
  return done;
}
