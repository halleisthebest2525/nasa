// ==========================================
// SOUND EFFECTS
// Short sounds made by code (Web Audio), so no sound files are needed.
// Every function is safe to call at any time: if the browser has no
// audio (or blocks it), nothing happens.
// ==========================================

const MASTER_VOLUME = 0.5;

let context = null;

function audio() {
  if (!context) {
    try {
      context = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
  }

  if (context.state === 'suspended') context.resume().catch(() => {});
  return context;
}

// A simple beep that can slide from one pitch to another.
function tone({ from, to = from, time = 0.1, type = 'square', volume = 0.1, delay = 0 }) {
  const ctx = audio();
  if (!ctx) return;

  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + time);

  gain.gain.setValueAtTime(volume * MASTER_VOLUME, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + time);

  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + time + 0.02);
}

// A burst of noise (thuds, whooshes).
function noise({ time = 0.1, volume = 0.15, cutoff = 1200, cutoffTo = cutoff, delay = 0 }) {
  const ctx = audio();
  if (!ctx) return;

  const start = ctx.currentTime + delay;
  const length = Math.max(1, Math.floor(ctx.sampleRate * time));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  source.buffer = buffer;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(cutoff, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, cutoffTo), start + time);

  gain.gain.setValueAtTime(volume * MASTER_VOLUME, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + time);

  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(start);
}

export const sfx = {
  // Scrap picked up: a quick rising chirp (higher for rarer scrap).
  pickup(rarity = 'common') {
    const base = { common: 660, rare: 830, epic: 990 }[rarity] || 660;

    tone({ from: base, to: base * 1.5, time: 0.07, volume: 0.09 });
    tone({ from: base * 1.5, to: base * 2, time: 0.09, volume: 0.08, delay: 0.06 });
  },

  punch() {
    noise({ time: 0.06, volume: 0.12, cutoff: 900, cutoffTo: 300 });
  },

  kick() {
    noise({ time: 0.13, volume: 0.16, cutoff: 1400, cutoffTo: 200 });
    tone({ from: 150, to: 70, time: 0.12, type: 'sine', volume: 0.12 });
  },

  dash() {
    noise({ time: 0.26, volume: 0.14, cutoff: 500, cutoffTo: 3200 });
  },

  wave() {
    tone({ from: 220, to: 660, time: 0.22, type: 'sawtooth', volume: 0.07 });
    noise({ time: 0.3, volume: 0.08, cutoff: 2600, cutoffTo: 600 });
  },

  bigWave() {
    tone({ from: 110, to: 520, time: 0.4, type: 'sawtooth', volume: 0.09 });
    tone({ from: 165, to: 780, time: 0.4, type: 'sine', volume: 0.08 });
    noise({ time: 0.45, volume: 0.1, cutoff: 3000, cutoffTo: 400 });
  },

  finisher() {
    noise({ time: 0.4, volume: 0.2, cutoff: 2400, cutoffTo: 120 });
    tone({ from: 300, to: 50, time: 0.4, type: 'sine', volume: 0.16 });
  },

  // An attack landed on a monster.
  hit() {
    noise({ time: 0.08, volume: 0.16, cutoff: 2200, cutoffTo: 500 });
    tone({ from: 190, to: 90, time: 0.08, type: 'triangle', volume: 0.12 });
  },

  // Skill learned.
  buy() {
    [523, 659, 784, 1047].forEach((frequency, index) =>
      tone({ from: frequency, time: 0.12, type: 'triangle', volume: 0.1, delay: index * 0.08 }));
  },

  // Can't afford it / still locked.
  deny() {
    tone({ from: 160, to: 110, time: 0.16, type: 'square', volume: 0.07 });
  }
};
