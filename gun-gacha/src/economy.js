// Prices, bonuses, and number formatting. No DOM here, so it can be unit tested.
import { CASES, RARITY_BY_ID, WEAR_BY_ID, SKIN_BY_ID } from './data.js';

// Price of the next roll after `rolls` previous rolls of this case.
export function rollCost(caseId, rolls) {
  const c = CASES[caseId];
  return Math.ceil(c.base * Math.pow(c.growth, rolls));
}

// Total price of the next `count` rolls in a row (used by "Open x10").
export function multiRollCost(caseId, rolls, count) {
  let total = 0;
  for (let i = 0; i < count; i++) total += rollCost(caseId, rolls + i);
  return total;
}

// Bonus of one item: rarity base bonus times wear multiplier.
// Guns give $ per click, attachments give auto clicks per second.
export function itemBonus(skin, wearId) {
  const rarity = RARITY_BY_ID[skin.rarity];
  const base = skin.kind === 'gun' ? rarity.gunClick : rarity.attCps;
  return base * WEAR_BY_ID[wearId].mult;
}

// Inventory keys look like "gun:ak-47-night-circuit|fn".
export function splitKey(key) {
  const [skinId, wearId] = key.split('|');
  return { skin: SKIN_BY_ID[skinId], wearId };
}

function sumBonuses(items) {
  let total = 0;
  for (const [key, count] of Object.entries(items)) {
    const { skin, wearId } = splitKey(key);
    if (skin && WEAR_BY_ID[wearId]) total += itemBonus(skin, wearId) * count;
  }
  return total;
}

// $ earned per click: 1 from the starter gun + every gun you own.
export function clickValue(state) {
  return 1 + sumBonuses(state.guns);
}

// Automatic clicks per second from every attachment you own.
export function clicksPerSecond(state) {
  return sumBonuses(state.atts);
}

const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

// 12.5 -> "12.5", 12345 -> "12,345", 1234567 -> "1.23M"
export function formatNumber(n) {
  if (!Number.isFinite(n)) return '∞';
  if (n < 10) return String(Math.round(n * 100) / 100);
  if (n < 100) return String(Math.round(n * 10) / 10);
  if (n < 1e6) return Math.floor(n).toLocaleString('en-US');
  const tier = Math.min(Math.floor(Math.log10(n) / 3), UNITS.length - 1);
  return (n / Math.pow(1000, tier)).toFixed(2) + UNITS[tier];
}

export const formatMoney = n => '$' + formatNumber(n);
