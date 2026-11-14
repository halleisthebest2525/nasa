import { CONFIG } from './config.js';
import { wrap } from './math.js';

export function drawBackground(ctx, width, height) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
}

// Offscreen layer for asteroids and the Moon. The darkness is applied to
// this layer only, so the distant star background stays visible.
const objectLayer = document.createElement('canvas');
const objectCtx = objectLayer.getContext('2d');

// texturedBackground = true when spaceBackground.js already drew the stars.
export function drawWorld(
  ctx,
  world,
  ship,
  width,
  height,
  sprite,
  minimapOpen = false,
  texturedBackground = false
) {
  // Match the object layer to the pixel canvas and its transform
  // (scale + screen shake).
  if (
    objectLayer.width !== ctx.canvas.width ||
    objectLayer.height !== ctx.canvas.height
  ) {
    objectLayer.width = ctx.canvas.width;
    objectLayer.height = ctx.canvas.height;
  }

  objectCtx.setTransform(1, 0, 0, 1, 0, 0);
  objectCtx.clearRect(0, 0, objectLayer.width, objectLayer.height);
  objectCtx.setTransform(ctx.getTransform());
  objectCtx.imageSmoothingEnabled = false;

  drawWorldObjects(objectCtx, world, ship, width, height, texturedBackground);

  // Hide objects in the dark exactly like before (same gradient),
  // but only on the object layer.
  objectCtx.globalCompositeOperation = 'destination-out';
  drawVisibility(objectCtx, width, height);
  objectCtx.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(objectLayer, 0, 0);
  ctx.restore();

  // Earth is big and sunlit, so it stays visible outside the darkness.
  if (world.earth) {
    const earthDX = wrap(world.earth.x - ship.x, CONFIG.worldSize);
    const earthDY = wrap(world.earth.y - ship.y, CONFIG.worldSize);

    if (
      Math.abs(earthDX) < width / 2 + world.earth.radius + 40 &&
      Math.abs(earthDY) < height / 2 + world.earth.radius + 40
    ) {
      drawEarth(
        ctx,
        width / 2 + earthDX,
        height / 2 + earthDY,
        world.earth.radius
      );
    }
  }

  if (texturedBackground) {
    // Gently dim the far stars away from the rocket for atmosphere.
    drawSoftVignette(ctx, width, height);
  } else {
    // No textures: full darkness, as before.
    drawVisibility(ctx, width, height);
  }

  drawShip(ctx, ship, width, height, sprite);

  const moonDistance = Math.hypot(
    wrap(world.moon.x - ship.x, CONFIG.worldSize),
    wrap(world.moon.y - ship.y, CONFIG.worldSize)
  );

  // Landing prompt.
  if (moonDistance <= world.moon.radius + 125) {
    drawLandingPrompt(ctx, width, height);
  }

  if (minimapOpen) {
    drawMinimap(ctx, ship, world.moon, width, height, world.earth);
  }
}

function drawSoftVignette(ctx, width, height) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.hypot(width, height) / 2;

  const shade = ctx.createRadialGradient(
    centerX,
    centerY,
    260,
    centerX,
    centerY,
    Math.max(radius, 300)
  );

  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.55)');

  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);
}

// Asteroids, the Moon, and (only without textures) the old dot stars.
function drawWorldObjects(ctx, world, ship, width, height, texturedBackground) {
  // Old procedural stars: fallback when the textures could not load.
  for (const star of texturedBackground ? [] : world.stars) {
    const x = width / 2 + wrap(
      star.x - ship.x,
      CONFIG.worldSize
    );

    const y = height / 2 + wrap(
      star.y - ship.y,
      CONFIG.worldSize
    );

    if (
      x < -5 || y < -5 ||
      x > width + 5 || y > height + 5
    ) continue;

    ctx.globalAlpha = star.brightness;
    ctx.fillStyle = '#a5a5a5';

    ctx.fillRect(
      Math.floor(x),
      Math.floor(y),
      star.size,
      star.size
    );
  }

  ctx.globalAlpha = 1;

  // Asteroids.
  for (const asteroid of world.asteroids) {
    const dx = wrap(
      asteroid.x - ship.x,
      CONFIG.worldSize
    );

    const dy = wrap(
      asteroid.y - ship.y,
      CONFIG.worldSize
    );

    if (
      Math.abs(dx) > width / 2 + 100 ||
      Math.abs(dy) > height / 2 + 100
    ) continue;

    drawAsteroid(
      ctx,
      width / 2 + dx,
      height / 2 + dy,
      asteroid
    );
  }

  // The Moon.
  const moonDX = wrap(
    world.moon.x - ship.x,
    CONFIG.worldSize
  );

  const moonDY = wrap(
    world.moon.y - ship.y,
    CONFIG.worldSize
  );

  const moonScreenX = width / 2 + moonDX;
  const moonScreenY = height / 2 + moonDY;

  if (
    Math.abs(moonDX) < width / 2 + world.moon.radius &&
    Math.abs(moonDY) < height / 2 + world.moon.radius
  ) {
    drawMoon(
      ctx,
      moonScreenX,
      moonScreenY,
      world.moon.radius
    );
  }
}

