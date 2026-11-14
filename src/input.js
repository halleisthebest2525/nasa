const down = new Set();

// True when the player is typing in a text box (for example the save name).
// Game controls must ignore these key presses.
export function isTypingTarget(event) {
  const target = event.target;

  return Boolean(
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable)
  );
}

window.addEventListener('keydown', event => {
  if (isTypingTarget(event)) return;

  const key = event.key.toLowerCase();
  if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)) event.preventDefault();
  down.add(key);
});
window.addEventListener('keyup', event => down.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => down.clear());
export const isDown = (...keys) => keys.some(key => down.has(key));
