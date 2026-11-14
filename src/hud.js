
const speed = document.querySelector('#speed');
const meter = document.querySelector('#speed-meter');
const coords = document.querySelector('#coords');

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

// maxRpm = the fitted engine's maximum output (4500 for the stock engine).
export function updateHud(ship, hull = 100, survival = null, mode = 'driving', scraps = 0, maxRpm = 4500) {
  const rpm = Math.min(Math.round(ship.speed * 25), maxRpm);

  if (speed) {
    speed.textContent = String(rpm);

    // The small label next to the number shows this engine's maximum.
    const unit = speed.nextElementSibling;
    const unitText = `/ ${maxRpm} RPM`;
    if (unit && unit.textContent !== unitText) unit.textContent = unitText;
  }

  if (meter) {
    meter.style.width = `${rpm / maxRpm * 100}%`;
  }

  if (coords) {
    coords.textContent =
      `SECTOR 01 · X ${Math.round(ship.x)} · Y ${Math.round(ship.y)}`;
  }

  // The hull display is handled by updateHull() in main.js.

  if (!survival) return;

  survivalPanel.innerHTML = `
    <div style="color:#aab99b;font-weight:bold;margin-bottom:10px">
      SURVIVAL SYSTEMS
    </div>
    ${resourceRow('FUEL', survival.fuel / (survival.maxFuel || 100) * 100, '#d5b66b')}
    ${resourceRow('SHIP O₂', survival.shipOxygen, '#77b9d4')}
    ${resourceRow('SUIT O₂', survival.oxygen, '#77b9d4')}
    ${resourceRow('HEALTH', survival.health, '#c66c60')}
    ${resourceRow('STAMINA', survival.stamina, '#9bbd78')}
    <div style="margin-top:8px;display:flex;justify-content:space-between;color:#e0c78e">
      <span>SCRAPS</span>
      <span>${scraps}</span>
    </div>
    <div style="margin-top:6px;color:#788274">
      MODE · ${mode.toUpperCase()}
    </div>
  `;
}
