const speed = document.querySelector('#speed');
const meter = document.querySelector('#speed-meter');
const coords = document.querySelector('#coords');

// Find the existing hull display in the ship status panel.
const hullElements = [
  document.querySelector('#hull'),
  document.querySelector('#hull-value'),
  document.querySelector('#hull-percent'),
  document.querySelector('#hull-bar')
].filter(Boolean);

export function updateHud(ship, hull = 100) {
  const rpm = Math.min(
    Math.round(ship.speed * 25),
    4500
  );

  if (speed) speed.textContent = String(rpm);

  if (meter) {
    meter.style.width = `${rpm / 4500 * 100}%`;
  }

  if (coords) {
    coords.textContent =
      `SECTOR 01 · X ${Math.round(ship.x)} · Y ${Math.round(ship.y)}`;
  }

  // Update hull percentage and bar.
  for (const element of hullElements) {
    if (element.id === 'hull-bar') {
      element.style.width = `${hull}%`;
    } else {
      element.textContent = `${hull}%`;
    }

    element.style.color =
      hull <= 30 ? '#e45d4c' : '';
  }
}