export function drawVisibility(ctx, width, height) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = 340;

  const darkness = ctx.createRadialGradient(
    centerX,
    centerY,
    radius * 0.72,
    centerX,
    centerY,
    radius
  );

  darkness.addColorStop(0, 'rgba(0,0,0,0)');
  darkness.addColorStop(0.45, 'rgba(0,0,0,0.02)');
  darkness.addColorStop(0.75, 'rgba(0,0,0,0.15)');
  darkness.addColorStop(0.92, 'rgba(0,0,0,0.85)');
  darkness.addColorStop(1, '#000000');

  ctx.fillStyle = darkness;
  ctx.fillRect(0, 0, width, height);
}

function drawMoon(ctx, x, y, radius) {
  ctx.save();
  ctx.translate(Math.floor(x), Math.floor(y));

  // Subtle blue glow.
  ctx.shadowColor = 'rgba(125, 170, 190, 0.45)';
  ctx.shadowBlur = 28;

  ctx.fillStyle = '#929b9d';
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;

  // Lunar surface lighting.
  const surface = ctx.createRadialGradient(
    -radius * 0.35,
    -radius * 0.4,
    radius * 0.08,
    0,
    0,
    radius
  );

  surface.addColorStop(0, '#d0d0c7');
  surface.addColorStop(0.55, '#969b99');
  surface.addColorStop(1, '#424b4c');

  ctx.fillStyle = surface;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  // Craters.
  const craters = [
    [-35, -35, 20],
    [30, -48, 13],
    [45, 15, 23],
    [-25, 38, 17],
    [-62, 5, 10],
    [5, 12, 12],
    [5, -75, 7],
    [-5, 65, 9],
    [65, -35, 8]
  ];

  for (const [cx, cy, size] of craters) {
    ctx.fillStyle = 'rgba(43, 49, 49, 0.45)';
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy,
      size,
      size * 0.72,
      -0.2,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.strokeStyle = 'rgba(220, 220, 205, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      cx - 2,
      cy - 2,
      size * 0.8,
      Math.PI,
      Math.PI * 1.8
    );
    ctx.stroke();
  }

  // Atmospheric edge.
  ctx.strokeStyle = 'rgba(135, 185, 205, 0.45)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, radius + 2, 0, Math.PI * 2);
  ctx.stroke();

  // Planet name.
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#d8d8ce';
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('THE MOON', 0, radius + 24);

  ctx.restore();
}

// Pixel-style Earth: ocean, a few continents, clouds, thin atmosphere.
function drawEarth(ctx, x, y, radius) {
  ctx.save();
  ctx.translate(Math.floor(x), Math.floor(y));

  // Atmosphere glow.
  ctx.shadowColor = 'rgba(110, 170, 230, 0.5)';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#1d4f7a';
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.clip();

  // Ocean lighting.
  const ocean = ctx.createRadialGradient(
    -radius * 0.35, -radius * 0.4, radius * 0.1,
    0, 0, radius
  );
  ocean.addColorStop(0, '#3f86b8');
  ocean.addColorStop(0.6, '#235f8c');
  ocean.addColorStop(1, '#0d2a42');
  ctx.fillStyle = ocean;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);

  // Continents (relative to radius so it scales).
  const land = [
    [-0.45, -0.35, 0.32, 0.22, 0.4],
    [-0.2, 0.1, 0.22, 0.36, -0.3],
    [0.35, -0.25, 0.28, 0.18, 0.2],
    [0.45, 0.3, 0.2, 0.3, 0.6],
    [-0.55, 0.45, 0.18, 0.12, 0]
  ];

  ctx.fillStyle = '#4f7d45';

  for (const [lx, ly, rx, ry, rot] of land) {
    ctx.beginPath();
    ctx.ellipse(lx * radius, ly * radius, rx * radius, ry * radius, rot, 0, Math.PI * 2);
    ctx.fill();
  }

  // Clouds.
  ctx.fillStyle = 'rgba(235, 240, 240, 0.55)';

  for (const [cx, cy, w] of [[-0.1, -0.6, 0.5], [0.3, 0.05, 0.4], [-0.5, 0.15, 0.3], [0.1, 0.6, 0.45]]) {
    ctx.fillRect(cx * radius - (w * radius) / 2, cy * radius, w * radius, radius * 0.06);
  }

  // Night side shadow.
  const night = ctx.createRadialGradient(
    -radius * 0.4, -radius * 0.45, radius * 0.6,
    0, 0, radius * 1.15
  );
  night.addColorStop(0, 'rgba(0,0,0,0)');
  night.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = night;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);

  ctx.restore();

  // Thin atmosphere ring.
  ctx.strokeStyle = 'rgba(140, 195, 240, 0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, radius + 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.shadowColor = '#000';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#d8e4ee';
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('EARTH', 0, radius + 24);

  ctx.restore();
}

