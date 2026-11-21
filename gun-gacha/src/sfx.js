// Tiny sound effects made with the Web Audio API (no audio files needed).
let ctx = null;
let muted = false;

export function setMuted(value) { muted = value; }

function audio() {
  if (muted) return null;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// Short noise burst = gunshot.
export function shot() {
  const ac = audio();
  if (!ac) return;
  const length = Math.floor(ac.sampleRate * 0.08);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
  const source = ac.createBufferSource();
  source.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1800;
  const gain = ac.createGain();
  gain.gain.value = 0.12;
  source.connect(filter).connect(gain).connect(ac.destination);
  source.start();
}

function tone(freq, duration, volume, type = 'sine', delay = 0) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration);
}

// Click while the case reel spins past each item.
export function tick() { tone(1400, 0.03, 0.05, 'square'); }

// Reveal chime: higher rarity = more notes.
export function reveal(rarityIndex) {
  const notes = [523, 659, 784, 1047, 1319, 1568, 2093];
  for (let i = 0; i <= rarityIndex; i++) tone(notes[i], 0.35, 0.08, 'triangle', i * 0.07);
}

export function denied() { tone(140, 0.15, 0.08, 'sawtooth'); }
