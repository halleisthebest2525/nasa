// Original monochrome sprites, rasterized once at startup. Every pose shares
// one 64px grid, center and scale, enlarged with nearest-neighbor sampling.
const TAU = Math.PI * 2;
const INK = '#050505', ARMOR = '#151515', GRAY = '#383838';
const SILVER = '#A0A0A0', WHITE = '#FFFFFF';

function pixel(ctx, x, y, color, size = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), size, size);
}
function polygon(ctx, points, color) {
  const vertices = points.map(([x, y]) => [Math.round(x), Math.round(y)]);
  const top = Math.min(...vertices.map(p => p[1])), bottom = Math.max(...vertices.map(p => p[1]));
  ctx.fillStyle = color;
  for (let y = top; y <= bottom; y++) {
    const crossings = [];
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i], b = vertices[(i + 1) % vertices.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        crossings.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const x = Math.ceil(crossings[i]), end = Math.floor(crossings[i + 1]);
      if (end >= x) ctx.fillRect(x, y, end - x + 1, 1);
    }
  }
}
function ellipse(ctx, x, y, rx, ry, color) {
  ctx.fillStyle = color;
  for (let dy = -Math.ceil(ry); dy <= ry; dy++) {
    if (Math.abs(dy) > ry) continue;
    const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - dy * dy / (ry * ry))));
    ctx.fillRect(Math.round(x) - half, Math.round(y + dy), half * 2 + 1, 1);
  }
}
function ring(ctx, x, y, rx, ry, color, phase = 0, tilt = 0) {
  const count = Math.max(24, Math.ceil(rx * 7));
  for (let i = 0; i < count; i++) {
    const a = phase + i / count * TAU, px = Math.cos(a) * rx, py = Math.sin(a) * ry;
    pixel(ctx, x + px * Math.cos(tilt) - py * Math.sin(tilt),
      y + px * Math.sin(tilt) + py * Math.cos(tilt), color);
  }
}

function reaver(ctx, animation, frame, count) {
  const phase = frame / count * TAU;
  const decay = animation === 'die' ? frame / (count - 1) : 0;
  const wave = animation === 'run' ? 4 : animation === 'move' ? 3 : 1.5;
  const recoil = animation === 'hurt' ? -2 + frame : 0;
  const lunge = animation === 'attack' ? [0, 2, 5, 2][frame] : 0;
  // Overlapping, tapering plates create a serpent instead of a spider.
  for (let i = 0; i < 10; i++) {
    const x = 12 + i * 3.1 + recoil + lunge * i / 10;
    const y = 33 + Math.sin(i * 0.67 - phase) * wave + decay * Math.sin(i * 2) * 8;
    const r = 1.5 + i * 0.43;
    if (decay > 0.85) {
      pixel(ctx, x + Math.cos(i * 3) * 6, y + i % 3, i % 2 ? SILVER : GRAY);
      continue;
    }
    ellipse(ctx, x, y, r + 1, r * 0.8 + 1, GRAY);
    ellipse(ctx, x, y, r, r * 0.8, INK);
    polygon(ctx, [[x - r, y], [x - 1, y - r], [x + r, y - 1], [x + 1, y + r * 0.7]], ARMOR);
    polygon(ctx, [[x - r, y], [x - 1, y - r], [x + r - 1, y - 1], [x - 1, y - r + 2]],
      animation === 'hurt' && frame === 0 ? WHITE : i % 3 === 0 ? SILVER : GRAY);
    if (i > 3) {
      polygon(ctx, [[x - 2, y - r + 1], [x - 4, y - r - 5], [x + 2, y - r]], GRAY);
      pixel(ctx, x - 4, y - r - 5, SILVER);
    }
  }
  if (decay >= 0.85) return;
  const hx = 43 + recoil + lunge, hy = 32 + Math.sin(phase) * 1.5 + decay * 4;
  polygon(ctx, [[hx - 7, hy - 5], [hx - 3, hy - 9], [hx + 4, hy - 6],
    [hx + 9, hy], [hx + 3, hy + 6], [hx - 5, hy + 5]], GRAY);
  polygon(ctx, [[hx - 6, hy - 4], [hx - 2, hy - 7], [hx + 4, hy - 4],
    [hx + 7, hy], [hx + 1, hy + 4], [hx - 5, hy + 3]], INK);
  polygon(ctx, [[hx + 3, hy - 5], [hx + 10, hy], [hx + 6, hy + 7], [hx + 6, hy + 1]], SILVER);
  polygon(ctx, [[hx - 5, hy - 5], [hx - 10, hy - 14], [hx, hy - 6]], ARMOR);
  pixel(ctx, hx - 10, hy - 14, SILVER);
  pixel(ctx, hx + 1, hy - 3, WHITE, 2); pixel(ctx, hx - 1, hy + 2, WHITE);
  for (const side of [-1, 1]) {
    const reach = animation === 'attack' ? [0, 3, 6, 1][frame] : Math.sin(phase + side) * 2;
    polygon(ctx, [[hx - 8, hy + side * 3], [hx - 4 + reach, hy + side * 10],
      [hx + 2 + reach, hy + side * 12], [hx - 2 + reach, hy + side * 7]], ARMOR);
    for (let claw = 0; claw < 3; claw++) {
      polygon(ctx, [[hx - 2 + reach + claw * 2, hy + side * 9],
        [hx + 4 + reach + claw, hy + side * (13 - claw)],
        [hx + reach + claw * 2, hy + side * 8]], SILVER);
    }
  }
  if (animation === 'attack' && frame >= 2) for (let i = 0; i < 12; i++) {
    const a = -1.2 + i / 11 * 2.4;
    pixel(ctx, 48 + Math.cos(a) * (frame === 2 ? 13 : 14), 32 + Math.sin(a) * 15,
      frame === 2 ? WHITE : SILVER);
  }
}

