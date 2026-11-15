// ==========================================
// PROJECT: NASARETH - FINAL CUTSCENE ENGINE
// playOutro(options) plays the 23-frame animated comic ending and resolves
// when it ends or is skipped. The scenes live in scene-data.js.
//
// Layers (bottom to top): backdrop · full frames · comic panels · effects
// (inside each frame, on a 960x540 pixel canvas) · flash · captions ·
// filmstrip · skip control.
// ==========================================

import { SCENES, SLOTS, COLORS } from './scene-data.js';

const BASE = new URL('./', import.meta.url);
const LW = 960;
const LH = 540;
const VOID = '#04060b';

// ---------- small helpers ----------
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeOut = p => 1 - (1 - p) ** 3;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function el(tag, className, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (parent) parent.appendChild(node);
  return node;
}

function ensureCss() {
  const existing = document.getElementById('nso-css');
  if (existing) return existing.__ready || Promise.resolve();
  const link = document.createElement('link');
  link.id = 'nso-css';
  link.rel = 'stylesheet';
  link.href = new URL('cutscene.css', BASE).href;
  link.__ready = new Promise(resolve => {
    link.onload = resolve;
    link.onerror = resolve;
    setTimeout(resolve, 2500);
  });
  document.head.appendChild(link);
  return link.__ready;
}

// ---------- asset preloading ----------
const imageCache = new Map();

export function preloadOutro() {
  return Promise.all(SCENES.map(scene => {
    if (imageCache.has(scene.id)) return imageCache.get(scene.id);
    const promise = new Promise(resolve => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => resolve(img));
      img.onerror = () => {
        console.warn('[outro] missing illustration:', scene.image);
        resolve(null);
      };
      img.src = new URL(scene.image, BASE).href;
    });
    imageCache.set(scene.id, promise);
    return promise;
  }));
}

