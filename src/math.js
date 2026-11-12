export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const random = (min, max) => Math.random() * (max - min) + min;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function wrap(value, size) {
  return ((value + size / 2) % size + size) % size - size / 2;
}
