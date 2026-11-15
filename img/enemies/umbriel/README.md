# Umbriel artwork

No external sprite sheet is required. `src/umbrielPixelArt.js` creates and caches
22 Void Reaver frames and 50 Nocturnus frames during asset loading. The sprites
use a monochrome 64-pixel grid, enlarged with nearest-neighbor sampling onto
fixed 192-pixel canvases. The enemy renderer uses those cached canvases.

Void Reavers have segmented serpentine armor, claws and white eyes. Nocturnus
has an obsidian core, floating crystalline plates and white energy rings.
Movement, attacks, hurt, transitions and death have distinct animation poses.

An optional `umbriel_sheet.png` can replace the generated artwork by registering
`umbriel_sheet=./img/enemies/umbriel/umbriel_sheet.png` in `assets.txt`.
The extraction layout in `src/umbrielSprites.js` must match that sheet.
