// The case-opening popup: a CS-style spinning reel for single rolls,
// and a grid reveal for x10 rolls.
import { RARITIES } from './data.js';
import { rollItem } from './gacha.js';
import { itemCard, displayName, bonusText } from './cards.js';
import * as sfx from './sfx.js';

const CARD_STEP = 158;   // must match .reel-card width (150px) + gap (8px) in style.css
const STRIP_LENGTH = 56;
const WIN_INDEX = 48;
const SPIN_MS = 5500;

const modal = document.getElementById('modal');
const title = document.getElementById('modal-title');
const reel = document.getElementById('reel');
const strip = document.getElementById('reel-strip');
const revealBox = document.getElementById('reveal');
const skipButton = document.getElementById('modal-skip');
const closeButton = document.getElementById('modal-close');

const rarityIndex = id => RARITIES.findIndex(r => r.id === id);

// results: array of { skin, wearId, bonus, isNew }. onDone runs when the player clicks Collect.
export function showOpening({ caseId, caseName, results, onDone }) {
  modal.hidden = false;
  modal.classList.remove('secret-drop');
  title.textContent = results.length > 1 ? `${caseName} ×${results.length}` : caseName;
  revealBox.innerHTML = '';
  revealBox.className = 'reveal';
  closeButton.hidden = true;
  skipButton.hidden = false;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    skipButton.hidden = true;
    showResults(results);
    closeButton.hidden = false;
    closeButton.focus();
  };

  closeButton.onclick = () => {
    modal.hidden = true;
    onDone();
  };

  // x10: the reel spins to the BEST item and can't be skipped. Single opens can be skipped.
  const shown = results.length === 1 ? results[0] : bestOf(results);
  reel.hidden = false;
  skipButton.hidden = results.length > 1;
  spinReel(caseId, shown, finish, results.length === 1);
}

// Highest rarity wins; if tied, the bigger bonus wins.
function bestOf(results) {
  return results.reduce((best, r) => {
    const diff = rarityIndex(r.skin.rarity) - rarityIndex(best.skin.rarity);
    return diff > 0 || (diff === 0 && r.bonus > best.bonus) ? r : best;
  });
}

function spinReel(caseId, winner, onStop, canSkip) {
  // Fill the strip with random "decoy" items and put the real prize at WIN_INDEX.
  strip.innerHTML = '';
  for (let i = 0; i < STRIP_LENGTH; i++) {
    const item = i === WIN_INDEX ? winner : rollItem(caseId);
    const card = itemCard(item.skin, null, { small: true });
    card.classList.add('reel-card');
    if (i === WIN_INDEX) card.classList.add('reel-winner');
    strip.append(card);
  }

  const center = reel.clientWidth / 2;
  const landing = 14 + Math.random() * (150 - 28); // where inside the card the marker stops
  const target = center - (WIN_INDEX * CARD_STEP + landing);

  strip.style.transition = 'none';
  strip.style.transform = 'translateX(0px)';
  void strip.offsetWidth; // force the browser to apply the start position first
  strip.style.transition = `transform ${SPIN_MS}ms cubic-bezier(.1,.7,.12,1)`;
  strip.style.transform = `translateX(${target}px)`;

  let stopped = false;
  let lastIndex = -1;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    strip.style.transition = 'none';
    strip.style.transform = `translateX(${target}px)`;
    strip.children[WIN_INDEX].classList.add('win');
    onStop();
  };

  // Play a tick each time a new card passes the center marker.
  const watch = () => {
    if (stopped) return;
    const x = new DOMMatrix(getComputedStyle(strip).transform).m41;
    const index = Math.floor((center - x) / CARD_STEP);
    if (index !== lastIndex) { lastIndex = index; sfx.tick(); }
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);

  strip.addEventListener('transitionend', stop, { once: true });
  setTimeout(stop, SPIN_MS + 300); // backup in case transitionend never fires
  skipButton.onclick = canSkip ? stop : null;
}

// Shows one big card: the item (single open) or the best item (x10).
function showResults(results) {
  const r = results.length === 1 ? results[0] : bestOf(results);
  revealBox.classList.add('reveal-single');
  const card = itemCard(r.skin, r.wearId, { bonus: r.bonus, isNew: r.isNew });
  card.classList.add('pop');
  const line = document.createElement('p');
  line.className = 'reveal-line';
  line.textContent = results.length === 1
    ? `You got ${displayName(r.skin)}: ${bonusText(r.skin, r.bonus)}`
    : `Best of ${results.length}: ${displayName(r.skin)} (${bonusText(r.skin, r.bonus)}). The other ${results.length - 1} items were added to your inventory.`;
  revealBox.append(card, line);
  if (r.skin.rarity === 'secret') {
    modal.classList.add('secret-drop');
    title.textContent = '★ SECRET DROP ★';
  }
  sfx.reveal(rarityIndex(r.skin.rarity));
}
