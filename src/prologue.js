// Isolate the supplied full-page crawl from the game's canvas, CSS and controls.
// Resolve only after Skip or the end of the story. Keep the stars visible until
// the caller has finished preparing gameplay, then remove the entire frame.
export function playPrologue() {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.id = 'run-prologue';
    frame.title = 'Project Nasareth mission prologue';
    frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:1000;background:#020308';
    function complete(event) {
      if (event.source !== frame.contentWindow || event.origin !== window.location.origin ||
          event.data?.type !== 'nasareth:introComplete') return;
      window.removeEventListener('message', complete);
      resolve(() => frame.remove());
    }
    frame.addEventListener('error', () => {
      window.removeEventListener('message', complete);
      frame.remove();
      reject(new Error('Could not load the mission prologue'));
    }, { once: true });
    window.addEventListener('message', complete);
    frame.src = './prologue.html';
    document.body.appendChild(frame);
    frame.focus();
  });
}
