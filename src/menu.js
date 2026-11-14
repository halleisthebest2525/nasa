
import { readSaves, removeSave } from './saveSystem.js';
import './menuJupiter.js'; // animated Jupiter on the launch page

const menu = document.querySelector('#main-menu');
const game = document.querySelector('#game');
const pauseMenu = document.querySelector('#pause-menu');

const views = {
  home: document.querySelector('#view-home'),
  singleplayer: document.querySelector('#view-singleplayer'),
  saves: document.querySelector('#view-saves')
};

let gameStarted = false;

// ==========================================
// MUSIC
// ==========================================

let menuMusic = null;
let musicRequested = false;

async function loadMusic() {
  try {
    const response = await fetch('./music.txt');

    if (!response.ok) {
      throw new Error('Could not load music.txt');
    }

    const text = await response.text();

    const entries = {};

    text.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) return;

      const separator = trimmed.indexOf('=');

      if (separator === -1) return;

      const name = trimmed.slice(0, separator).trim();
      const path = trimmed.slice(separator + 1).trim();

      if (name && path) {
        entries[name] = path;
      }
    });

    if (!entries.mainmenu) {
      throw new Error('mainmenu music path is missing');
    }

    menuMusic = new Audio(entries.mainmenu);
    menuMusic.loop = true;
    menuMusic.volume = 0.35;
    menuMusic.preload = 'auto';

    menuMusic.addEventListener('error', () => {
      console.error('Menu music failed to load:', entries.mainmenu);
    });

    if (musicRequested) {
      playMenuMusic();
    }
  } catch (error) {
    console.error('Music system:', error);
  }
}

function playMenuMusic() {
  if (!menuMusic || gameStarted) return;

  const playback = menuMusic.play();

  if (playback) {
    playback.catch(error => {
      console.warn('Menu music playback was blocked:', error);
    });
  }
}

// Browsers require user interaction before audio can play.
document.addEventListener('click', () => {
  musicRequested = true;
  playMenuMusic();
});

document.addEventListener('keydown', () => {
  musicRequested = true;
  playMenuMusic();
});

loadMusic();

// ==========================================
// MENU
// ==========================================



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
      ? (snapshot.landedPlanet === 'mars' ? 'MARTIAN SURFACE' : 'LUNAR SURFACE')
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

    // Stop menu music when the expedition begins.
    if (menuMusic) {
      menuMusic.pause();
      menuMusic.currentTime = 0;
    }

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

    playMenuMusic();
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
