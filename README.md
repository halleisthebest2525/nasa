# Starfall — Deep Space Salvage

A small browser-based 2D top-down space game prototype. It uses plain HTML, CSS, and JavaScript modules; no build tools or image assets are required. The ship is drawn with Canvas, so there is no missing JPG/PNG sprite and no image 404.

## Run locally
1. Open this folder in VS Code.
2. Install the **Live Server** extension if you have not already.
3. Right-click `index.html` and choose **Open with Live Server**.
4. Do not open `index.html` directly as a `file://` URL.

## Controls
- **W / Up Arrow:** thrust forward
- **S / Down Arrow:** reverse thrust
- **A / Left Arrow:** turn left
- **D / Right Arrow:** turn right
- **Shift + W:** boost
- **Space:** brake

## Gameplay
Fly around the sector and touch the glowing diamond-shaped salvage pieces to collect scrap. The HUD displays your speed, position, and collected scrap. Salvage respawns after collection.

## Files
- `index.html` — page structure and HUD
- `styles/main.css` — visual styling
- `src/main.js` — game loop and setup
- `src/config.js` — tunable game settings
- `src/input.js` — keyboard input
- `src/math.js` — small math helpers
- `src/ship.js` — ship movement and physics
- `src/world.js` — stars and collectible salvage
- `src/renderer.js` — Canvas drawing
- `src/hud.js` — HUD updates

## GitHub Pages
This is a static site. Push the project files to your repository and configure GitHub Pages to deploy from the branch/folder containing `index.html`.
