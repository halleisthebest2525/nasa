// Starts the game: clicking, auto-clicking, buying cases, inventory, saving.
import { CASES, RARITIES, SKINS, STARTER_GUN, WEAR_BY_ID, PITY } from './data.js';
import { rollCost, multiRollCost, clickValue, clicksPerSecond, splitKey, itemBonus, formatMoney, formatNumber } from './economy.js';
import { rollWithPity, rarityOdds } from './gacha.js';
import { loadGame, saveGame, newGame, clearSave } from './save.js';
import { itemArt } from './art.js';
import { itemCard, displayName } from './cards.js';
import { showOpening } from './caseOpening.js';
import * as sfx from './sfx.js';

const OFFLINE_RATE = 0.5;           // you earn 50% of your auto income while the game is closed
const OFFLINE_MAX_SECONDS = 8 * 3600;
const MULTI_ROLL = 10;

const $ = id => document.getElementById(id);
const els = {
  money: $('money'), perClick: $('per-click'), cps: $('cps'), perSec: $('per-sec'), clicks: $('total-clicks'),
  gunButton: $('gun-button'), gunName: $('gun-name'), gunMeta: $('gun-meta'), floatLayer: $('float-layer'),
  cases: $('cases'), invGrid: $('inventory-grid'), invSummary: $('inventory-summary'),
  tabs: document.querySelectorAll('.tab'), mute: $('mute'), reset: $('reset'), toast: $('toast'),
};

let state = loadGame() ?? newGame();
let perClick = 1;
let cps = 0;
let opening = false;
let resetting = false;
let inventoryTab = 'gun';
let lastShotSound = 0;
let lastFrame = Date.now();

function recalc() {
  perClick = clickValue(state);
  cps = clicksPerSecond(state);
}

function earn(amount) {
  state.money += amount;
  state.totalEarned += amount;
}

// ---------- Clicking ----------

function equippedGun() {
  if (state.equipped && state.guns[state.equipped]) {
    const { skin, wearId } = splitKey(state.equipped);
    if (skin) return { skin, wearId, bonus: itemBonus(skin, wearId) };
  }
  return { skin: STARTER_GUN, wearId: null, bonus: 1 };
}

function shoot(x, y) {
  earn(perClick);
  state.clicks++;

  els.gunButton.classList.remove('recoil');
  void els.gunButton.offsetWidth; // restart the recoil animation
  els.gunButton.classList.add('recoil');

  const now = performance.now();
  if (now - lastShotSound > 45) { sfx.shot(); lastShotSound = now; }

  if (els.floatLayer.childElementCount < 30) {
    const rect = els.floatLayer.getBoundingClientRect();
    const text = document.createElement('span');
    text.className = 'float';
    text.textContent = '+' + formatMoney(perClick);
    text.style.left = (x - rect.left) + 'px';
    text.style.top = (y - rect.top) + 'px';
    text.style.setProperty('--drift', (Math.random() * 60 - 30) + 'px');
    els.floatLayer.append(text);
    setTimeout(() => text.remove(), 900);
  }
  renderStats();
}

els.gunButton.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault();
  shoot(event.clientX, event.clientY);
});
els.gunButton.addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
    event.preventDefault();
    const rect = els.gunButton.getBoundingClientRect();
    shoot(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
});

// ---------- Cases ----------

const caseEls = {};