function nocturnus(ctx, animation, frame, count) {
  const phase = frame / count * TAU;
  const dying = animation === 'die', death = dying ? frame / (count - 1) : 0;
  const eclipse = animation === 'eclipse';
  const compressed = eclipse && frame >= 2 && frame <= 5;
  const exposed = eclipse && frame === 7;
  const x = 32, y = 32 + (['idle', 'move'].includes(animation) ? Math.sin(phase) : 0);
  const transition = animation === 'transition' ? frame / (count - 1) : 0;
  const orbit = animation === 'move' ? phase * 0.12 : phase * 0.035;
  const radius = compressed ? 9 + (5 - frame) : 18 + transition * 5;
  if (!dying || frame < 6) ring(ctx, x, y, radius + 6, 5, SILVER, phase * 0.2, -0.22);
  const core = compressed ? 4 : exposed ? 5 : dying ? Math.max(1, 8 - frame) : 9;
  ellipse(ctx, x, y, core + 1, core + 1, GRAY);
  ellipse(ctx, x, y, core, core, INK);
  if (!exposed && (!dying || frame < 5)) for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + orbit;
    const scatter = dying ? Math.sin(death * Math.PI) * 9 : 0;
    const r = dying ? (radius + scatter) * (1 - death * 0.65) : radius;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    const length = i % 2 ? 6 : 9;
    const local = (u, v) => [px + Math.cos(a) * u - Math.sin(a) * v,
      py + Math.sin(a) * u + Math.cos(a) * v];
    polygon(ctx, [local(-5, -3), local(1, -5), local(length, 0), local(1, 5), local(-5, 3)], GRAY);
    polygon(ctx, [local(-4, -2), local(1, -4), local(length - 1, 0), local(0, 3), local(-4, 2)], ARMOR);
    polygon(ctx, [local(-4, -2), local(1, -4), local(length - 1, 0), local(1, -2)],
      animation === 'hurt' && frame === 0 ? WHITE : SILVER);
    polygon(ctx, [local(-2, 0), local(length - 1, 0), local(0, 3)], INK);
  }
  if (animation === 'pulse') {
    ring(ctx, x, y, 9 + frame * 5, 4 + frame * 2, frame % 2 ? WHITE : SILVER);
    ellipse(ctx, x, y, 2 + frame, 2 + frame, WHITE);
  } else if (animation === 'shards') {
    for (let i = 0; i < 5; i++) {
      const a = -1.1 + i * 0.55, r = 17 + frame * 2;
      const sx = x + Math.cos(a) * r, sy = y + Math.sin(a) * r;
      polygon(ctx, [[sx - 3, sy - 2], [sx + 5, sy], [sx - 3, sy + 2]], SILVER);
      pixel(ctx, sx, sy, INK);
    }
  } else if (animation === 'gravity') {
    ring(ctx, x, y + 13, 10 + frame * 2, 3 + frame * 0.5, WHITE, phase, 0.12);
    ring(ctx, x, y + 14, 8 + frame * 2, 3, GRAY, -phase, -0.12);
  } else if (eclipse && frame === 6) {
    ring(ctx, x, y, 28, 17, WHITE); ring(ctx, x, y, 19, 12, SILVER);
    for (let i = 0; i < 8; i++) pixel(ctx, x + Math.cos(i * TAU / 8) * 25, y + Math.sin(i * TAU / 8) * 25, WHITE, 2);
  }
  const dark = eclipse && frame < 6 || dying && frame >= 4;
  if (dying && frame >= 6) {
    if (frame === 6) {
      ring(ctx, x, y, 22, 22, WHITE);
      pixel(ctx, x - 1, y - 17, WHITE, 2); pixel(ctx, x - 17, y - 1, WHITE, 2);
    }
    for (let i = 0; i < 18; i++) {
      const a = i * 2.399, r = 8 + (i % 5) * 4 + frame;
      pixel(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r, i % 3 ? GRAY : SILVER);
    }
  } else if (!dark) {
    const power = exposed ? 4 : animation === 'hurt' ? 3 : 1 + (frame % 3 === 0 ? 1 : 0);
    ellipse(ctx, x, y, power, power, WHITE);
    if (exposed || animation === 'transition') for (let i = -7; i <= 7; i++) {
      pixel(ctx, x + i, y, Math.abs(i) < 4 ? WHITE : SILVER);
      pixel(ctx, x, y + i, Math.abs(i) < 4 ? WHITE : SILVER);
    }
  }
  if (!compressed && !exposed && (!dying || frame < 5)) ring(ctx, x, y, radius + 7, 5, WHITE, phase * 0.1, -0.22);
}

export function generateUmbrielFrames(assets, rows) {
  let generated = 0;
  for (const [kind, animation, count] of rows) for (let frame = 0; frame < count; frame++) {
    const key = `umbriel_${kind}_${animation}_${frame + 1}`;
    if (assets[key]) continue;
    const source = document.createElement('canvas');
    source.width = source.height = 64;
    const ctx = source.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (kind === 'reaver') reaver(ctx, animation, frame, count);
    else nocturnus(ctx, animation, frame, count);
    const output = document.createElement('canvas');
    output.width = output.height = 192;
    const target = output.getContext('2d');
    target.imageSmoothingEnabled = false;
    target.drawImage(source, 0, 0, 192, 192);
    assets[key] = output;
    generated++;
  }
  return generated;
}