function drawLandingPrompt(ctx, width, height) {
  const x = width / 2;
  const y = height / 2 + 95;

  ctx.save();

  ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
  ctx.fillRect(x - 105, y - 18, 210, 38);

  ctx.strokeStyle = '#aeb9a2';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 105, y - 18, 210, 38);

  ctx.fillStyle = '#dce5c7';
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('E FOR LANDING', x, y + 7);

  ctx.restore();
}

function drawMinimap(ctx, ship, moon, width, height, earth = null) {
  const panelWidth = 220;
  const panelHeight = 235;
  const panelX = width - panelWidth - 25;
  const panelY = height - panelHeight - 45;

  const mapX = panelX + 18;
  const mapY = panelY + 35;
  const mapSize = 184;
  const mapCenterX = mapX + mapSize / 2;
  const mapCenterY = mapY + mapSize / 2;

  const scale = mapSize / CONFIG.worldSize;

  const shipX = mapCenterX + ship.x * scale;
  const shipY = mapCenterY + ship.y * scale;

  const moonX = mapCenterX + moon.x * scale;
  const moonY = mapCenterY + moon.y * scale;

  const dx = moon.x - ship.x;
  const dy = moon.y - ship.y;
  const distance = Math.hypot(dx, dy);

  const directions = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  const directionIndex =
    Math.round(Math.atan2(dy, dx) / (Math.PI / 4) + 8) % 8;

  ctx.save();

  // Panel.
  ctx.fillStyle = 'rgba(7, 10, 10, 0.94)';
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);

  ctx.strokeStyle = '#777d70';
  ctx.lineWidth = 1;
  ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

  ctx.fillStyle = '#d2d0c5';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('SYSTEM MAP', panelX + 14, panelY + 20);

  ctx.fillStyle = '#858b7e';
  ctx.font = '9px monospace';
  ctx.fillText('M · CLOSE MAP', panelX + 125, panelY + 20);

  // Map background.
  ctx.fillStyle = '#101716';
  ctx.fillRect(mapX, mapY, mapSize, mapSize);

  ctx.save();
  ctx.beginPath();
  ctx.rect(mapX, mapY, mapSize, mapSize);
  ctx.clip();

  // Grid.
  ctx.strokeStyle = 'rgba(130, 145, 130, 0.18)';
  ctx.lineWidth = 1;

  for (let i = 1; i < 4; i++) {
    const offset = mapSize * i / 4;

    ctx.beginPath();
    ctx.moveTo(mapX + offset, mapY);
    ctx.lineTo(mapX + offset, mapY + mapSize);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(mapX, mapY + offset);
    ctx.lineTo(mapX + mapSize, mapY + offset);
    ctx.stroke();
  }

  // Origin cross.
  ctx.strokeStyle = 'rgba(160, 170, 150, 0.4)';
  ctx.beginPath();
  ctx.moveTo(mapCenterX, mapY);
  ctx.lineTo(mapCenterX, mapY + mapSize);
  ctx.moveTo(mapX, mapCenterY);
  ctx.lineTo(mapX + mapSize, mapCenterY);
  ctx.stroke();

  // Route line.
  ctx.strokeStyle = 'rgba(170, 190, 150, 0.55)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(shipX, shipY);
  ctx.lineTo(moonX, moonY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Earth marker.
  if (earth) {
    ctx.fillStyle = '#4f8fc4';
    ctx.beginPath();
    ctx.arc(
      mapCenterX + earth.x * scale,
      mapCenterY + earth.y * scale,
      4,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  // Moon marker.
  ctx.fillStyle = '#c7c9bd';
  ctx.beginPath();
  ctx.arc(moonX, moonY, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#e0e4d2';
  ctx.stroke();

  // Ship marker.
  ctx.fillStyle = '#86c7b4';
  ctx.beginPath();
  ctx.arc(shipX, shipY, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#d1e9d9';
  ctx.stroke();

  ctx.restore();

  // Map legend and navigation information.
  ctx.fillStyle = '#86c7b4';
  ctx.fillRect(panelX + 15, panelY + 207, 7, 7);

  ctx.fillStyle = '#aaa';
  ctx.font = '9px monospace';
  ctx.fillText('SHIP', panelX + 27, panelY + 214);

  ctx.fillStyle = '#c7c9bd';
  ctx.beginPath();
  ctx.arc(panelX + 79, panelY + 210, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#aaa';
  ctx.fillText('MOON', panelX + 89, panelY + 214);

  if (earth) {
    ctx.fillStyle = '#4f8fc4';
    ctx.beginPath();
    ctx.arc(panelX + 135, panelY + 210, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#aaa';
    ctx.fillText('EARTH', panelX + 145, panelY + 214);
  }

  ctx.fillStyle = '#d5d3c8';
  ctx.font = '10px monospace';
  ctx.fillText(
    `DIR ${directions[directionIndex]}  ·  DIST ${Math.round(distance).toLocaleString()}`,
    panelX + 14,
    panelY + 229
  );

  ctx.restore();
}

function drawAsteroid(ctx, x, y, asteroid) {
  const palettes = [
    ['#30302d', '#44433e', '#1b1c1b'],
    ['#34302d', '#51483e', '#211f1c'],
    ['#292e30', '#414749', '#191d1e']
  ];

  const palette = palettes[asteroid.shade];

  const pixels = [
    '00111100',
    '01111110',
    '11111111',
    '11111111',
    '11111111',
    '01111111',
    '00111110',
    '00011000'
  ];

  const pixelSize = asteroid.size / 8;

  ctx.save();
  ctx.translate(Math.floor(x), Math.floor(y));
  ctx.rotate(asteroid.rotation);

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (pixels[row][col] !== '1') continue;

      const detail = (
        row * 7 + col * 3 + asteroid.id
      ) % 3;

      ctx.fillStyle = palette[detail];

      ctx.fillRect(
        Math.floor((col - 4) * pixelSize),
        Math.floor((row - 4) * pixelSize),
        Math.ceil(pixelSize),
        Math.ceil(pixelSize)
      );
    }
  }

  ctx.fillStyle = '#555047';
  ctx.fillRect(-pixelSize, -pixelSize, pixelSize, pixelSize);

  ctx.fillStyle = '#171817';
  ctx.fillRect(pixelSize, pixelSize, pixelSize, pixelSize * 2);

  ctx.restore();
}

function drawShip(ctx, ship, width, height, sprite) {
  ctx.save();

  ctx.translate(width / 2, height / 2);
  ctx.rotate(ship.angle + Math.PI / 2);

  if (Math.abs(ship.speed) > 5 || ship.boosting) {
    drawEngineFlame(ctx, ship);
  }

  if (sprite && sprite.complete && sprite.naturalWidth > 0) {
    const size = 64;

    const scale = size / Math.max(
      sprite.naturalWidth,
      sprite.naturalHeight
    );

    const imageWidth = sprite.naturalWidth * scale;
    const imageHeight = sprite.naturalHeight * scale;

    ctx.drawImage(
      sprite,
      -imageWidth / 2,
      -imageHeight / 2,
      imageWidth,
      imageHeight
    );
  } else {
    drawFallbackShip(ctx);
  }

  ctx.restore();
}

function drawEngineFlame(ctx, ship) {
  const power = ship.boosting ? 1 : Math.min(
    Math.abs(ship.speed) / 120,
    0.8
  );

  const flicker = 0.75 + Math.random() * 0.35;
  const length = (9 + power * 13) * flicker;

  ctx.fillStyle = '#a65e38';
  ctx.fillRect(-4, 17, 8, length);

  ctx.fillStyle = '#d69a58';
  ctx.fillRect(-2, 17, 4, length * 0.65);

  ctx.fillStyle = '#e2bd83';
  ctx.fillRect(-1, 17, 2, length * 0.3);
}

function drawFallbackShip(ctx) {
  ctx.fillStyle = '#a6a49c';

  ctx.fillRect(-4, -20, 8, 30);
  ctx.fillRect(-10, -5, 20, 10);
  ctx.fillRect(-7, 7, 14, 6);

  ctx.fillStyle = '#545b5c';
  ctx.fillRect(-3, -13, 6, 9);

  ctx.fillStyle = '#a47b50';
  ctx.fillRect(-2, 13, 4, 6);
}