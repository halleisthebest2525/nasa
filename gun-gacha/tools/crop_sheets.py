# Cuts the skin pictures out of the sheets in art-source/ and saves one image per skin
# into img/guns/ and img/attachments/.
#
# Run from the gun-gacha folder:   py tools/crop_sheets.py
#
# File names are  <rarity>-<theme>-<shape>.webp  and must match the skin list in src/data.js.
# If you redraw a sheet with the same layout, just replace the file and run this again.
# If the layout changes, adjust the column (x) and row (y) numbers below.
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-source'
OUT = ROOT / 'img'

# Each sheet: columns = list of (x0, x1, rarity, theme), rows = list of (y0, y1, shape or {rarity: shape}).
SHEETS = [
    {   # Base sheet - guns
        'file': 'sheet-base.png', 'kind': 'guns',
        'cols': [(16, 298, 'common', 'factory'), (314, 596, 'uncommon', 'jungle'), (610, 891, 'rare', 'storm'),
                 (905, 1186, 'mythic', 'storm'), (1200, 1523, 'legendary', 'storm')],
        'rows': [(150, 262, 'rifle'), (264, 382, 'pistol'),
                 (384, 498, {'common': 'shotgun', 'uncommon': 'shotgun', 'rare': 'sniper', 'mythic': 'sniper', 'legendary': 'sniper'})],
    },
    {   # Base sheet - attachments
        'file': 'sheet-base.png', 'kind': 'attachments',
        'cols': [(16, 298, 'common', 'factory'), (314, 596, 'uncommon', 'jungle'), (610, 891, 'rare', 'storm'),
                 (905, 1186, 'mythic', 'storm'), (1200, 1523, 'legendary', 'storm')],
        'rows': [(686, 782, {'common': 'reddot', 'uncommon': 'reddot', 'rare': 'scope', 'mythic': 'scope', 'legendary': 'scope'}),
                 (782, 872, 'suppressor'), (868, 984, 'grip')],
    },
]

# Theme sheet 1: 5 theme columns x 3 rarity blocks
THEMES_1 = [(147, 441, 'cyberpunk'), (449, 734, 'inferno'), (739, 1029, 'frozen'), (1034, 1337, 'egyptian'), (1342, 1643, 'dragon')]
for y0, rarity in [(102, 'rare'), (370, 'mythic'), (642, 'legendary')]:
    h = (236 if rarity == 'rare' else 238 if rarity == 'mythic' else 252) / 3
    SHEETS.append({
        'file': 'sheet-themes-1.png', 'kind': 'guns',
        'cols': [(x0, x1, rarity, theme) for x0, x1, theme in THEMES_1],
        'rows': [(round(y0 + h * i), round(y0 + h * (i + 1)), shape) for i, shape in enumerate(['rifle', 'pistol', 'sniper'])],
    })

# Theme sheet 2: 6 themes, each a block of Rare / Mythic / Legendary
BLOCKS_2 = [
    ('military', 22, 127, 324), ('holo', 791, 127, 324),
    ('anime', 22, 470, 664), ('plant', 791, 470, 664),
    ('water', 22, 807, 999), ('fire', 791, 807, 999),
]
CELL_X = [(0, 238, 'rare'), (248, 483, 'mythic'), (492, 726, 'legendary')]
for theme, bx, y0, y1 in BLOCKS_2:
    h = (y1 - y0) / 3
    SHEETS.append({
        'file': 'sheet-themes-2.png', 'kind': 'guns',
        'cols': [(bx + a, bx + b, rarity, theme) for a, b, rarity in CELL_X],
        'rows': [(round(y0 + h * i), round(y0 + h * (i + 1)), shape) for i, shape in enumerate(['rifle', 'pistol', 'sniper'])],
    })


# Secret sheet: no panels and a colorful background, so every item has a hand-placed box
# (x0, y0, x1, y1) for rifle, pistol, sniper. These are not auto-trimmed.
SECRET_BOXES = {
    'leviathan':    [(80, 20, 740, 155), (265, 150, 475, 248), (65, 232, 740, 392)],
    'ifrit':        [(785, 0, 1505, 165), (1005, 158, 1245, 246), (775, 232, 1490, 398)],
    'worldtree':    [(40, 395, 740, 545), (285, 530, 485, 612), (45, 590, 745, 708)],
    'archangel':    [(780, 385, 1470, 535), (1035, 535, 1265, 622), (785, 595, 1485, 742)],
    'eventhorizon': [(350, 715, 1085, 890), (635, 845, 835, 935), (370, 878, 1065, 1022)],
}


def trim(img, pad=8, threshold=38):
    """Shrink the crop to the item, ignoring the plain panel background."""
    a = np.asarray(img).astype(int)
    edge = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(edge, axis=0)
    diff = np.abs(a - bg).max(axis=2) > threshold
    cols = np.where(diff.sum(axis=0) > 2)[0]
    rows = np.where(diff.sum(axis=1) > 2)[0]
    if len(cols) == 0 or len(rows) == 0:
        return img
    x0, x1 = max(cols[0] - pad, 0), min(cols[-1] + pad + 1, img.width)
    y0, y1 = max(rows[0] - pad, 0), min(rows[-1] + pad + 1, img.height)
    return img.crop((x0, y0, x1, y1))


def main():
    count = 0
    for sheet in SHEETS:
        src = Image.open(SRC / sheet['file']).convert('RGB')
        out_dir = OUT / sheet['kind']
        out_dir.mkdir(parents=True, exist_ok=True)
        for x0, x1, rarity, theme in sheet['cols']:
            for y0, y1, shape in sheet['rows']:
                shape_name = shape[rarity] if isinstance(shape, dict) else shape
                piece = trim(src.crop((x0, y0, x1, y1)))
                piece.save(out_dir / f'{rarity}-{theme}-{shape_name}.webp', quality=90)
                count += 1

    secret = Image.open(SRC / 'sheet-secret.png').convert('RGB')
    for theme, boxes in SECRET_BOXES.items():
        for box, shape in zip(boxes, ['rifle', 'pistol', 'sniper']):
            secret.crop(box).save(OUT / 'guns' / f'secret-{theme}-{shape}.webp', quality=90)
            count += 1
    print(f'Saved {count} images to {OUT}')


if __name__ == '__main__':
    main()
