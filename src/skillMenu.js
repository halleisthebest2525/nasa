// ==========================================
// MARTIAL ARTS MENU (K)
// Shows every technique with its numbers, price, requirement and status,
// and lets the player buy the ones they are allowed to learn.
//
//   LOCKED     the requirement (world reached / boss beaten) is not met
//   AVAILABLE  requirement met and enough scraps -> can be bought
//   UNLOCKED   already learned
// ==========================================

import { SKILLS, drawSkillIcon, skillDamageText } from './martialArts.js';

const STATUS_LOOK = {
  unlocked: { label: 'UNLOCKED', color: '#7fbf6a' },
  available: { label: 'AVAILABLE', color: '#e0c78e' },
  poor: { label: 'NEED MORE SCRAPS', color: '#c98a5a' },
  locked: { label: 'LOCKED', color: '#6a7368' }
};

const TYPE_TEXT = {
  melee: 'CLOSE RANGE',
  dash: 'DASH',
  projectile: 'RANGED',
  combo: 'COMBO'
};

// game = { arts (from createMartialArts), getScraps() }
export function createSkillMenu(game) {
  const screen = document.createElement('div');

  screen.style.cssText = `
    position:fixed; inset:0; z-index:78; display:none;
    align-items:center; justify-content:center;
    background:rgba(0,0,0,.84); font-family:monospace; color:#d5dfc6;
  `;

  document.body.appendChild(screen);

  let open = false;
  let message = '';
  let messageColor = '#9eae8e';

  function iconUrl(id, learned) {
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 48;
    drawSkillIcon(canvas.getContext('2d'), id, 4, 4, 40, learned ? '#e8ecdc' : '#77807a');
    return canvas.toDataURL();
  }

  function card(skill) {
    const state = game.arts.status(skill.id);
    const look = STATUS_LOOK[state];
    const learned = state === 'unlocked';
    const range = skill.type === 'dash'
      ? `${skill.range} (DISTANCE)`
      : skill.type === 'combo' ? `${skill.range} / ${skill.finisherRange}` : skill.range;

    let button = '';

    if (learned) {
      button = `<div style="color:#7fbf6a;font-size:11px;letter-spacing:1px">LEARNED · PRESS ${skill.key} TO USE</div>`;
    } else {
      const canBuy = state === 'available';

      button = `
        <button class="skill-buy" data-skill="${skill.id}" style="
          width:100%; padding:7px; font:bold 11px monospace; letter-spacing:1px; cursor:pointer;
          background:${canBuy ? '#3a4a2c' : '#1b211d'};
          color:${canBuy ? '#e6f3c9' : '#7b857b'};
          border:1px solid ${canBuy ? '#a9c48e' : '#3a423c'};
        ">${state === 'locked' ? 'LOCKED' : `LEARN · ${skill.cost} SCRAPS`}</button>`;
    }

    return `
      <div style="
        border:1px solid ${learned ? '#4d6a45' : state === 'available' ? '#8a7a4e' : '#343b36'};
        background:#101613; padding:12px; display:flex; flex-direction:column; gap:7px;
        opacity:${state === 'locked' ? 0.62 : 1};
      ">
        <div style="display:flex; gap:10px; align-items:center">
          <img src="${iconUrl(skill.id, learned)}" width="48" height="48" alt=""
            style="image-rendering:pixelated; background:#0a0e0c; border:1px solid #2c332e">
          <div style="flex:1; min-width:0">
            <div style="color:#8a9486; font-size:10px; letter-spacing:2px">TIER ${skill.tier} · ${skill.world}</div>
            <div style="color:#e8ecdc; font-size:14px; font-weight:bold; letter-spacing:1px">${skill.name}</div>
            <div style="color:${look.color}; font-size:10px; letter-spacing:2px">${look.label}</div>
          </div>
        </div>

        <div style="color:#aab3a6; font-size:11px; line-height:1.45; min-height:32px">${skill.description}</div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:3px 10px; font-size:11px; color:#c7d0bf">
          <div>DAMAGE <b style="color:#fff">${skillDamageText(skill)}</b></div>
          <div>RANGE <b style="color:#fff">${range}</b></div>
          <div>COOLDOWN <b style="color:#fff">${skill.cooldown}s</b></div>
          <div>TYPE <b style="color:#fff">${TYPE_TEXT[skill.type]}</b></div>
        </div>

        <div style="color:#8fb7c9; font-size:10px; line-height:1.4">${skill.special}</div>

        <div style="font-size:10px; color:${state === 'locked' ? '#c98a5a' : '#7b857b'}; line-height:1.4">
          ${skill.cost === 0 ? '' : `COST ${skill.cost} SCRAPS · `}REQUIRES: ${skill.requireText}
        </div>

        <div style="margin-top:auto">${button}</div>
      </div>`;
  }

  function render() {
    screen.innerHTML = `
      <div style="
        width:min(940px, 96vw); max-height:94vh; overflow:auto;
        background:#0c110f; border:1px solid #6c7a62; padding:20px 22px;
      ">
        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:6px">
          <div>
            <div style="color:#9eae8e; font-size:11px; letter-spacing:3px">NO WEAPONS · ONLY YOUR OWN BODY</div>
            <div style="font-size:24px; letter-spacing:4px; color:#dce8c9; font-weight:bold">MARTIAL ARTS</div>
          </div>
          <div style="text-align:right">
            <div style="color:#8a9486; font-size:10px; letter-spacing:2px">YOUR SCRAPS</div>
            <div style="color:#e0c78e; font-size:22px; font-weight:bold">${game.getScraps()}</div>
          </div>
        </div>

        <div style="color:#7b857b; font-size:11px; margin-bottom:12px; line-height:1.5">
          Worlds and bosses decide what you CAN learn. Scraps decide what you can AFFORD.
          Learned skills are yours forever. Use them with the number keys (PUNCH is also SPACE / CLICK).
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(270px, 1fr)); gap:10px">
          ${SKILLS.map(card).join('')}
        </div>

        <div id="skill-message" style="
          min-height:18px; margin-top:12px; font-size:12px; letter-spacing:1px; color:${messageColor};
        ">${message}</div>

        <div style="margin-top:6px; color:#6a7368; font-size:11px; letter-spacing:1px">PRESS K OR ESC TO CLOSE</div>
      </div>`;

    for (const button of screen.querySelectorAll('.skill-buy')) {
      button.addEventListener('click', () => {
        const result = game.arts.buy(button.dataset.skill);

        message = result.message;
        messageColor = result.ok ? '#a9d98c' : '#e0906a';
        render();   // status, balance and buttons update straight away
      });
    }
  }

  return {
    toggle() {
      open = !open;
      message = '';
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
