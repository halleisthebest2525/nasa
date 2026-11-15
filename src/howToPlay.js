// ==========================================
// HOW TO PLAY (F1, or the "? HELP" button)
// A pop-up that explains the goal and the controls. To change the text,
// edit the SECTIONS list below: each entry is a title and its lines.
// ==========================================

const SECTIONS = [
  {
    title: 'YOUR GOAL',
    lines: [
      'Fly to each world, land, and collect every ship MODULE on its surface.',
      'When all modules are found, a CHEST appears. It holds the star map to the next world.',
      'Go back to EARTH to repair and fit the modules you collected. Then go farther.',
      'Order: THE MOON → MARS → (Asteroid Belt) → EUROPA → TITAN → UMBRIEL.'
    ]
  },
  {
    title: 'FLYING (IN SPACE)',
    lines: [
      ['W / S or ↑ / ↓', 'thrust forward / backward'],
      ['A / D or ← / →', 'turn'],
      ['SHIFT', 'boost (uses more fuel)'],
      ['SPACE', 'brake (there is no air: the ship keeps drifting)'],
      ['M', 'system map'],
      ['E', 'land (next to a world) · enter the ship'],
      ['T', 'WARP to Earth or a completed world (after your first chest)']
    ]
  },
  {
    title: 'ON A WORLD',
    lines: [
      ['WASD / ARROW KEYS', 'walk'],
      ['SHIFT', 'run (uses stamina)'],
      ['F', 'flashlight'],
      ['Q', 'metal detector (beeps near scrap, modules and the chest)'],
      ['M', 'surface map'],
      ['B', 'inventory, ship parts and stats'],
      ['H', 'use a med kit'],
      ['E', 'enter your ship (refills suit oxygen)']
    ]
  },
  {
    title: 'FIGHTING · MARTIAL ARTS',
    lines: [
      ['SPACE / CLICK', 'PUNCH'],
      ['1 – 5', 'your other skills'],
      ['K', 'Martial Arts menu: learn new skills with scraps'],
      'New skills unlock as you reach new worlds and defeat bosses.',
      'Bosses show a warning circle before big attacks. Get out of it.'
    ]
  },
  {
    title: 'SCRAPS AND THE SHIP',
    lines: [
      'SCRAPS are money. Walk over scrap to collect it; monsters drop it too.',
      'Scrap is worth more on farther worlds.',
      'Use the SHIP COMPUTER (inside the ship) to buy fuel, oxygen, repairs, a flashlight and med kits.',
      'Modules are only fitted at EARTH. Better modules make the ship faster, tougher and able to fly farther.'
    ]
  },
  {
    title: 'STAYING ALIVE',
    lines: [
      'Watch FUEL, OXYGEN, HEALTH and HULL (bottom left).',
      'SUIT OXYGEN runs out on the surface. At 0 you lose health very fast: get back in the ship.',
      'The ship uses a little fuel even when it is only drifting.',
      'At 2:00 AM you fall asleep. Sleep in the ship to stay safe.',
      ['P', 'planet log (progress and module odds)'],
      ['ESC', 'pause · save'],
      ['F1', 'this help']
    ]
  }
];

export function createHowToPlay() {
  const button = document.createElement('button');

  button.textContent = '? HELP (F1)';
  button.style.cssText = `
    position:fixed; left:30px; top:344px; z-index:21; font:11px monospace;
    background:#10202c; color:#bfe6ff; border:1px solid #6fb6e6; padding:3px 8px;
    cursor:pointer; opacity:.85;
  `;

  const screen = document.createElement('div');

  screen.style.cssText = `
    position:fixed; inset:0; z-index:260; display:none;
    align-items:center; justify-content:center;
    background:rgba(0,0,0,.86); font-family:monospace; color:#d5dfc6;
  `;

  const line = entry => Array.isArray(entry)
    ? `<div style="display:flex; gap:10px; margin:3px 0">
         <span style="min-width:104px; color:#e0c78e; font-weight:bold">${entry[0]}</span>
         <span style="color:#c7d0bf">${entry[1]}</span>
       </div>`
    : `<div style="margin:3px 0; color:#aab3a6; line-height:1.5">${entry}</div>`;

  screen.innerHTML = `
    <div style="width:min(980px, 96vw); max-height:94vh; overflow:auto; background:#0c110f;
      border:1px solid #6c7a62; padding:20px 24px">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:12px">
        <div>
          <div style="color:#9eae8e; font-size:11px; letter-spacing:3px">PROJECT: NASARETH</div>
          <div style="font-size:24px; letter-spacing:4px; color:#dce8c9; font-weight:bold">HOW TO PLAY</div>
        </div>
        <button id="help-close" style="padding:7px 14px; font:bold 11px monospace; letter-spacing:2px;
          background:#3a4a2c; color:#e6f3c9; border:1px solid #a9c48e; cursor:pointer">CLOSE</button>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(290px, 1fr)); gap:12px; font-size:11px">
        ${SECTIONS.map(section => `
          <div style="border:1px solid #343b36; background:#101613; padding:12px">
            <div style="color:#8fb7c9; font-size:12px; font-weight:bold; letter-spacing:2px; margin-bottom:7px">${section.title}</div>
            ${section.lines.map(line).join('')}
          </div>`).join('')}
      </div>

      <div style="margin-top:12px; color:#6a7368; font-size:11px; letter-spacing:1px">PRESS F1 OR ESC TO CLOSE</div>
    </div>`;

  document.body.append(button, screen);

  let open = false;

  function close() {
    open = false;
    screen.style.display = 'none';
  }

  function toggle() {
    open = !open;
    screen.style.display = open ? 'flex' : 'none';
  }

  screen.querySelector('#help-close').addEventListener('click', close);

  button.addEventListener('click', () => {
    button.blur();
    toggle();
  });

  for (const element of [button, screen]) {
    element.addEventListener('pointerdown', event => event.stopPropagation());
    element.addEventListener('mousedown', event => event.stopPropagation());
  }

  return { toggle, close, isOpen: () => open };
}
