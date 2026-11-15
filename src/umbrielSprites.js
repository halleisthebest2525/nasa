import { generateUmbrielFrames } from './umbrielPixelArt.js';

// Optional regions in the 1774 x 887 concept sheet, excluding headings,
// dividers and the two large illustration panels on the left.
// Keep frames in reading order. The sheet itself is never rendered as a sprite.
export const UMBRIEL_FRAME_ROWS = [
  ['reaver', 'idle', 4, 474, 116, 864, 191],
  ['reaver', 'move', 4, 890, 116, 1288, 191],
  ['reaver', 'run', 4, 1314, 116, 1750, 191],
  ['reaver', 'attack', 4, 474, 231, 949, 301],
  ['reaver', 'hurt', 2, 1037, 229, 1249, 301],
  ['reaver', 'die', 4, 1314, 238, 1750, 303],
  ['boss', 'idle', 6, 454, 363, 1027, 449],
  ['boss', 'move', 6, 1098, 363, 1754, 449],
  ['boss', 'pulse', 4, 491, 485, 1008, 567],
  ['boss', 'shards', 4, 1102, 485, 1751, 568],
  ['boss', 'gravity', 6, 466, 600, 1029, 690],
  ['boss', 'eclipse', 8, 1070, 601, 1751, 690],
  ['boss', 'hurt', 2, 439, 747, 577, 826],
  ['boss', 'transition', 6, 592, 747, 1106, 826],
  ['boss', 'die', 8, 1140, 747, 1753, 826]
];

function transparentBackground(ctx, width, height) {
  const image = ctx.getImageData(0, 0, width, height);
  const { data } = image;
  const visited = new Uint8Array(width * height), queue = [];
  function add(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x, p = i * 4;
    if (visited[i] || Math.max(data[p], data[p + 1], data[p + 2]) > 8) return;
    visited[i] = 1; queue.push(i);
  }
  // Flood only exterior black. The enclosed black core/armor stays opaque.
  for (let x = 0; x < width; x++) { add(x, 0); add(x, height - 1); }
  for (let y = 0; y < height; y++) { add(0, y); add(width - 1, y); }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head], x = i % width, y = Math.floor(i / width);
    data[i * 4 + 3] = 0;
    add(x - 1, y); add(x + 1, y); add(x, y - 1); add(x, y + 1);
  }
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
  ctx.putImageData(image, 0, 0);
}

export function prepareUmbrielFrames(assets) {
  const sheet = assets.umbriel_sheet;
  if (!sheet?.naturalWidth) return generateUmbrielFrames(assets, UMBRIEL_FRAME_ROWS);
  const sx = sheet.naturalWidth / 1774, sy = sheet.naturalHeight / 887;
  let count = 0;
  for (const [kind, animation, frames, left, top, right, bottom] of UMBRIEL_FRAME_ROWS) {
    for (let i = 0; i < frames; i++) {
      const x = Math.round((left + (right - left) * i / frames) * sx);
      const y = Math.round(top * sy);
      const w = Math.round((left + (right - left) * (i + 1) / frames) * sx) - x;
      const h = Math.round(bottom * sy) - y;
      const crop = document.createElement('canvas');
      crop.width = w; crop.height = h;
      const ctx = crop.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sheet, x, y, w, h, 0, 0, w, h);
      transparentBackground(ctx, w, h);
      // One fixed canvas and one scale for the whole sheet. Do not fit each
      // frame to its own bounds: that would stretch the character as it moves.
      const frame = document.createElement('canvas');
      frame.width = frame.height = 192;
      const output = frame.getContext('2d');
      output.imageSmoothingEnabled = false;
      const fw = Math.round(w / sx), fh = Math.round(h / sy);
      output.drawImage(crop, Math.round((192 - fw) / 2), Math.round((192 - fh) / 2), fw, fh);
      assets[`umbriel_${kind}_${animation}_${i + 1}`] = frame;
      count++;
    }
  }
  return count;
}
