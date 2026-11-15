// ==========================================
// STATS SECTION FOR THE B INVENTORY
// Left column: ship stats (from installed modules).
// Right column: player stats.
// ==========================================

import { CONFIG } from './config.js';

const ROW_HEIGHT = 16;
const ROWS = 11;

// game = {
//   survival,              the Survival object
//   getModuleStats(),      partsSystem.getStats()
//   getHull(),             { hull, hullMax }
// }
export function createStatsSection(game) {
  function shipRows() {
    const stats = game.getModuleStats();
    const { hull, hullMax } = game.getHull();
    const speed = stats.maxSpeedMultiplier || 1;

    return [
      ['TOP SPEED', `${Math.round(CONFIG.ship.maxSpeed * speed)}`],
      ['BOOST SPEED', `${Math.round(CONFIG.ship.boostSpeed * speed)}`],
      ['MAX ENGINE RPM', `${stats.maxRpm || 4500}`],
      ['ACCELERATION', `x${(stats.accelerationMultiplier || 1).toFixed(2)}`],
      ['FUEL USE', `x${(stats.fuelDrainMultiplier || 1).toFixed(2)}`],
      ['ENERGY REGEN', `+${((stats.passiveFuel || 0) * 60).toFixed(1)}/MIN`],
      ['FUEL TANK', `${Math.round(game.survival.fuel)} / ${stats.maxFuel}`],
      ['HULL', `${Math.round(hull)} / ${hullMax}`],
      ['LANDING ASSIST', `x${(stats.landingAssist || 1).toFixed(2)}`],
      ['CARGO (MED KITS)', `${stats.medkitCapacity || 5}`],
      ['WEIGHT', `${(stats.mass || 110).toFixed(1)}`]
    ];
  }

  function playerRows() {
    const s = game.survival;
    const progress = game.getProgress ? game.getProgress() : {};

    return [
      ['HEALTH', `${Math.round(s.health)}%`],
      ['SUIT O₂', `${Math.round(s.oxygen)}%`],
      ['SHIP O₂', `${Math.round(s.shipOxygen)}%`],
      ['STAMINA', `${Math.round(s.stamina)}%`],
      ['MOVEMENT', s.staminaExhausted ? 'EXHAUSTED' : 'NORMAL'],
      [
        'FLASHLIGHT',
        s.flashlightLevel > 0
          ? `LV ${s.flashlightLevel} · ${s.flashlightOn ? 'ON' : 'OFF'}`
          : 'NONE'
      ],
      ['DETECTOR', s.detectorOn ? 'ON' : 'OFF'],
      ['CHEST DETECTOR', progress.chestDetector ? 'YES' : 'NO'],
      ['MARS MAP', progress.marsMap ? 'ACQUIRED' : 'NONE'],
      ['MED KITS', `${s.medkits || 0} (H TO USE)`],
      ['MARTIAL ARTS', `${game.getSkillCount ? game.getSkillCount() : 1} / 5 SKILLS (K)`]
    ];
  }

  function drawColumn(ctx, title, rows, left, right, top) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#d5dfb4';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(title, left, top + 10);

    rows.forEach(([label, value], index) => {
      const rowY = top + 30 + index * ROW_HEIGHT;

      ctx.textAlign = 'left';
      ctx.fillStyle = '#a8ad9d';
      ctx.font = '11px monospace';
      ctx.fillText(label, left, rowY);

      ctx.textAlign = 'right';
      ctx.fillStyle = value === 'EXHAUSTED' ? '#e45d4c' : '#e0e1d8';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(value, right, rowY);
    });
  }

  return {
    height: 22 + ROWS * ROW_HEIGHT,

    draw(ctx, x, y, panelWidth) {
      const middle = x + panelWidth / 2;

      // Divider line above the section.
      ctx.strokeStyle = '#424b43';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 25, y - 6);
      ctx.lineTo(x + panelWidth - 25, y - 6);
      ctx.stroke();

      drawColumn(ctx, 'SHIP STATS', shipRows(), x + 28, middle - 14, y + 4);
      drawColumn(ctx, 'PLAYER STATS', playerRows(), middle + 14, x + panelWidth - 28, y + 4);
    }
  };
}