function buildCases() {
  const odds = rarityOdds();
  for (const c of Object.values(CASES)) {
    const box = document.createElement('section');
    box.className = 'case';
    box.dataset.case = c.id;

    const best = SKINS.find(s => s.id === c.showcase);
    box.innerHTML = `
      <div class="case-head">
        <div>
          <h3>${c.name}</h3>
          <p>${c.blurb}</p>
        </div>
        <span class="case-rolls"></span>
      </div>
      <div class="case-art"></div>
      <div class="pity"></div>
      <div class="case-buttons">
        <button type="button" class="btn btn-open" data-count="1">Open <span class="price"></span></button>
        <button type="button" class="btn btn-open btn-multi" data-count="${MULTI_ROLL}">Open ×${MULTI_ROLL} <span class="price"></span></button>
      </div>
      <details class="case-details">
        <summary>Drop odds &amp; contents</summary>
        <ul class="odds">${odds.map(o => `<li style="--rarity:${o.rarity.color}"><span>${o.rarity.name}</span><span>${o.percent < 1 ? o.percent.toFixed(1) : o.percent.toFixed(0)}%</span></li>`).join('')}</ul>
        <div class="contents"></div>
      </details>`;

    box.querySelector('.case-art').append(itemArt(best));

    // Contents grouped by rarity, best first.
    const contents = box.querySelector('.contents');
    for (const r of [...RARITIES].reverse().filter(r => !r.hidden)) {
      const group = document.createElement('div');
      group.className = 'rarity-group';
      group.style.setProperty('--rarity', r.color);
      group.innerHTML = `<h4>${r.name}</h4>`;
      const cards = document.createElement('div');
      cards.className = 'rarity-cards';
      for (const skin of SKINS.filter(s => s.kind === c.id && s.rarity === r.id)) {
        cards.append(itemCard(skin, null, { small: true }));
      }
      group.append(cards);
      contents.append(group);
    }

    const [one, multi] = box.querySelectorAll('.btn-open');
    one.addEventListener('click', () => openCase(c.id, 1));
    multi.addEventListener('click', () => openCase(c.id, MULTI_ROLL));
    caseEls[c.id] = { box, one, multi, rolls: box.querySelector('.case-rolls'), pity: box.querySelector('.pity') };
    els.cases.append(box);
  }
}

function openCase(caseId, count) {
  if (opening) return;
  const cost = multiRollCost(caseId, state.rolls[caseId], count);
  if (state.money < cost) {
    sfx.denied();
    const box = caseEls[caseId].box;
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
    return;
  }

  state.money -= cost;
  state.rolls[caseId] += count;
  const bag = caseId === 'gun' ? state.guns : state.atts;
  const results = [];
  for (let i = 0; i < count; i++) {
    const result = rollWithPity(caseId, state.pity[caseId]);
    result.isNew = !bag[result.key];
    bag[result.key] = (bag[result.key] || 0) + 1;
    results.push(result);
  }

  // Automatically show off the best gun you own.
  if (caseId === 'gun') {
    const best = results.reduce((a, b) => (b.bonus > a.bonus ? b : a));
    if (best.bonus > equippedGun().bonus) state.equipped = best.key;
  }

  recalc();
  saveGame(state);
  opening = true;
  showOpening({
    caseId,
    caseName: CASES[caseId].name,
    results,
    onDone() {
      opening = false;
      inventoryTab = caseId;
      renderAll();
    },
  });
}

// ---------- Rendering ----------

function renderStats() {
  els.money.textContent = formatMoney(state.money);
  els.perClick.textContent = formatMoney(perClick);
  els.cps.textContent = formatNumber(cps);
  els.perSec.textContent = formatMoney(perClick * cps);
  els.clicks.textContent = formatNumber(state.clicks);

  for (const [id, ui] of Object.entries(caseEls)) {
    const one = rollCost(id, state.rolls[id]);
    const multi = multiRollCost(id, state.rolls[id], MULTI_ROLL);
    ui.one.querySelector('.price').textContent = formatMoney(one);
    ui.multi.querySelector('.price').textContent = formatMoney(multi);
    ui.one.classList.toggle('cant-afford', state.money < one);
    ui.multi.classList.toggle('cant-afford', state.money < multi);
    ui.rolls.textContent = 'Opened: ' + state.rolls[id];
    const pity = state.pity[id];
    const pityHtml = `<span class="pity-mythic">Mythic+ guaranteed in <b>${PITY.mythic - pity.mythic}</b></span>`
      + `<span class="pity-legendary">Legendary guaranteed in <b>${PITY.legendary - pity.legendary}</b></span>`;
    if (ui.pity.innerHTML !== pityHtml) ui.pity.innerHTML = pityHtml;
  }
}

