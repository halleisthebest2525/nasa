// ==========================================
// IN-GAME SOUNDTRACK
// main.js tells this file what is happening (a "situation" name such as
// 'travel', 'moon', 'shop', 'danger') and the matching track fades in while
// the old one fades out. Track files are listed in music.txt.
//
//   travel  Going to Moon.mp3   flying through open space, and everything
//                               at Earth (launch pad, orbit, shipyard)
//   moon / mars / europa / titan / uranus   on (or close to) that world
//   shop    Shopping shop.mp3   the ship computer / shop
//   danger  Monster.mp3         monsters chasing you, the boss, the Asteroid Belt
//   sting   monster-appears.mp3 short one-shot when a monster spots you
// ==========================================

const VOLUME = 0.35;        // same loudness as the menu music
const FADE_SECONDS = 1.6;   // crossfade time between two tracks
const QUICK_STOP = { danger: 0.3 };   // these tracks stop almost at once
const STING_VOLUME = 0.5;

export function createMusic() {
  const paths = {};
  const players = {};   // situation -> Audio (created the first time it is needed)
  const loops = {};     // name -> Audio for repeating sounds (footsteps)
  let current = null;
  let duck = 1;         // quieter while paused
  let retryTimer = 0;

  fetch('./music.txt')
    .then(response => response.text())
    .then(text => {
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const split = trimmed.indexOf('=');
        if (split < 0) continue;

        paths[trimmed.slice(0, split).trim()] = encodeURI(trimmed.slice(split + 1).trim());
      }
    })
    .catch(error => console.warn('Soundtrack: could not read music.txt', error));

  function player(name) {
    if (players[name]) return players[name];
    if (!paths[name]) return null;

    const audio = new Audio(paths[name]);
    audio.loop = true;
    audio.volume = 0;
    audio.preload = 'auto';
    audio.addEventListener('error', () => console.warn('Soundtrack: failed to load', paths[name]));

    players[name] = audio;
    return audio;
  }

  return {
    // situation = a track name from music.txt, or null for silence.
    // paused = the game is paused (music gets quieter).
    update(dt, situation, paused = false) {
      current = situation;
      if (current) player(current);

      duck += ((paused ? 0.4 : 1) - duck) * Math.min(1, dt * 4);
      retryTimer = Math.max(0, retryTimer - dt);

      const step = VOLUME * dt / FADE_SECONDS;

      for (const [name, audio] of Object.entries(players)) {
        const target = name === current ? VOLUME * duck : 0;
        const stopStep = QUICK_STOP[name] ? VOLUME * dt / QUICK_STOP[name] : step;
        const volume = audio.volume < target
          ? Math.min(target, audio.volume + step)
          : Math.max(target, audio.volume - stopStep);

        audio.volume = Math.max(0, Math.min(1, volume));

        if (name === current && audio.paused && retryTimer <= 0) {
          // Browsers can block audio until the player clicks; try again later.
          retryTimer = 1;
          audio.play().catch(() => {});
        } else if (name !== current && audio.volume <= 0 && !audio.paused) {
          audio.pause();   // keeps its position, so it resumes where it left off
        }
      }
    },

    // Is there a file for this name in music.txt?
    has: name => Boolean(paths[name]),

    // A sound that repeats while "on" is true (e.g. footsteps).
    // Does nothing when music.txt has no entry with this name.
    setLoop(name, on, volume = 0.4) {
      if (!paths[name]) return;

      if (!loops[name]) {
        loops[name] = new Audio(paths[name]);
        loops[name].loop = true;
        loops[name].volume = volume;
      }

      const audio = loops[name];

      if (on && audio.paused) audio.play().catch(() => {});
      else if (!on && !audio.paused) audio.pause();
    },

    // Short one-shot sound on top of the music.
    sting(name = 'sting') {
      if (!paths[name]) return;

      const audio = new Audio(paths[name]);
      audio.volume = STING_VOLUME;
      audio.play().catch(() => {});
    },

    current: () => current
  };
}
