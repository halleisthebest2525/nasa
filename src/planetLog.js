// ==========================================
// PLANET LOG (press P)
// Which destinations are beaten / unlocked, modules found on each,
// and the chance of each module rarity there.
// ==========================================

const DESTINATIONS = [
  { id: 'moon', name: 'THE MOON' },
  { id: 'mars', name: 'MARS' },
  { id: 'europa', name: 'EUROPA', note: 'MOON OF JUPITER' },
  { id: 'titan', name: 'TITAN', note: 'MOON OF SATURN' },
  { id: 'umbriel', name: 'UMBRIEL', note: 'MOON OF URANUS' }
];

const RARITIES = ['common', 'rare', 'epic', 'mythic', 'legendary'];
const COLORS = {
  common: '#b8b9ae', rare: '#71b9e8', epic: '#c18aff', mythic: '#ef9c66', legendary: '#f2d46f'
};

// game = {
//   getOdds(planet)        -> { common: 70, ... } or null
//   getLocked(planet)      -> ['mythic'] etc. (cannot drop yet)
//   isBeaten(planet), hasMap(planet)
//   getModuleProgress(planet) -> { found, total } or null (never visited)
// }
export function createPlanetLog(game) {
  const screen = document.createElement('div');

  screen.style.cssText = `
    position:fixed; inset:0; z-index:77; display:none;
    align-items:center; justify-content:center;
    background:rgba(0,0,0,.8); font-family:monospace; color:#d5dfc6;
  `;

  document.body.appendChild(screen);

  let open = false;

  function status(id) {
    if (game.isBeaten(id)) return ['BEATEN', '#7fbf6a'];
    if (id === 'moon' || game.hasMap(id)) {
      return game.getModuleProgress(id) ? ['IN PROGRESS', '#e0c78e'] : ['UNLOCKED · NOT VISITED', '#8fc3e8'];
    }
    if (id === 'europa' || id === 'titan' || id === 'umbriel') {
      return game.hasMap(id) ? ['MAP ACQUIRED · COMING SOON', '#8fc3e8'] : ['UNCHARTED', '#6a7368'];
    }
    return ['LOCKED · STAR MAP NEEDED', '#b5644e'];
  }

  function render() {
    const rows = DESTINATIONS.map(destination => {
      const [label, color] = status(destination.id);
      const odds = game.getOdds(destination.id) || {};
      const locked = game.getLocked(destination.id) || [];
      const progress = game.getModuleProgress(destination.id);

      const oddsCells = RARITIES.map(rarity => {
        const value = odds[rarity] ?? 0;
        const isLocked = locked.includes(rarity) && value > 0;

        return `<td style="color:${value ? COLORS[rarity] : '#4a514a'}">
          ${value}%${isLocked ? '<br><small style="color:#b5644e">BOSS</small>' : ''}
        </td>`;
      }).join('');

      return `
        <tr>
          <td class="log-name">
            ${destination.name}
            ${destination.note ? `<small>${destination.note}</small>` : ''}
          </td>
          <td style="color:${color}">${label}</td>
          <td>${progress ? `${progress.found} / ${progress.total}` : '–'}</td>
          ${oddsCells}
        </tr>
      `;
    }).join('');

    screen.innerHTML = `
      <style>
        .log-panel { width:min(820px,95vw); max-height:90vh; overflow:auto; padding:24px 26px;
          background:#151a18; border:1px solid #727c6d; box-shadow:0 20px 80px #000; }
        .log-panel h2 { margin:0 0 4px; font-size:22px; letter-spacing:4px; color:#dce8c9; }
        .log-panel p { margin:0 0 16px; color:#858b7e; font-size:11px; }
        .log-panel table { width:100%; border-collapse:collapse; font-size:12px; }
        .log-panel th { text-align:left; color:#9eae8e; font-size:10px; letter-spacing:2px;
          border-bottom:1px solid #3c493e; padding:6px 6px; }
        .log-panel td { padding:10px 6px; border-bottom:1px solid #222a26; vertical-align:top; }
        .log-name { color:#e0e1d8; font-weight:bold; letter-spacing:1px; }
        .log-name small { display:block; color:#6a7368; font-weight:normal; font-size:9px; }
      </style>
      <div class="log-panel">
        <h2>PLANET LOG</h2>
        <p>BEATEN = ALL MODULES COLLECTED AND THE CHEST OPENED. ODDS = CHANCE OF EACH MODULE RARITY.</p>
        <table>
          <tr>
            <th>DESTINATION</th><th>STATUS</th><th>MODULES</th>
            ${RARITIES.map(r => `<th style="color:${COLORS[r]}">${r.toUpperCase()}</th>`).join('')}
          </tr>
          ${rows}
        </table>
        <p style="margin:16px 0 0">PRESS P OR ESC TO CLOSE</p>
      </div>
    `;
  }

  return {
    toggle() {
      open = !open;
      screen.style.display = open ? 'flex' : 'none';
      if (open) render();
    },
    close() {
      open = false;
      screen.style.display = 'none';
    },
    isOpen: () => open
  };
}
