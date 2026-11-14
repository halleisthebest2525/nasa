// ==========================================
// EARTH SHIPYARD
// Opens after landing on Earth. The ship is repaired, refuelled and its
// oxygen restored, and the player fits collected parts into each slot.
// Parts can ONLY be changed here (never in space or on other planets).
// ==========================================

// game = {
//   partsSystem,
//   restoreShip()  -> repairs hull, refuels, refills oxygen
//   getShipSprite() -> the real ship image (updates after fitting parts)
//   getShipRarity() -> overall ship rarity
//   onLaunch()     -> called when the player presses LAUNCH
// }
export function createEarthBase(game) {
  const screen = document.createElement('div');

  screen.style.cssText = `
    position:fixed;
    inset:0;
    z-index:76;
    display:none;
    align-items:center;
    justify-content:center;
    background:rgba(0,4,10,.86);
    font-family:monospace;
    color:#d5dfc6;
  `;

  document.body.appendChild(screen);

  let open = false;

  const RARITY_COLORS = {
    base: '#aeb4a9', common: '#b8b9ae', rare: '#71b9e8',
    epic: '#c18aff', mythic: '#ef9c66', legendary: '#f2d46f'
  };

  function render() {
    const parts = game.partsSystem;
    const rarity = game.getShipRarity();
    const sprite = game.getShipSprite();

    const slots = parts.types().map(type => {
      const options = parts.getSlotOptions(type).map(option => `
        <button
          class="earth-part${option.installed ? ' fitted' : ''}"
          data-type="${type}"
          data-rarity="${option.rarity}"
          style="--rarity:${option.color}"
        >
          <span class="earth-part-name">${option.rarity.toUpperCase()}${option.count ? ` <small>x${option.count}</small>` : ''}</span>
          <span class="earth-part-stat">${option.stat}</span>
          <span class="earth-part-tag">${option.installed ? 'FITTED' : 'FIT'}</span>
        </button>
      `).join('');

      return `
        <div class="earth-slot">
          <div class="earth-slot-title">${parts.typeName(type)}</div>
          <div class="earth-slot-options">${options}</div>
        </div>
      `;
    }).join('');

    screen.innerHTML = `
      <style>
        .earth-panel { width:min(760px,94vw); max-height:92vh; overflow-y:auto; padding:26px 28px;
          background:#121a22; border:1px solid #5d7d94; box-shadow:0 20px 80px #000; }
        .earth-top { display:flex; gap:22px; align-items:center; margin-bottom:18px; flex-wrap:wrap; }
        .earth-ship { width:150px; height:120px; display:grid; place-items:center;
          background:#0b1117; border:1px solid #2d3f4c; }
        .earth-ship img { max-width:130px; max-height:105px; image-rendering:pixelated; }
        .earth-kicker { color:#8fb3cc; font-size:11px; letter-spacing:3px; }
        .earth-title { font-size:26px; letter-spacing:4px; color:#dcebf5; margin:6px 0; }
        .earth-note { color:#7f97a8; font-size:11px; line-height:1.7; }
        .earth-slot { margin:12px 0; }
        .earth-slot-title { font-size:12px; letter-spacing:2px; color:#cfe0ea; margin-bottom:6px; }
        .earth-slot-options { display:flex; flex-wrap:wrap; gap:6px; }
        .earth-part { display:flex; flex-direction:column; gap:3px; min-width:130px; padding:8px 10px;
          background:#0d141a; color:#cfd8de; border:1px solid #2d3f4c; border-left:3px solid var(--rarity);
          font:11px monospace; text-align:left; cursor:pointer; }
        .earth-part:hover { background:#16222c; }
        .earth-part.fitted { background:#1b2b22; border-color:#7fbf6a; border-left-color:var(--rarity); }
        .earth-part-name { color:var(--rarity); font-weight:bold; letter-spacing:1px; }
        .earth-part-stat { color:#9fb0bb; font-size:10px; }
        .earth-part-tag { color:#7fbf6a; font-size:9px; letter-spacing:2px; }
        .earth-part:not(.fitted) .earth-part-tag { color:#5d7d94; }
        .earth-launch { width:100%; margin-top:18px; padding:14px; background:#3f6a8a; color:#eef6fb;
          border:1px solid #8fc3e8; font:bold 14px monospace; letter-spacing:3px; cursor:pointer; }
        .earth-launch:hover { background:#4f80a6; }
      </style>

      <div class="earth-panel">
        <div class="earth-top">
          <div class="earth-ship">${sprite ? `<img src="${sprite.src}" alt="">` : ''}</div>
          <div>
            <div class="earth-kicker">EARTH · ORBITAL SHIPYARD</div>
            <div class="earth-title">REFIT YOUR SHIP</div>
            <div class="earth-note">
              HULL REPAIRED · FUEL AND OXYGEN RESTORED<br>
              SHIP CLASS: <b style="color:${RARITY_COLORS[rarity] || '#aeb4a9'}">${rarity.toUpperCase()}</b><br>
              FIT ANY PART YOU HAVE COLLECTED. PARTS CAN ONLY BE CHANGED HERE.
            </div>
          </div>
        </div>

        ${slots}

        <button class="earth-launch" id="earth-launch">LAUNCH</button>
      </div>
    `;

    screen.querySelectorAll('.earth-part').forEach(button => {
      button.addEventListener('click', () => {
        if (game.partsSystem.fitPart(button.dataset.type, button.dataset.rarity)) {
          // Repair/refuel again so a bigger tank / hull is filled up too.
          game.restoreShip();
          render();
        }
      });
    });

    screen.querySelector('#earth-launch').addEventListener('click', () => {
      close();
      game.onLaunch();
    });
  }

  function openBase() {
    open = true;
    game.restoreShip();
    screen.style.display = 'flex';
    render();
  }

  function close() {
    open = false;
    screen.style.display = 'none';
  }

  return {
    open: openBase,
    close,
    isOpen: () => open
  };
}
