// Shows the skin picture (cut from the sheets in art-source/ by tools/crop_sheets.py).
export function itemArt(skin) {
  const img = document.createElement('img');
  img.className = 'item-art';
  img.src = skin.image;
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  return img;
}