// ---------- pixel drawing on the 960x540 effect canvas ----------
function steppedGlow(ctx, x, y, r, color, alpha, steps = 5) {
  if (alpha <= 0.002 || r <= 0) return;
  ctx.fillStyle = color;
  for (let i = 0; i < steps; i++) {
    ctx.globalAlpha = alpha / steps;
    ctx.beginPath();
    ctx.arc(Math.round(x), Math.round(y), Math.max(1, r * (1 - i / steps)), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return total;
}

function pointAt(points, distance) {
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (distance <= seg) {
      const k = seg ? distance / seg : 0;
      return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
    }
    distance -= seg;
  }
  return points[points.length - 1];
}

function pixelPath(ctx, points, progress, width, color, alpha = 1) {
  const total = pathLength(points) * clamp(progress);
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  for (let d = 0; d <= total; d += 1) {
    const [x, y] = pointAt(points, d);
    ctx.fillRect(Math.round(x - width / 2), Math.round(y - width / 2), width, width);
  }
  ctx.globalAlpha = 1;
  return pointAt(points, total);
}

function ring(ctx, x, y, r, color, alpha, width = 2) {
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(Math.round(x), Math.round(y), Math.max(1, r), 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Each effect: init(fx, random) -> state, draw(ctx, fx, t, state, layer)
const EFFECTS = {
  twinkle: {
    init(fx, random) {
      const [x0, y0, x1, y1] = fx.rect;
      return Array.from({ length: fx.n }, () => ({
        x: Math.round(x0 + random() * (x1 - x0)), y: Math.round(y0 + random() * (y1 - y0)),
        phase: random() * 6.28, speed: 0.0015 + random() * 0.003, big: random() < 0.2
      }));
    },
    draw(ctx, fx, t, stars) {
      ctx.fillStyle = fx.color;
      for (const s of stars) {
        const a = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
        if (a < 0.55) continue;
        ctx.globalAlpha = (a - 0.55) / 0.45;
        ctx.fillRect(s.x, s.y, 1, 1);
        if (s.big && a > 0.85) {
          ctx.fillRect(s.x - 1, s.y, 3, 1);
          ctx.fillRect(s.x, s.y - 1, 1, 3);
        }
      }
      ctx.globalAlpha = 1;
    }
  },

  glow: {
    draw(ctx, fx, t, _s, layer) {
      if (t < (fx.start || 0) || (fx.end && t > fx.end)) return;
      const wave = 0.5 + 0.5 * Math.sin((t - (fx.start || 0)) / fx.period * Math.PI * 2);
      let a = fx.min + (fx.max - fx.min) * wave;
      if (fx.fadeTo !== undefined) a *= 1 + (fx.fadeTo - 1) * clamp(t / layer.scene.duration);
      steppedGlow(ctx, fx.x, fx.y, fx.r, fx.color, a);
    }
  },

  unveil: {
    draw(ctx, fx, t) {
      fx.points.forEach(([x, y], i) => {
        const on = fx.start + i * fx.interval;
        if (t < on) {
          ctx.fillStyle = VOID;
          ctx.globalAlpha = 0.74;
          ctx.beginPath();
          ctx.arc(x, y, fx.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else if (t < on + 700) {
          steppedGlow(ctx, x, y, fx.r * 0.9, fx.color, 0.55 * (1 - (t - on) / 700));
        }
      });
    }
  },

  sweep: {
    draw(ctx, fx, t) {
      const p = clamp((t - fx.start) / fx.dur);
      if (p <= 0 || p >= 1) return;
      const x = -fx.width + (LW + fx.width * 2) * p;
      ctx.save();
      if (fx.clip) {
        const [x0, y0, x1, y1] = fx.clip;
        ctx.beginPath();
        ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, 0, 0, Math.PI * 2);
        ctx.clip();
      }
      ctx.fillStyle = fx.color;
      for (let k = 0; k < 3; k++) {
        const w = fx.width * (1 - k * 0.3);
        ctx.globalAlpha = fx.alpha / 3;
        ctx.beginPath();
        ctx.moveTo(x - w / 2 + 60, 0);
        ctx.lineTo(x + w / 2 + 60, 0);
        ctx.lineTo(x + w / 2 - 60, LH);
        ctx.lineTo(x - w / 2 - 60, LH);
        ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  },

  sequence: {
    draw(ctx, fx, t) {
      fx.points.forEach(([x, y], i) => {
        const on = fx.start + i * fx.interval;
        if (t < on) return;
        const fresh = clamp(1 - (t - on) / 500);
        steppedGlow(ctx, x, y, fx.r, fx.color, fx.alpha * (0.55 + 0.45 * fresh));
      });
    }
  },

  lightsUp: {
    draw(ctx, fx, t) {
      const p = clamp((t - fx.start) / fx.dur);
      const a = fx.from * (1 - Math.floor(p * 6) / 6);
      if (a <= 0) return;
      ctx.fillStyle = VOID;
      ctx.globalAlpha = a;
      ctx.fillRect(0, 0, LW, LH);
      ctx.globalAlpha = 1;
    }
  },

  activate: {
    draw(ctx, fx, t) {
      fx.rects.forEach(([x0, y0, x1, y1], i) => {
        const on = fx.start + i * fx.interval;
        if (t < on) {
          ctx.fillStyle = VOID;
          ctx.globalAlpha = 0.86;
          ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        } else if (t < on + 450) {
          ctx.fillStyle = fx.color;
          ctx.globalAlpha = 0.5 * (1 - (t - on) / 450);
          ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        }
        ctx.globalAlpha = 1;
      });
    }
  },

  scan: {
    draw(ctx, fx, t) {
      const [x0, y0, x1, y1] = fx.rect;
      const y = Math.round(y0 + ((t % fx.period) / fx.period) * (y1 - y0));
      ctx.fillStyle = fx.color;
      ctx.globalAlpha = 0.08;
      ctx.fillRect(x0, Math.max(y0, y - 14), x1 - x0, Math.min(14, y - y0));
      ctx.globalAlpha = 0.32;
      ctx.fillRect(x0, y, x1 - x0, 2);
      ctx.globalAlpha = 1;
    }
  },

  pulse: {
    draw(ctx, fx, t) {
      if (t < fx.at) return;
      let local = t - fx.at;
      if (fx.repeat) local %= fx.repeat;
      const p = local / fx.dur;
      if (p > 1) return;
      steppedGlow(ctx, fx.x, fx.y, fx.r * 0.6, fx.color, fx.alpha * (1 - p) * 0.8);
      ring(ctx, fx.x, fx.y, fx.r * easeOut(p), fx.color, fx.alpha * (1 - p));
    }
  },

  drift: {
    init(fx, random) {
      return Array.from({ length: fx.n }, () => ({ x: random(), y: random(), k: 0.5 + random() }));
    },
    draw(ctx, fx, t, parts) {
      const [x0, y0, x1, y1] = fx.rect;
      const w = x1 - x0;
      const h = y1 - y0;
      ctx.fillStyle = fx.color;
      for (const p of parts) {
        const x = x0 + (((p.x * w + fx.vx * p.k * t / 1000) % w) + w) % w;
        const y = y0 + (((p.y * h + fx.vy * p.k * t / 1000) % h) + h) % h;
        ctx.globalAlpha = 0.5 + 0.5 * p.k / 1.5;
        ctx.fillRect(Math.round(x), Math.round(y), fx.size, fx.size);
      }
      ctx.globalAlpha = 1;
    }
  },

  line: {
    draw(ctx, fx, t) {
      const p = clamp((t - fx.start) / fx.dur);
      if (p <= 0) return;
      const [hx, hy] = pixelPath(ctx, fx.points, easeOut(p), fx.width, fx.color, 0.95);
      if (p < 1) steppedGlow(ctx, hx, hy, 14, fx.color, 0.6);
    }
  },

  cover: {
    draw(ctx, fx, t) {
      let a = fx.alpha;
      if (t >= fx.until) {
        if (!fx.fade) return;
        a *= 1 - clamp((t - fx.until) / fx.fade);
        if (a <= 0) return;
      } else if (fx.flicker && fx.until - t < 360 && Math.floor(t / 60) % 2 === 0) {
        return;
      }
      const [x0, y0, x1, y1] = fx.rect;
      ctx.fillStyle = fx.color;
      ctx.globalAlpha = a;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.globalAlpha = 1;
    }
  },

  tint: {
    draw(ctx, fx, t) {
      if (t < (fx.start || 0)) return;
      const wave = 0.5 + 0.5 * Math.sin((t - (fx.start || 0)) / fx.period * Math.PI * 2);
      ctx.fillStyle = fx.color;
      ctx.globalAlpha = fx.min + (fx.max - fx.min) * wave;
      ctx.fillRect(0, 0, LW, LH);
      ctx.globalAlpha = 1;
    }
  },

  dim: {
    draw(ctx, fx, t) {
      const a = fx.to * clamp((t - fx.start) / fx.dur);
      if (a <= 0) return;
      const g = ctx.createRadialGradient(LW / 2, LH * 0.62, 60, LW / 2, LH * 0.62, LW * 0.62);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.45, `rgba(0,0,0,${a * 0.5})`);
      g.addColorStop(1, `rgba(0,0,0,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, LW, LH);
    }
  },

  mover: {
    init(fx) {
      return { total: pathLength(fx.points) };
    },
    draw(ctx, fx, t, s) {
      if (t < fx.start) return;
      const p = clamp((t - fx.start) / fx.dur);
      const end = fx.start + fx.dur;
      if (fx.trail) pixelPath(ctx, fx.points, p, 1, fx.color, 0.35);
      if (p < 1 || (fx.keep && t < fx.keep)) {
        const [x, y] = pointAt(fx.points, s.total * p);
        steppedGlow(ctx, x, y, 14, fx.color, 0.7);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
      } else if (fx.vanishColor && t < end + 900) {
        const q = (t - end) / 900;
        const [x, y] = fx.points[fx.points.length - 1];
        ring(ctx, x, y, 6 + 40 * easeOut(q), fx.vanishColor, 1 - q);
        steppedGlow(ctx, x, y, 22, fx.vanishColor, 0.6 * (1 - q));
      }
    }
  },

  switch: {
    draw(ctx, fx, t) {
      if (t < fx.at) return;
      const [x0, y0, x1, y1] = fx.rect;
      const k = clamp((t - fx.at) / 220);
      ctx.fillStyle = fx.color;
      ctx.globalAlpha = 0.82 * k;
      ctx.beginPath();
      ctx.moveTo(x0 + 36, y0);
      ctx.lineTo(x1 - 36, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x0, y1);
      ctx.fill();
      ctx.globalAlpha = 1;
      steppedGlow(ctx, (x0 + x1) / 2, (y0 + y1) / 2, 170, fx.glow, 0.25 + 0.35 * clamp(1 - (t - fx.at) / 900));
    }
  },

  engines: {
    draw(ctx, fx, t) {
      fx.points.forEach(([x, y], i) => {
        const on = fx.start + i * fx.interval;
        if (t < on) return;
        const ignited = t >= fx.ignite;
        const flicker = 0.5 + 0.5 * Math.sin(t * 0.045 + i * 1.7);
        let a = ignited ? 0.62 + 0.25 * flicker : 0.3 + 0.1 * flicker;
        let r = fx.r * (ignited ? 1.35 : 0.9);
        if (fx.grow) {
          const g = clamp(t / fx.grow);
          a *= 0.55 + 0.45 * g;
          r *= 0.8 + 0.5 * g;
        }
        steppedGlow(ctx, x, y, r, fx.color, a);
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = a;
        ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
        ctx.globalAlpha = 1;
      });
    }
  },

  stream: {
    init(fx, random) {
      return Array.from({ length: fx.n }, () => ({ o: random(), j: (random() - 0.5) * 6 }));
    },
    draw(ctx, fx, t, parts) {
      const [x0, y0] = fx.from;
      const [x1, y1] = fx.to;
      const len = Math.hypot(x1 - x0, y1 - y0);
      ctx.fillStyle = fx.color;
      for (const p of parts) {
        const s = ((t * fx.speed / 1000) / len + p.o) % 1;
        ctx.globalAlpha = (1 - s) * 0.9;
        const x = x0 + (x1 - x0) * s + p.j;
        const y = y0 + (y1 - y0) * s - p.j * 0.5;
        ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
      }
      ctx.globalAlpha = 1;
    }
  },

  veil: {
    draw(ctx, fx, t) {
      if (t >= fx.until) return;
      ctx.fillStyle = VOID;
      for (let i = 0; i < 4; i++) {
        ctx.globalAlpha = i === 0 ? 0.55 : 0.32;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.r * (1 - i * 0.18), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  },

  bloom: {
    draw(ctx, fx, t) {
      const p = clamp((t - fx.start) / fx.dur);
      if (t < fx.start || p >= 1) return;
      const r = fx.r0 + (fx.r1 - fx.r0) * easeOut(p);
      const a = fx.rise ? (fx.peak || 0.25) * easeOut(p) : 0.6 * (1 - p) ** 1.4;
      steppedGlow(ctx, fx.x, fx.y, r, fx.color, a, 6);
      if (!fx.rise && p < 0.5) ring(ctx, fx.x, fx.y, r * 1.1, '#ffffff', (0.5 - p) * 1.4, 2);
    }
  },

  // Handled by the engine (they move the layer or the stage flash).
  shake: { draw() {} },
  flash: { draw() {} }
};

// ---------- audio (optional files; silent if absent) ----------
function createAudio(enabled, onCue, timeScale) {
  const tracks = new Map();
  const fades = [];
  const missing = new Set();

  function fade(audio, to, ms, stopAtEnd) {
    fades.push({ audio, from: audio.volume, to, start: performance.now(), ms: ms / timeScale, stopAtEnd });
  }

  return {
    cue({ cue, loop = false, fadeOut = [] }) {
      if (onCue) onCue(cue);
      for (const name of fadeOut) {
        const track = tracks.get(name);
        if (track) fade(track, 0, 1500, true);
      }
      if (cue === 'silence') {
        for (const track of tracks.values()) fade(track, 0, 1400, true);
        return;
      }
      if (!enabled || missing.has(cue)) return;
      const audio = new Audio();
      audio.loop = loop;
      audio.volume = 0;
      audio.addEventListener('error', () => {
        missing.add(cue);
        tracks.delete(cue);
      }, { once: true });
      audio.src = new URL(`assets/audio/${cue}.mp3`, BASE).href;
      tracks.set(cue, audio);
      audio.play().then(() => fade(audio, loop ? 0.45 : 0.7, loop ? 1800 : 80, false)).catch(() => {});
    },
    update(now) {
      for (let i = fades.length - 1; i >= 0; i--) {
        const f = fades[i];
        const p = clamp((now - f.start) / f.ms);
        f.audio.volume = clamp(f.from + (f.to - f.from) * p);
        if (p >= 1) {
          if (f.stopAtEnd) f.audio.pause();
          fades.splice(i, 1);
        }
      }
    },
    stopAll() {
      for (const track of tracks.values()) {
        track.pause();
        track.removeAttribute('src');
      }
      tracks.clear();
      fades.length = 0;
    }
  };
}

// ---------- the player ----------
let playing = null;

/**
 * Plays the final cutscene.
 * options: {
 *   onComplete({ skipped })  called exactly once (also on skip)
 *   allowSkip = true         show SKIP CUTSCENE and accept Escape
 *   audio = true             try the optional files in assets/audio
 *   onAudioCue(name)         hook for a host game's own sound system
 *   timeScale = 1            > 1 plays faster (testing only)
 *   startAt = 0              start at this time in ms (testing only)
 * }
 * Returns a Promise that resolves with { skipped }.
 */
export async function playOutro(options = {}) {
  if (playing) return playing;

  const {
    onComplete = null, allowSkip = true, audio: audioEnabled = true,
    onAudioCue = null, timeScale = 1, startAt = 0
  } = options;

  playing = (async () => {
    const stage = el('div', 'nso-stage');
    stage.setAttribute('role', 'dialog');
    stage.setAttribute('aria-modal', 'true');
    stage.setAttribute('aria-label', 'Project Nasareth final cutscene');
    stage.tabIndex = -1;
    document.body.appendChild(stage);

    await ensureCss();
    const images = await preloadOutro();
    const imageById = new Map(SCENES.map((scene, i) => [scene.id, images[i]]));

    const backdrop = el('div', 'nso-backdrop', stage);
    const art = el('div', 'nso-art', stage);
    const flash = el('div', 'nso-flash', art);
    const captions = el('div', 'nso-captions', stage);
    const filmUrl = `url("${new URL('assets/ui/filmstrip.svg', BASE).href}")`;
    for (const side of ['nso-top', 'nso-bottom']) el('div', `nso-film ${side}`, stage).style.backgroundImage = filmUrl;

    let skipButton = null;
    if (allowSkip) {
      skipButton = el('button', 'nso-skip', stage);
      skipButton.type = 'button';
      skipButton.textContent = 'SKIP CUTSCENE';
    }

    const audio = createAudio(audioEnabled, onAudioCue, timeScale);

    // ----- layout: a 16:9 box between the filmstrips, never cropped -----
    let box = { left: 0, top: 0, width: 0, height: 0, below: 0 };

    function layout() {
      const vw = stage.clientWidth;
      const vh = stage.clientHeight;
      const fh = parseFloat(getComputedStyle(stage.querySelector('.nso-film')).height) || 40;
      const availH = Math.max(60, vh - fh * 2);
      const width = Math.min(vw, availH * 16 / 9);
      const height = width * 9 / 16;
      const left = (vw - width) / 2;
      const top = fh + (availH - height) / 2;
      box = { left, top, width, height, below: vh - fh - (top + height), vw, vh };
      Object.assign(art.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
      if (caption) placeCaption(caption);
      if (title) placeTitle();
    }

    // ----- layers -----
    let layers = [];
    let baseLayer = null;

    function createLayer(scene, startTime) {
      const isPanel = scene.mode === 'panel';
      const node = el('div', `nso-layer ${isPanel ? 'nso-panel' : 'nso-full'}`);
      if (isPanel) {
        el('div', 'nso-frame', node);
        const slot = SLOTS[scene.slot] || SLOTS.A;
        // Same percentage for width and height: the art box is 16:9, so is the panel.
        Object.assign(node.style, {
          inset: 'auto', left: `${slot.left}%`, top: `${slot.top}%`,
          width: `${slot.width}%`, height: `${slot.width}%`, transform: `rotate(${slot.rotate}deg)`
        });
      }
      const inner = el('div', 'nso-inner', node);
      const img = imageById.get(scene.id);
      if (img) {
        const copy = img.cloneNode();
        copy.alt = '';
        copy.draggable = false;
        inner.appendChild(copy);
      } else {
        inner.style.background = 'radial-gradient(ellipse at center, #111a2e 0%, #04060b 70%)';
      }
      const canvas = el('canvas', '', inner);
      canvas.width = LW;
      canvas.height = LH;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const random = rng(scene.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
      const fx = (scene.effects || []).map(effect => ({
        effect,
        impl: EFFECTS[effect.type],
        state: EFFECTS[effect.type]?.init ? EFFECTS[effect.type].init(effect, random) : null
      })).filter(item => item.impl);
      return { scene, node, inner, ctx, fx, start: startTime, isPanel, baseTransform: node.style.transform || '' };
    }

    function animateIn(layer, kind, done) {
      const rot = layer.isPanel ? ` rotate(${(SLOTS[layer.scene.slot] || SLOTS.A).rotate}deg)` : '';
      const ms = d => d / timeScale;
      const easing = 'cubic-bezier(.2,.75,.25,1)';
      let anim = null;
      const node = layer.node;
      switch (kind) {
        case 'fadeBlack':
          anim = node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms(1500), easing: 'ease-in' });
          break;
        case 'fade':
          anim = node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms(750), easing: 'linear' });
          break;
        case 'dissolve':
          anim = node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms(2300), easing: 'ease-in-out' });
          break;
        case 'slideLeft':
          anim = node.animate([{ transform: `translateX(16%)${rot}`, opacity: 0 }, { transform: `translateX(0)${rot}`, opacity: 1 }], { duration: ms(560), easing });
          break;
        case 'slideRight':
          anim = node.animate([{ transform: `translateX(-16%)${rot}`, opacity: 0 }, { transform: `translateX(0)${rot}`, opacity: 1 }], { duration: ms(560), easing });
          break;
        case 'slideUp':
          anim = node.animate([{ transform: `translateY(14%)${rot}`, opacity: 0 }, { transform: `translateY(0)${rot}`, opacity: 1 }], { duration: ms(560), easing });
          break;
        case 'settle':
          anim = node.animate([{ transform: `scale(1.04)${rot}`, opacity: 0 }, { transform: `scale(1)${rot}`, opacity: 1, offset: 0.35 }, { transform: `scale(1)${rot}`, opacity: 1 }], { duration: ms(480), easing: 'ease-out' });
          break;
        case 'diagonal':
          anim = node.animate([
            { clipPath: 'polygon(0% 0%, 0% 0%, 0% 0%, 0% 0%)' },
            { clipPath: 'polygon(0% 0%, 230% 0%, 0% 230%, 0% 0%)' }
          ], { duration: ms(420), easing: 'cubic-bezier(.3,.6,.2,1)' });
          break;
        case 'flashCut':
          flashOnce(220);
          break;
        default:
          break;
      }
      if (anim) anim.onfinish = () => { node.style.clipPath = ''; done(); };
      else done();
      return anim;
    }

    function removeLayer(layer) {
      layer.node.remove();
      layers = layers.filter(item => item !== layer);
    }

    function enterScene(index, instant = false) {
      const scene = SCENES[index];
      const now = clock();
      const startTime = sceneStart[index];

      if (scene.mode === 'panel' && !baseLayer) {
        // Jumped into the middle of a group: put its full frame underneath first.
        for (let j = index - 1; j >= 0; j--) {
          if (SCENES[j].mode === 'full') {
            baseLayer = createLayer(SCENES[j], sceneStart[j]);
            art.insertBefore(baseLayer.node, flash);
            layers.push(baseLayer);
            setBackdrop(SCENES[j]);
            break;
          }
        }
      }

      const layer = createLayer(scene, startTime);
      art.insertBefore(layer.node, flash);
      layers.push(layer);

      if (scene.mode === 'full') {
        const previous = layers.filter(item => item !== layer);
        const finish = () => {
          // Only now (the new frame is established) remove what was below it.
          for (const old of previous) if (layers.includes(old)) removeLayer(old);
          setBackdrop(scene);
        };
        baseLayer = layer;
        if (instant) finish();
        else animateIn(layer, scene.transitionIn, finish);
      } else {
        if (baseLayer) baseLayer.node.classList.add('nso-dim');
        const sameSlot = layers.filter(item => item !== layer && item.isPanel && item.scene.slot === scene.slot);
        const done = () => sameSlot.forEach(removeLayer);
        if (instant) done();
        else animateIn(layer, scene.transitionIn, done);
      }

      // Events for this scene (in scene time).
      pending = [];
      if (scene.caption) {
        pending.push({ at: scene.caption.at || 0, run: () => showCaption(scene) });
        pending.push({ at: scene.caption.until || scene.duration - 260, run: () => hideCaption(scene) });
      } else {
        hideCaption(null);
      }
      if (scene.title) pending.push({ at: scene.title.at, run: () => showTitle(scene.title) });
      for (const cue of scene.audio || []) pending.push({ at: cue.at || 0, run: () => audio.cue(cue) });
      pending.sort((a, b) => a.at - b.at);
      const elapsed = now - startTime;
      // When starting mid-scene (testing), run events that are already due.
      while (pending.length && pending[0].at <= elapsed) pending.shift().run();
    }

    let backdropScene = null;
    function setBackdrop(scene) {
      if (backdropScene === scene.id) return;
      backdropScene = scene.id;
      const img = imageById.get(scene.id);
      const old = backdrop.querySelector('img');
      if (!img) return;
      const copy = img.cloneNode();
      copy.alt = '';
      copy.style.opacity = '0';
      backdrop.appendChild(copy);
      requestAnimationFrame(() => {
        copy.style.opacity = '1';
        if (old) setTimeout(() => old.remove(), 1300);
      });
    }

    // ----- captions -----
    let caption = null;
    let title = null;

    function placeCaption(node) {
      const pos = node.__pos;
      const pad = Math.max(12, box.width * 0.035);
      const roomBelow = box.below >= 92;
      node.style.maxWidth = '';
      node.style.left = node.style.right = node.style.top = node.style.bottom = 'auto';
      node.style.transform = '';
      if (roomBelow) {
        // Narrow / tall screens: below the picture, never on top of it.
        node.style.maxWidth = `${Math.min(box.vw - 32, 900)}px`;
        node.style.left = '50%';
        node.style.transform = 'translateX(-50%)';
        node.style.top = `${box.top + box.height + 14}px`;
        return;
      }
      const corner = Math.max(220, box.width * 0.4);
      const centre = Math.max(260, box.width * 0.64);
      if (pos === 'top-left' || pos === 'bottom-left') {
        node.style.maxWidth = `${corner}px`;
        node.style.left = `${box.left + pad}px`;
      } else if (pos === 'top-right' || pos === 'bottom-right') {
        node.style.maxWidth = `${corner}px`;
        node.style.right = `${box.vw - (box.left + box.width) + pad}px`;
      } else {
        node.style.maxWidth = `${centre}px`;
        node.style.left = `${box.left + box.width / 2}px`;
        node.style.transform = 'translateX(-50%)';
      }
      if (pos && pos.startsWith('top')) node.style.top = `${box.top + box.height * 0.06}px`;
      else node.style.bottom = `${box.vh - (box.top + box.height) + box.height * 0.05}px`;
    }

    function captionPosition(scene) {
      if (scene.caption.pos) return scene.caption.pos;
      if (scene.mode === 'panel') return scene.slot === 'B' ? 'top-right' : 'bottom-left';
      return scene.caption.kind === 'system' ? 'top-left' : 'bottom';
    }

    function showCaption(scene) {
      hideCaption(null);
      const c = scene.caption;
      const node = el('div', `nso-cap nso-${c.kind}`, captions);
      const tones = {
        cyan: ['#7fd3f5', '#c8f0ff'], red: ['#ff6e55', '#ffd0c4'],
        amber: ['#f6bd62', '#ffe8bd'], green: ['#6fe0a8', '#d4ffe8']
      };
      if (c.kind === 'system') {
        const [tone, text] = tones[c.tone || 'cyan'];
        node.style.setProperty('--tone', tone);
        node.style.setProperty('--tone-text', text);
      }
      if (c.speaker) el('span', 'nso-speaker', node).textContent = c.speaker;
      const quoteText = c.kind === 'dialogue' ? `“${c.text}”` : c.text;
      const shown = el('span', '', node);
      const ghost = el('span', 'nso-ghost', node);
      ghost.textContent = quoteText;
      node.__text = quoteText;
      node.__shown = shown;
      node.__ghost = ghost;
      node.__started = clock();
      node.__pos = captionPosition(scene);
      node.__scene = scene.id;
      node.setAttribute('aria-live', 'polite');
      caption = node;
      placeCaption(node);
      requestAnimationFrame(() => node.classList.add('nso-show'));
    }

    function hideCaption(scene) {
      if (!caption) return;
      if (scene && caption.__scene !== scene.id) return;
      const node = caption;
      caption = null;
      node.classList.remove('nso-show');
      setTimeout(() => node.remove(), 400);
    }

    function updateCaption(now) {
      if (!caption || !caption.__ghost.textContent) return;
      const text = caption.__text;
      const perChar = caption.classList.contains('nso-system') ? 22 : 30;
      const count = Math.min(text.length, Math.floor((now - caption.__started) / perChar));
      caption.__shown.textContent = text.slice(0, count);
      caption.__ghost.textContent = text.slice(count);
    }

    function placeTitle() {
      title.style.top = `${box.top + box.height * 0.17}px`;
    }

    function showTitle(spec) {
      hideCaption(null);
      title = el('div', 'nso-title', captions);
      el('div', 'nso-t1', title).textContent = spec.lines[0];
      el('div', 'nso-t2', title).textContent = spec.lines[1];
      placeTitle();
      requestAnimationFrame(() => title.classList.add('nso-show'));
    }

    // ----- flash -----
    let flashUntil = 0;
    let flashLength = 1;
    function flashOnce(ms, color = '#ffffff') {
      flash.style.background = color;
      flashLength = ms;
      flashUntil = clock() + ms;
    }

    // ----- clock and timeline -----
    const sceneStart = [];
    let total = 0;
    for (const scene of SCENES) {
      sceneStart.push(total);
      total += scene.duration;
    }

    const realStart = performance.now();
    const clock = () => startAt + (performance.now() - realStart) * timeScale;

    let current = -1;
    let pending = [];
    let frameId = 0;
    let finished = false;
    let resolveDone;
    const done = new Promise(resolve => { resolveDone = resolve; });

    function sceneIndexAt(t) {
      for (let i = SCENES.length - 1; i >= 0; i--) if (t >= sceneStart[i]) return i;
      return 0;
    }

    function tick() {
      if (finished) return;
      const now = clock();

      if (now >= total) {
        finish(false);
        return;
      }

      const index = sceneIndexAt(now);
      if (index !== current) {
        const jumped = current >= 0 && index > current + 1;
        current = index;
        enterScene(index, jumped || (startAt > 0 && layers.length === 0));
      }

      // Scene events.
      const local = now - sceneStart[current];
      while (pending.length && pending[0].at <= local) pending.shift().run();

      // Effects on every visible layer (each in its own scene time).
      let flashAlpha = 0;
      for (const layer of layers) {
        const t = now - layer.start;
        const { ctx } = layer;
        ctx.clearRect(0, 0, LW, LH);
        let dx = 0;
        let dy = 0;
        for (const item of layer.fx) {
          const fx = item.effect;
          if (fx.type === 'shake') {
            if (t >= fx.start && t <= fx.start + fx.dur) {
              const k = fx.decay ? 1 - (t - fx.start) / fx.dur : 1;
              const step = Math.floor(t / 45);
              const r = rng(step * 9973 + 17);
              dx += Math.round((r() * 2 - 1) * fx.amp * k);
              dy += Math.round((r() * 2 - 1) * fx.amp * k);
            }
            continue;
          }
          if (fx.type === 'flash') {
            if (t >= fx.at && t <= fx.at + fx.dur) {
              flash.style.background = fx.color;
              flashAlpha = Math.max(flashAlpha, (1 - (t - fx.at) / fx.dur) ** 1.6);
            }
            continue;
          }
          item.impl.draw(ctx, fx, t, item.state, layer);
        }
        // Shake moves the picture by whole art pixels inside its frame.
        const px = box.width / LW;
        layer.inner.style.transform = dx || dy ? `translate(${dx * px}px, ${dy * px}px)` : '';
      }
      if (flashUntil > now) flashAlpha = Math.max(flashAlpha, (flashUntil - now) / flashLength);
      flash.style.opacity = String(clamp(flashAlpha));

      updateCaption(now);
      audio.update(performance.now());
      frameId = requestAnimationFrame(tick);
    }

    // ----- input -----
    function onKey(event) {
      // The game underneath never receives keys during the cutscene.
      event.stopPropagation();
      if (event.key === 'Escape' && allowSkip) {
        event.preventDefault();
        finish(true);
      } else if (event.key !== 'Tab') {
        event.preventDefault();
      }
    }

    function finish(skipped) {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      window.removeEventListener('resize', layout);
      audio.stopAll();
      for (const anim of stage.getAnimations?.({ subtree: true }) || []) anim.cancel();
      const fadeOut = stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: skipped ? 250 : 900, easing: 'linear', fill: 'forwards' });
      fadeOut.onfinish = () => stage.remove();
      fadeOut.oncancel = () => stage.remove();
      playing = null;
      const result = { skipped };
      try {
        if (onComplete) onComplete(result);
      } catch (error) {
        console.error('[outro] onComplete failed:', error);
      }
      resolveDone(result);
    }

    if (skipButton) skipButton.addEventListener('click', () => finish(true));
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('resize', layout);
    layout();
    stage.focus({ preventScroll: true });
    frameId = requestAnimationFrame(tick);

    // Testing hooks (read-only).
    stage.__outro = {
      get scene() { return SCENES[current]?.id; },
      get time() { return clock(); },
      get layers() { return layers.map(l => l.scene.id); },
      skip: () => finish(true)
    };

    return done;
  })();

  return playing;
}

export { SCENES, COLORS };
