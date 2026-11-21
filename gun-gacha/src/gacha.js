// Rolling logic: pick a rarity, then a skin of that rarity, then a wear.
import { RARITIES, WEARS, SKINS, PITY } from './data.js';
import { itemBonus } from './economy.js';

// Picks one entry from a list using each entry's `weight`. rng returns 0..1.
export function pickWeighted(list, rng = Math.random) {
  const total = list.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of list) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }
  return list[list.length - 1];
}

// Rolls one item from a case ('gun' or 'att').
// minRarity (optional) forces at least that rarity, e.g. 'mythic' for a pity pull.
// Pity pulls never give hidden (Secret) items.
export function rollItem(caseId, rng = Math.random, minRarity = null) {
  const minIndex = minRarity ? RARITIES.findIndex(r => r.id === minRarity) : 0;
  const choices = RARITIES.filter((r, i) =>
    i >= minIndex
    && !(minRarity && r.hidden)
    && SKINS.some(skin => skin.kind === caseId && skin.rarity === r.id)); // e.g. no Secret attachments
  const rarity = pickWeighted(choices, rng);
  const pool = SKINS.filter(skin => skin.kind === caseId && skin.rarity === rarity.id);
  const skin = pool[Math.floor(rng() * pool.length)] ?? pool[0];
  const wear = pickWeighted(WEARS, rng);
  return {
    skin,
    wearId: wear.id,
    key: skin.id + '|' + wear.id,
    bonus: itemBonus(skin, wear.id),
  };
}

// Rolls with pity. `pity` = { mythic, legendary } = opens since the last Mythic+ / Legendary.
// Updates the pity counters and returns the item.
export function rollWithPity(caseId, pity, rng = Math.random) {
  let minRarity = null;
  if (pity.legendary + 1 >= PITY.legendary) minRarity = 'legendary';
  else if (pity.mythic + 1 >= PITY.mythic) minRarity = 'mythic';

  const result = rollItem(caseId, rng, minRarity);
  pity.mythic++;
  pity.legendary++;
  const tier = RARITIES.findIndex(r => r.id === result.skin.rarity);
  if (tier >= RARITIES.findIndex(r => r.id === 'mythic')) pity.mythic = 0;       // Mythic, Legendary, Secret
  if (tier >= RARITIES.findIndex(r => r.id === 'legendary')) pity.legendary = 0; // Legendary, Secret
  result.pity = minRarity !== null;
  return result;
}

// Chance (in %) of each rarity, for the odds list on the case. Hidden (Secret) rarities are left out.
export function rarityOdds() {
  const total = RARITIES.reduce((sum, r) => sum + r.weight, 0);
  return RARITIES.filter(r => !r.hidden).map(r => ({ rarity: r, percent: (r.weight / total) * 100 }));
}
