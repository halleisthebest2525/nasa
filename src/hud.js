
const speed = document.querySelector('#speed');
const meter = document.querySelector('#speed-meter');
const coords = document.querySelector('#coords');

const hullElements = [
  document.querySelector('#hull'),
  document.querySelector('#hull-value'),
  document.querySelector('#hull-percent'),
  document.querySelector('#hull-bar')
].filter(Boolean);

const survivalPanel = document.createElement('div');

survivalPanel.style.cssText = `
  position:fixed;
  left:18px;
  bottom:55px;
  z-index:20;
  width:190px;
  padding:12px;
  background:rgba(0,0,0,.82);
  border:1px solid #484b43;
  color:#d5d0c5;
  font:11px monospace;
  letter-spacing:1px;
  pointer-events:none;
`;

document.body.appendChild(survivalPanel);

function resourceRow(label, value, color) {
  const percentage = Math.max(0, Math.min(100, value));

  return `
    <div style="margin:8px 0">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span>${label}</span>
        <span>${Math.round(percentage)}%</span>
      </div>
      <div style="height:5px;background:#303630">
        <div style="
          width:${percentage}%;
          height:100%;
          background:${color};
        "></div>
      </div>
    </div>
  `;
}

export function updateHud(ship, hull = 100, survival = null, mode = 'driving') {
  const rpm = Math.min(Math.round(ship.speed * 25), 4500);

  if (speed) speed.textContent = String(rpm);

  if (meter) {
    meter.style.width = `${rpm / 4500 * 100}%`;
  }

  if (coords) {
    coords.textContent =
      `SECTOR 01 · X ${Math.round(ship.x)} · Y ${Math.round(ship.y)}`;
  }

  for (const element of hullElements) {
    if (element.id === 'hull-bar') {
      element.style.width = `${hull}%`;
    } else {
      element.textContent = `${hull}%`;
    }

    element.style.color = hull <= 30 ? '#e45d4c' : '';
  }

  if (!survival) return;

  survivalPanel.innerHTML = `
    <div style="color:#aab99b;font-weight:bold;margin-bottom:10px">
      SURVIVAL SYSTEMS
    </div>
    ${resourceRow('FUEL', survival.fuel, '#d5b66b')}
    ${resourceRow('SHIP O₂', survival.shipOxygen, '#77b9d4')}
    ${resourceRow('SUIT O₂', survival.oxygen, '#77b9d4')}
    ${resourceRow('HEALTH', survival.health, '#c66c60')}
    ${resourceRow('STAMINA', survival.stamina, '#9bbd78')}
    <div style="margin-top:8px;color:#788274">
      MODE · ${mode.toUpperCase()}
    </div>
  `;
}
