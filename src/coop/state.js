// Shared co-op flags, read by the boss files and the game.
// Solo play never changes these, so every boss stays exactly as before.
import { difficultyFor } from './difficulty.js';

export const coopState = {
  active: false,              // true while playing multiplayer
  players: 1,                 // difficulty tier (number of players)
  difficulty: difficultyFor(1)
};

export function setCoopPlayers(players) {
  coopState.players = Math.max(1, Math.min(4, players));
  coopState.difficulty = difficultyFor(coopState.players);
}

export function setCoopActive(active) {
  coopState.active = Boolean(active);
  if (!coopState.active) setCoopPlayers(1);
}
