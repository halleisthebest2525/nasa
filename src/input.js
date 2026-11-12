const down = new Set();
window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)) event.preventDefault();
  down.add(key);
});
window.addEventListener('keyup', event => down.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => down.clear());
export const isDown = (...keys) => keys.some(key => down.has(key));
