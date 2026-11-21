// Builds the item cards used in the inventory, the case reel, and the reveal screen.
import { RARITY_BY_ID, WEAR_BY_ID } from './data.js';
import { formatNumber } from './economy.js';
import { itemArt } from './art.js';

export function displayName(skin) {
  return skin.base + ' | ' + skin.name;
}

export function bonusText(skin, bonus) {
  return skin.kind === 'gun'
    ? '+$' + formatNumber(bonus) + ' / click'
    : '+' + formatNumber(bonus) + ' clicks / sec';
}

// options: { small, count, bonus, isNew, equipped, button }
export function itemCard(skin, wearId, options = {}) {
  const rarity = RARITY_BY_ID[skin.rarity];
  const wear = wearId ? WEAR_BY_ID[wearId] : null;
  const card = document.createElement(options.button ? 'button' : 'div');
  card.className = 'card rarity-' + skin.rarity + (options.small ? ' card-small' : '') + (options.equipped ? ' equipped' : '');
  card.style.setProperty('--rarity', rarity.color);
  if (options.button) card.type = 'button';

  const art = document.createElement('div');
  art.className = 'card-art';
  art.append(itemArt(skin));
  card.append(art);

  const base = document.createElement('div');
  base.className = 'card-base';
  base.textContent = skin.base;
  const name = document.createElement('div');
  name.className = 'card-name';
  name.textContent = skin.name;
  card.append(base, name);

  if (!options.small) {
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.textContent = rarity.name + (wear ? ' · ' + wear.name : '');
    card.append(meta);
  }
  if (options.bonus !== undefined) {
    const bonus = document.createElement('div');
    bonus.className = 'card-bonus';
    bonus.textContent = bonusText(skin, options.bonus);
    card.append(bonus);
  }
  if (options.count > 1) {
    const count = document.createElement('span');
    count.className = 'badge badge-count';
    count.textContent = '×' + options.count;
    card.append(count);
  }
  if (options.isNew) {
    const tag = document.createElement('span');
    tag.className = 'badge badge-new';
    tag.textContent = 'NEW';
    card.append(tag);
  }
  if (options.equipped) {
    const tag = document.createElement('span');
    tag.className = 'badge badge-equipped';
    tag.textContent = 'EQUIPPED';
    card.append(tag);
  }
  card.title = displayName(skin) + (wear ? ' (' + wear.name + ')' : '');
  return card;
}