function renderGun() {
  const { skin, wearId, bonus } = equippedGun();
  const rarity = RARITIES.find(r => r.id === skin.rarity);
  els.gunButton.replaceChildren(itemArt(skin));
  els.gunButton.style.setProperty('--rarity', rarity.color);
  els.gunButton.className = 'gun-button rarity-' + skin.rarity;
  els.gunName.textContent = displayName(skin);
  els.gunName.style.color = rarity.color;
  els.gunMeta.textContent = wearId
    ? `${rarity.name} · ${WEAR_BY_ID[wearId].name} · +$${formatNumber(bonus)} / click`
    : 'Starter gun · open a Weapon Case to get skins';
}

function renderInventory() {
  els.tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === inventoryTab));
  const bag = inventoryTab === 'gun' ? state.guns : state.atts;
  const items = Object.entries(bag)
    .map(([key, count]) => ({ key, count, ...splitKey(key) }))
    .filter(item => item.skin)
    .map(item => ({ ...item, bonus: itemBonus(item.skin, item.wearId) }))
    .sort((a, b) => b.bonus - a.bonus);

  els.invGrid.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = inventoryTab === 'gun'
      ? 'No gun skins yet. Click to earn money, then open a Weapon Case.'
      : 'No attachments yet. Open an Attachment Case to start auto-clicking.';
    els.invGrid.append(empty);
  }
  for (const item of items) {
    const isGun = inventoryTab === 'gun';
    const card = itemCard(item.skin, item.wearId, {
      count: item.count, bonus: item.bonus, button: isGun, equipped: isGun && item.key === state.equipped,
    });
    if (isGun) {
      card.addEventListener('click', () => {
        state.equipped = item.key;
        saveGame(state);
        renderGun();
        renderInventory();
      });
    }
    els.invGrid.append(card);
  }

  const totalItems = items.reduce((sum, item) => sum + item.count, 0);
  els.invSummary.textContent = inventoryTab === 'gun'
    ? `${totalItems} guns · all of them stack: +${formatMoney(perClick - 1)} per click (click a gun to equip it)`
    : `${totalItems} attachments · ${formatNumber(cps)} auto clicks per second`;
}

function renderAll() {
  renderStats();
  renderGun();
  renderInventory();
}

els.tabs.forEach(tab => tab.addEventListener('click', () => {
  inventoryTab = tab.dataset.tab;
  renderInventory();
}));

// ---------- Settings ----------

function renderMute() {
  els.mute.textContent = state.muted ? '🔇 Sound off' : '🔊 Sound on';
  sfx.setMuted(state.muted);
}
els.mute.addEventListener('click', () => {
  state.muted = !state.muted;
  renderMute();
  saveGame(state);
});
els.reset.addEventListener('click', () => {
  if (!confirm('Delete your save and start over?')) return;
  resetting = true;
  clearSave();
  location.reload();
});

function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  setTimeout(() => { els.toast.hidden = true; }, 5000);
}

// ---------- Game loop & saving ----------

function frame() {
  const now = Date.now();
  const dt = Math.min((now - lastFrame) / 1000, OFFLINE_MAX_SECONDS);
  lastFrame = now;
  if (cps > 0) earn(perClick * cps * dt);
  renderStats();
  requestAnimationFrame(frame);
}

function persist() { if (!resetting) saveGame(state); }
setInterval(persist, 5000);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
window.addEventListener('beforeunload', persist);

// Start
recalc();
const away = Math.min((Date.now() - (state.lastSaved || Date.now())) / 1000, OFFLINE_MAX_SECONDS);
const offlineEarned = perClick * cps * away * OFFLINE_RATE;
if (offlineEarned >= 1) {
  earn(offlineEarned);
  toast(`While you were away your attachments earned ${formatMoney(offlineEarned)}`);
}
buildCases();
renderMute();
renderAll();
requestAnimationFrame(frame);

// Handy for testing in the browser console: GunGacha.state.money = 1e6
window.GunGacha = { get state() { return state; }, recalc: () => { recalc(); renderAll(); } };
