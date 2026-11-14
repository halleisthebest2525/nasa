import { readSaves, removeSave } from './saveSystem.js';

const menu = document.querySelector('#main-menu');
const game = document.querySelector('#game');
const pauseMenu = document.querySelector('#pause-menu');

const views = {
  home: document.querySelector('#view-home'),
  singleplayer: document.querySelector('#view-singleplayer'),
  saves: document.querySelector('#view-saves')
};

let gameStarted = false;

function showView(name) {
  for (const [key, view] of Object.entries(views)) {
    view.hidden = key !== name;
  }
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'UNKNOWN DATE';
  }

  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function renderSaveList() {
  const list = document.querySelector('#save-list');
  const saves = readSaves();

  if (!saves.length) {
    list.innerHTML = `
      <div class="empty-saves">
        <span class="empty-mark">—</span>
        <strong>NO EXPEDITIONS FOUND</strong>
        <p>Your saved games will appear here.</p>
      </div>
    `;

    return;
  }

  list.innerHTML = saves.map(save => {
    const snapshot = save.snapshot || {};
    const mode = snapshot.gameMode || 'driving';

    const location = mode === 'moon'
      ? 'LUNAR SURFACE'
      : mode === 'walking'
        ? 'WAYFARER INTERIOR'
        : 'DEEP SPACE';

    const minutes = snapshot.gameMinutes ?? 480;
    const hours = Math.floor(minutes / 60);
    const remainder = Math.floor(minutes % 60);

    return `
      <article class="save-card" data-save-id="${save.id}">
        <div class="save-card-top">
          <div>
            <span class="save-index">EXPEDITION RECORD</span>
            <h3>${escapeHtml(save.name)}</h3>
          </div>

          <span class="save-location">${location}</span>
        </div>

        <div class="save-meta">
          <span>${formatDate(save.savedAt)}</span>
          <span>HULL ${Math.round(snapshot.hull ?? 100)}%</span>
          <span>
            ${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}
            SHIP TIME
          </span>
        </div>

        <div class="save-actions">
          <button class="button button-primary load-save" data-id="${save.id}">
            LOAD EXPEDITION
          </button>

          <button
            class="button button-quiet delete-save"
            data-id="${save.id}"
            aria-label="Delete ${escapeHtml(save.name)}"
          >
            DELETE
          </button>
        </div>
      </article>
    `;
  }).join('');

  list.querySelectorAll('.load-save').forEach(button => {
    button.addEventListener('click', () => {
      const save = readSaves().find(
        item => item.id === button.dataset.id
      );

      if (save) {
        startGame(save.snapshot);
      }
    });
  });

  list.querySelectorAll('.delete-save').forEach(button => {
    button.addEventListener('click', () => {
      removeSave(button.dataset.id);
      renderSaveList();
    });
  });
}

async function startGame(snapshot = null) {
  if (gameStarted) return;

  gameStarted = true;

  const launchButton = document.querySelector('#new-game');

  if (launchButton) {
    launchButton.textContent = 'INITIALIZING';
  }

  if (snapshot) {
    localStorage.setItem(
      'nasareth.pending-load',
      JSON.stringify(snapshot)
    );
  } else {
    localStorage.removeItem('nasareth.pending-load');
  }

  try {
    await import('./main.js');

    game.classList.add('game-active');
    menu.classList.add('menu-hidden');
  } catch (error) {
    console.error('Project: Nasareth failed to start:', error);

    gameStarted = false;

    if (launchButton) {
      launchButton.textContent = 'NEW GAME';
    }

    document.querySelector('#launch-error').textContent =
      'SYSTEM START FAILED · CHECK THE CONSOLE FOR DETAILS';
  }
}

document
  .querySelector('#singleplayer-button')
  .addEventListener('click', () => {
    showView('singleplayer');
  });

document
  .querySelector('#back-home')
  .addEventListener('click', () => {
    showView('home');
  });

document
  .querySelector('#new-game')
  .addEventListener('click', () => {
    startGame(null);
  });

document
  .querySelector('#load-game')
  .addEventListener('click', () => {
    renderSaveList();
    showView('saves');
  });

document
  .querySelector('#back-singleplayer')
  .addEventListener('click', () => {
    showView('singleplayer');
  });

document
  .querySelector('#pause-resume')
  .addEventListener('click', () => {
    window.NasarethGame?.resume();
    pauseMenu.classList.remove('pause-visible');
  });

document
  .querySelector('#pause-save')
  .addEventListener('click', () => {
    const input = document.querySelector('#save-name');
    const name = input.value.trim() || 'Expedition';

    const saved = window.NasarethGame?.save(name);
    const status = document.querySelector('#save-status');

    if (saved) {
      status.textContent = `SAVED · ${saved.name.toUpperCase()}`;
      input.value = saved.name;
    } else {
      status.textContent = 'SAVE FAILED · STORAGE UNAVAILABLE';
    }
  });

document
  .querySelector('#pause-main-menu')
  .addEventListener('click', () => {
    window.NasarethGame?.save('Autosave');
    location.reload();
  });

window.addEventListener('nasareth:pause', () => {
  pauseMenu.classList.add('pause-visible');
  document.querySelector('#save-status').textContent = '';
});

window.addEventListener('nasareth:resume', () => {
  pauseMenu.classList.remove('pause-visible');
});

window.addEventListener('nasareth:saves-updated', () => {
  if (!views.saves.hidden) {
    renderSaveList();
  }
});

showView('home');