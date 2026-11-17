// ==========================================
// MULTIPLAYER MENU + LOBBY (main menu screens)
// Host: HOST A GAME -> share the room code -> START.
// Guest: type the code -> JOIN -> wait for the host to start.
// Players who join after the start go straight into the running game.
// ==========================================

import {
  session, hostSession, joinSession, leaveSession, startSession,
  onRoster, on, isHost, playerColor, cleanName
} from './session.js';
import { setCoopActive, setCoopPlayers } from './state.js';
import { describeDifficulty, MAX_PLAYERS } from './difficulty.js';
import { cleanRoomCode, useLocalTransport } from './net.js';

const NAME_KEY = 'nasareth.coop-name';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// options = { showView(name), startGame(snapshot, { skipPrologue }), readSaves() }
export function setupLobby({ showView, startGame, readSaves }) {
  const $ = selector => document.querySelector(selector);
  const nameInput = $('#coop-name');
  const codeInput = $('#coop-code');
  const status = $('#coop-status');
  const lobbyStatus = $('#lobby-status');
  const saveSelect = $('#lobby-save');
  let busy = false;
  let launched = false;

  try {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved) nameInput.value = saved;
  } catch { /* storage blocked: keep the default name */ }

  function pilotName() {
    const name = cleanName(nameInput.value);
    nameInput.value = name;
    try { localStorage.setItem(NAME_KEY, name); } catch { /* not important */ }
    return name;
  }

  function setBusy(value, text = '') {
    busy = value;
    status.textContent = text;
    $('#coop-host').disabled = value;
    $('#coop-join').disabled = value;
  }

  // ---------- lobby screen ----------
  function renderLobby() {
    const players = session.players;
    $('#lobby-code').textContent = session.code || '-----';
    $('#lobby-hint').textContent = isHost()
      ? `SHARE THIS CODE WITH YOUR CREW · ${players.length} / ${MAX_PLAYERS} PILOTS${useLocalTransport() ? ' · LOCAL TEST MODE' : ''}`
      : 'CONNECTED · WAITING FOR THE HOST TO START';

    $('#lobby-players').innerHTML = players.map(player => `
      <div class="coop-player">
        <span style="color:${playerColor(player.id)}">${escapeHtml(player.name)}${player.id === session.myId ? ' (YOU)' : ''}</span>
        <small>${player.id === 'host' ? 'HOST' : 'CREW'}</small>
      </div>`).join('');

    $('#lobby-difficulty').innerHTML = players.length >= 2
      ? `DIFFICULTY: ${describeDifficulty(players.length)}`
      : 'WAITING FOR AT LEAST ONE MORE PILOT…<br>2 PLAYERS AND 4 PLAYERS EACH HAVE THEIR OWN BOSS DIFFICULTY.';

    // (style, not "hidden": the menu CSS gives this box display:grid)
    $('#lobby-host-actions').style.display = isHost() ? '' : 'none';
    const ready = isHost() && players.length >= 2 && !launched;
    $('#lobby-start-new').disabled = !ready;
    $('#lobby-start-save').disabled = !ready || !saveSelect.options.length || saveSelect.value === '';
  }

  function fillSaves() {
    const saves = readSaves();
    saveSelect.innerHTML = saves.length
      ? saves.map(save => `<option value="${escapeHtml(save.id)}">${escapeHtml(save.name)}</option>`).join('')
      : '<option value="">NO SAVED GAMES</option>';
  }

  function openLobby() {
    fillSaves();
    lobbyStatus.textContent = '';
    showView('lobby');
    renderLobby();
  }

  onRoster(() => {
    if (!$('#view-lobby').hidden) renderLobby();
  });

  // ---------- starting the game ----------
  function launch(info, lateJoin = false) {
    if (launched) return;
    launched = true;
    setCoopActive(true);
    setCoopPlayers(Number(info?.players) || session.players.length);
    // The story crawl plays only for a brand-new expedition.
    startGame(null, { skipPrologue: lateJoin || info?.mode !== 'new' });
  }

  function hostStart(snapshot) {
    if (!isHost() || launched || session.players.length < 2) return;
    const info = { mode: snapshot ? 'load' : 'new', players: session.players.length };
    launched = true;
    setCoopActive(true);
    setCoopPlayers(info.players);
    startSession(info);
    startGame(snapshot, { skipPrologue: Boolean(snapshot) });
  }

  // Guests: the host pressed START.
  on('start', info => {
    if (!isHost()) launch(info);
  });

  // The host closed the room.
  on('host-lost', () => {
    if (isHost()) return;
    if (!launched) {
      leaveSession();
      showView('multiplayer');
      setBusy(false, 'THE HOST CLOSED THE ROOM');
    } else {
      // In the game: coopGame.js switches to solo play.
      setCoopActive(false);
    }
  });

  // ---------- buttons ----------
  $('#multiplayer-button').addEventListener('click', () => {
    setBusy(false, '');
    showView('multiplayer');
  });

  $('#back-home-coop').addEventListener('click', () => {
    if (!busy) showView('home');
  });

  $('#coop-host').addEventListener('click', async () => {
    if (busy) return;
    setBusy(true, 'OPENING A ROOM…');
    try {
      await hostSession(pilotName());
      setBusy(false, '');
      openLobby();
    } catch (error) {
      setBusy(false, String(error.message || error).toUpperCase());
    }
  });

  async function join() {
    if (busy) return;
    const code = cleanRoomCode(codeInput.value);
    codeInput.value = code;
    setBusy(true, `CONNECTING TO ROOM ${code}…`);

    try {
      const result = await joinSession(code, pilotName());
      setBusy(false, '');
      if (result.started) {
        // The crew is already playing: jump straight in.
        launch(result.startInfo, true);
      } else {
        openLobby();
      }
    } catch (error) {
      leaveSession();
      setBusy(false, String(error.message || error).toUpperCase());
    }
  }

  $('#coop-join').addEventListener('click', join);
  codeInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') join();
  });

  $('#lobby-start-new').addEventListener('click', () => hostStart(null));

  $('#lobby-start-save').addEventListener('click', () => {
    const save = readSaves().find(item => item.id === saveSelect.value);
    if (save) hostStart(save.snapshot);
  });

  saveSelect.addEventListener('change', renderLobby);

  $('#lobby-leave').addEventListener('click', () => {
    if (launched) return;
    leaveSession();
    showView('multiplayer');
    setBusy(false, 'YOU LEFT THE ROOM');
  });
}
