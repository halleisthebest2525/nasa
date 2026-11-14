// ==========================================
// WARP DRIVE (T)
// Saves flying time. Once a planet has been completed (its chest opened):
//   - you can warp straight back to EARTH (the shipyard opens), and
//   - you can warp to any planet you have already completed, so the
//     next trip starts from there (e.g. Moon -> Mars).
// A "WARP" button appears on screen whenever warping is possible.
// ==========================================

// game = {
//   isAvailable()      -> true when the warp drive can be used right now
//   getDestinations()  -> [{ id, name, note, here }]
//   onWarp(id)         -> do the warp
// }
export function createWarpMenu(game) {
  // Small button on the left side of the screen.
  const button = document.createElement('button');

  button.textContent = 'WARP (T)';
  button.style.cssText = `
    position:fixed; left:30px; top:300px; z-index:21; display:none;
    padding:8px 14px; font:bold 12px monospace; letter-spacing:2px; cursor:pointer;
    background:rgba(16,28,44,.92); color:#bfe6ff; border:1px solid #6fb6e6;
    box-shadow:0 0 14px rgba(110,180,230,.35);
  `;

  // The menu.
  const screen = document.createElement('div');

  screen.style.cssText = `
    position:fixed; inset:0; z-index:79; display:none;
    align-items:center; justify-content:center;
    background:rgba(0,4,12,.84); font-family:monospace; color:#d5e4ee;
  `;

  // White flash when the ship jumps.
  const flash = document.createElement('div');

  flash.style.cssText = `
    position:fixed; inset:0; z-index:240; pointer-events:none; opacity:0;
    background:radial-gradient(circle, #ffffff 0%, #bfe6ff 45%, #3a7bff 100%);
    transition:opacity .9s ease-out;
  `;

  document.body.append(button, screen, flash);

  let open = false;
  let buttonShown = false;

  function close() {
    open = false;
    screen.style.display = 'none';
  }

  function render() {
    const destinations = game.getDestinations();

    screen.innerHTML = `
      <div style="width:min(520px, 94vw); background:#0c141d; border:1px solid #6fb6e6; padding:22px 24px;
        box-shadow:0 0 60px rgba(60,130,220,.35)">
        <div style="color:#8fb3cc; font-size:11px; letter-spacing:3px">WARP DRIVE</div>
        <div style="font-size:24px; letter-spacing:4px; color:#dcebf5; font-weight:bold; margin:4px 0 8px">CHOOSE A DESTINATION</div>
        <div style="color:#7f97a8; font-size:11px; line-height:1.6; margin-bottom:14px">
          You can warp to Earth and to every world you have completed.
          Worlds you have not completed yet must be reached by flying.
        </div>

        <div style="display:flex; flex-direction:column; gap:8px">
          ${destinations.map(destination => `
            <button class="warp-go" data-id="${destination.id}" ${destination.here ? 'disabled' : ''} style="
              display:flex; justify-content:space-between; align-items:center; gap:12px; padding:12px 14px;
              font:bold 13px monospace; letter-spacing:2px; text-align:left;
              cursor:${destination.here ? 'default' : 'pointer'};
              background:${destination.here ? '#111820' : '#16283a'};
              color:${destination.here ? '#5d7180' : '#e6f3fb'};
              border:1px solid ${destination.here ? '#2a3640' : '#6fb6e6'};
            ">
              <span>${destination.name}</span>
              <span style="font-size:10px; font-weight:normal; letter-spacing:1px; color:${destination.here ? '#5d7180' : '#8fc3e8'}">
                ${destination.here ? 'YOU ARE HERE' : destination.note}
              </span>
            </button>`).join('')}
        </div>

        <div style="margin-top:14px; color:#5d7180; font-size:11px; letter-spacing:1px">PRESS T OR ESC TO CLOSE</div>
      </div>`;

    for (const item of screen.querySelectorAll('.warp-go')) {
      item.addEventListener('click', () => {
        if (item.disabled) return;

        close();
        showFlash();
        game.onWarp(item.dataset.id);
      });
    }
  }

  function showFlash() {
    // Jump to full white at once, then fade out slowly.
    flash.style.transition = 'none';
    flash.style.opacity = '1';
    void flash.offsetWidth;   // apply the line above before fading
    flash.style.transition = 'opacity .9s ease-out';
    flash.style.opacity = '0';
  }

  function toggle() {
    if (open) {
      close();
      return;
    }

    if (!game.isAvailable()) return;

    open = true;
    screen.style.display = 'flex';
    render();
  }

  button.addEventListener('click', () => {
    button.blur();   // so Space / Enter don't press it again
    toggle();
  });

  // Clicks on the button must not reach the game (attacks, gauges).
  button.addEventListener('pointerdown', event => event.stopPropagation());
  button.addEventListener('mousedown', event => event.stopPropagation());

  return {
    toggle,
    close,
    isOpen: () => open,
    flash: showFlash,

    // Called every frame: shows / hides the WARP button.
    refresh(visible) {
      if (visible === buttonShown) return;
      buttonShown = visible;
      button.style.display = visible ? 'block' : 'none';
    }
  };
}
