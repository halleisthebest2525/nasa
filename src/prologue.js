// The story is bundled with index.html and rendered in an isolated shadow root.
// No iframe, cross-window messaging, origin matching or second HTML request.
// Only the new-run menu action calls this function; save loading skips it.
export function playPrologue() {
  const template = document.querySelector('#run-prologue-template');
  if (!template) return Promise.reject(new Error('The mission prologue template is missing'));

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.id = 'run-prologue';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Project Nasareth mission prologue');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:1000;background:#020308;overflow:hidden';
    const root = overlay.attachShadow({ mode: 'open' });
    root.appendChild(template.content.cloneNode(true));
    const canvas = root.querySelector('#space');
    const stage = root.querySelector('#stage');
    const crawl = root.querySelector('.crawl');
    const graphics = root.querySelector('#graphics');
    const intro = root.querySelector('#intro');
    const skip = root.querySelector('#skip');
    // A disabled canvas/GPU must not prevent the story or Skip from working.
    let ctx = null;
    try { ctx = canvas.getContext('2d'); } catch { /* Plain background is fine. */ }
    let stars = [], width = 0, height = 0, frame = 0;
    let titleTimer = 0, endTimer = 0, finished = false;
    const previousFocus = document.activeElement;

    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(titleTimer);
      clearTimeout(endTimer);
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      overlay.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve();
    }
    function resize() {
      width = overlay.clientWidth || window.innerWidth;
      height = overlay.clientHeight || window.innerHeight;
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
      if (finished || !ctx) return;
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

    // Register Skip before displaying the overlay or starting any animation.
    skip.addEventListener('click', finish);
    crawl.addEventListener('animationend', event => {
      if (event.target === crawl && event.animationName === 'rise') finish();
    });
    document.body.appendChild(overlay);
    window.addEventListener('resize', resize);
    resize();
    frame = requestAnimationFrame(draw);
    skip.focus();
    titleTimer = setTimeout(() => {
      if (finished) return;
      intro.classList.add('hidden');
      stage.classList.add('play');
      graphics.classList.add('play');
    }, 2300);
    // Fallback completion for browsers which suppress animationend events.
    endTimer = setTimeout(finish, 108000);
  });
}
