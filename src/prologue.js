// Isolate the supplied full-page crawl from the game's canvas, CSS and controls.
// Start only when the new-run flow explicitly calls this function.
export function playPrologue() {
  return new Promise((resolve, reject) => {
    const overlay = document.createElement('div');
    overlay.id = 'run-prologue';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:1000;background:#020308';
    const frame = document.createElement('iframe');
    frame.title = 'Project Nasareth mission prologue';
    frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0';
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.textContent = 'Skip Intro';
    skip.style.cssText = 'position:absolute;z-index:1;bottom:22px;left:50%;transform:translateX(-50%);background:#121a2c;border:1px solid #6a7690;border-radius:6px;color:#f1e0a8;padding:11px 16px;cursor:pointer;font:12px system-ui,sans-serif';
    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      window.removeEventListener('message', complete);
      overlay.remove();
      resolve();
    }
    function complete(event) {
      if (event.source !== frame.contentWindow || event.origin !== window.location.origin ||
          event.data?.type !== 'nasareth:introComplete') return;
      finish();
    }
    // Skip belongs to the parent, so it works even before the frame loads or
    // if its animation script fails. It closes the cutscene immediately.
    skip.addEventListener('click', finish);
    frame.addEventListener('load', () => {
      if (finished) return;
      frame.contentWindow.postMessage({ type: 'nasareth:startPrologue' }, window.location.origin);
    }, { once: true });
    frame.addEventListener('error', () => {
      if (finished) return;
      finished = true;
      window.removeEventListener('message', complete);
      overlay.remove();
      reject(new Error('Could not load the mission prologue'));
    }, { once: true });
    window.addEventListener('message', complete);
    frame.src = './prologue.html';
    overlay.append(frame, skip);
    document.body.appendChild(overlay);
    skip.focus();
  });
}
