import { ScrapSystem } from './scraps.js';
import { isTypingTarget } from './input.js';

const SURFACE_RADIUS = 4800;
const WALK_SPEED = 190;
const RUN_MULTIPLIER = 1.2;

// Out of stamina: the player is exhausted and moves much slower.
const EXHAUSTED_MULTIPLIER = 0.45;

// How far the player can see around themselves without a flashlight.
const AMBIENT_LIGHT_RADIUS = 105;
const SHIP_DISTANCE = 155;

const VISIBILITY_RADIUS = 50;
const VISIBILITY_EDGE = 20;
const MAP_SIZE = 500;

export class MoonSurface {
  constructor(assets = {}) {
    this.assets = assets;

    this.x = 0;
    this.y = 230;
    this.angle = -Math.PI / 2;

    this.keys = new Set();
    this.moving = false;
    this.walkAnimation = 0;

    this.mapOpen = true;

    this.shipX = 0;
    this.shipY = 0;

    this.craters = [];
    this.rocks = [];
    this.ridges = [];

    this.scraps = new ScrapSystem(assets);

    this.generateTerrain();

    window.addEventListener('keydown', (event) => {
      if (isTypingTarget(event)) return;

      const key = event.key.toLowerCase();

      if ([
        'w', 'a', 's', 'd',
        'arrowup', 'arrowdown',
        'arrowleft', 'arrowright',
        'shift'
      ].includes(key)) {
        event.preventDefault();
        this.keys.add(key);
      }
    });

    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.key.toLowerCase());
    });

    window.addEventListener('blur', () => this.clearKeys());
  }

  random(seed) {
    const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
  }

  generateTerrain() {
    // LARGE CRATERS
    for (let i = 0; i < 190; i++) {
      const angle = this.random(i + 1) * Math.PI * 2;
      const distance = Math.sqrt(this.random(i + 400)) * SURFACE_RADIUS * 0.92;

      this.craters.push({
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        radius: 35 + this.random(i + 800) * 190,
        depth: 0.4 + this.random(i + 1200) * 0.6,
        rotation: this.random(i + 1600) * Math.PI * 2
      });
    }

    // SMALL ROCKS
    for (let i = 0; i < 1400; i++) {
      const angle = this.random(i + 2000) * Math.PI * 2;
      const distance = Math.sqrt(this.random(i + 3000)) * SURFACE_RADIUS;

      this.rocks.push({
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        size: 2 + this.random(i + 4000) * 9,
        shade: Math.floor(this.random(i + 5000) * 4)
      });
    }

    // LONG TERRAIN RIDGES
    for (let i = 0; i < 65; i++) {
      const angle = this.random(i + 6000) * Math.PI * 2;
      const distance = Math.sqrt(this.random(i + 7000)) * SURFACE_RADIUS * 0.85;

      this.ridges.push({
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        width: 100 + this.random(i + 8000) * 300,
        height: 25 + this.random(i + 9000) * 70,
        rotation: this.random(i + 10000) * Math.PI
      });
    }
  }

  clearKeys() {
    this.keys.clear();
  }

  enter() {
    this.x = 0;
    this.y = 230;
    this.angle = -Math.PI / 2;
    this.walkAnimation = 0;
    this.clearKeys();
  }

  toggleMap() {
    this.mapOpen = !this.mapOpen;
  }

  toggleInventory() {
    this.scraps.toggleInventory();
    this.clearKeys();
  }

  closeInventory() {
    this.scraps.closeInventory();
    this.clearKeys();
  }

  canEnterShip() {
    return Math.hypot(
      this.x - this.shipX,
      this.y - this.shipY
    ) <= SHIP_DISTANCE;
  }

  update(dt, canRun = true, exhausted = false) {
    this.scraps.update(this.x, this.y, dt);

    if (this.scraps.inventoryOpen) {
      this.clearKeys();
      return;
    }

    let dx = 0;
    let dy = 0;

    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;

    this.moving = dx !== 0 || dy !== 0;

    if (this.moving) {
      const length = Math.hypot(dx, dy);

      dx /= length;
      dy /= length;

      
      const running = this.keys.has('shift') && canRun;

      let multiplier = 1;
      if (exhausted) multiplier = EXHAUSTED_MULTIPLIER;
      else if (running) multiplier = RUN_MULTIPLIER;

      const speed = WALK_SPEED * multiplier;

      this.x += dx * speed * dt;
      this.y += dy * speed * dt;

      this.angle = Math.atan2(dy, dx);
      this.walkAnimation += dt * 12;
    }

    // Keep the player inside the lunar surface.
    const distance = Math.hypot(this.x, this.y);
    const limit = SURFACE_RADIUS - 40;

    if (distance > limit) {
      this.x = (this.x / distance) * limit;
      this.y = (this.y / distance) * limit;
    }
  }

  draw(ctx, width, height) {
    ctx.save();

    const centerX = width / 2;
    const centerY = height / 2;

    const cameraX = centerX - this.x;
    const cameraY = centerY - this.y;

    this.drawGround(ctx, width, height, cameraX, cameraY);
    this.scraps.drawWorld(ctx, cameraX, cameraY, width, height);
    this.drawShip(ctx, cameraX + this.shipX, cameraY + this.shipY);

    // Quest chest (set by main.js).
    if (this.chestQuest) {
      this.chestQuest.draw(ctx, cameraX, cameraY, width, height);
    }

    // Enemies (set by main.js). Drawn before the darkness, so they hide in it.
    if (this.enemies) {
      this.enemies.draw(ctx, cameraX, cameraY, width, height);
      this.enemies.drawSwing(ctx, centerX, centerY);
    }
    this.drawPlayer(ctx, centerX, centerY);

    // HARD PLAYER-CENTERED VISIBILITY
    this.drawVisibility(ctx, width, height);

    // UI stays visible above the darkness.
    this.drawInteractionPrompt(ctx, centerX, centerY);

    if (this.mapOpen) {
      this.drawMap(ctx, width);
    }

    this.drawControls(ctx, width, height);
    this.scraps.drawPickupMessage(ctx, width);
    this.scraps.drawInventory(ctx, width, height);

    ctx.restore();
  }

  drawGround(ctx, width, height, cameraX, cameraY) {
    ctx.fillStyle = '#111211';
    ctx.fillRect(0, 0, width, height);

    const surfaceX = cameraX;
    const surfaceY = cameraY;

    // Lunar surface boundary.
    ctx.fillStyle = '#77766f';
    ctx.beginPath();
    ctx.arc(
      surfaceX,
      surfaceY,
      SURFACE_RADIUS,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.save();

    ctx.beginPath();
    ctx.arc(
      surfaceX,
      surfaceY,
      SURFACE_RADIUS,
      0,
      Math.PI * 2
    );
    ctx.clip();

    // Subtle surface texture.
    ctx.fillStyle = '#85837b';
    ctx.globalAlpha = 0.25;

    for (let i = 0; i < 28; i++) {
      const angle = this.random(i + 12000) * Math.PI * 2;
      const distance = this.random(i + 13000) * SURFACE_RADIUS;

      const x = surfaceX + Math.cos(angle) * distance;
      const y = surfaceY + Math.sin(angle) * distance;
      const radius = 100 + this.random(i + 14000) * 300;

      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        radius,
        radius * 0.55,
        angle,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.globalAlpha = 1;

    // Ridges and raised terrain.
    for (const ridge of this.ridges) {
      const x = surfaceX + ridge.x;
      const y = surfaceY + ridge.y;

      if (
        x < -ridge.width - 100 ||
        y < -ridge.width - 100 ||
        x > width + ridge.width + 100 ||
        y > height + ridge.width + 100
      ) continue;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ridge.rotation);

      ctx.fillStyle = '#68675f';
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        ridge.width,
        ridge.height,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.fillStyle = '#a09d92';
      ctx.beginPath();
      ctx.ellipse(
        -ridge.width * 0.12,
        -ridge.height * 0.2,
        ridge.width * 0.75,
        ridge.height * 0.28,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.restore();
    }

    // Large craters.
    for (const crater of this.craters) {
      const x = surfaceX + crater.x;
      const y = surfaceY + crater.y;
      const r = crater.radius;

      if (
        x < -r - 20 ||
        y < -r - 20 ||
        x > width + r + 20 ||
        y > height + r + 20
      ) continue;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(crater.rotation);

      // Outer shadow.
      ctx.fillStyle = '#56554f';
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        r,
        r * 0.82,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // Raised crater rim.
      ctx.strokeStyle = '#aaa69a';
      ctx.lineWidth = Math.max(3, r * 0.1);
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        r * 0.88,
        r * 0.7,
        0,
        Math.PI * 0.1,
        Math.PI * 1.8
      );
      ctx.stroke();

      // Dark crater interior.
      ctx.fillStyle = '#45443f';
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        r * 0.73,
        r * 0.57,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // Inner illuminated floor.
      ctx.fillStyle = '#5b5952';
      ctx.beginPath();
      ctx.ellipse(
        -r * 0.12,
        -r * 0.08,
        r * 0.42,
        r * 0.3,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.restore();
    }

    // Rocks and small details.
    const rockColors = [
      '#55544e',
      '#69675f',
      '#929087',
      '#45443f'
    ];

    for (const rock of this.rocks) {
      const x = surfaceX + rock.x;
      const y = surfaceY + rock.y;

      if (
        x < -20 || y < -20 ||
        x > width + 20 || y > height + 20
      ) continue;

      ctx.fillStyle = rockColors[rock.shade];
      ctx.fillRect(
        Math.floor(x),
        Math.floor(y),
        Math.ceil(rock.size),
        Math.ceil(rock.size * 0.75)
      );
    }

    ctx.restore();

    // Soft atmospheric lunar edge.
    const edge = ctx.createRadialGradient(
      surfaceX,
      surfaceY,
      SURFACE_RADIUS - 150,
      surfaceX,
      surfaceY,
      SURFACE_RADIUS + 80
    );

    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(0.8, 'rgba(0,0,0,0.2)');
    edge.addColorStop(1, '#000');

    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, width, height);
  }

  drawShip(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);

    // shipSprite is set by main.js whenever installed modules change.
    const sprite =
      this.shipSprite ||
      this.assets.ship_moon_common ||
      this.assets.ship_space_common;

    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
      const maxWidth = 145;
      const maxHeight = 115;

      const scale = Math.min(
        maxWidth / sprite.naturalWidth,
        maxHeight / sprite.naturalHeight
      );

      const drawWidth = sprite.naturalWidth * scale;
      const drawHeight = sprite.naturalHeight * scale;

      // Same upward-facing orientation as the flying spaceship.
      ctx.drawImage(
        sprite,
        -drawWidth / 2,
        -drawHeight / 2,
        drawWidth,
        drawHeight
      );
    } else {
      this.drawFallbackShip(ctx);
    }

    // Landing shadow.
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 45, 85, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Ship label.
    ctx.save();
    ctx.fillStyle = '#d3d0c3';
    ctx.textAlign = 'center';
    ctx.font = '12px monospace';
    ctx.fillText('YOUR SHIP', x, y + 85);
    ctx.restore();
  }

  drawFallbackShip(ctx) {
    ctx.save();

    ctx.fillStyle = '#333b38';
    ctx.beginPath();
    ctx.moveTo(0, -65);
    ctx.lineTo(35, 20);
    ctx.lineTo(22, 43);
    ctx.lineTo(-22, 43);
    ctx.lineTo(-35, 20);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#a4aa9a';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#1d353a';
    ctx.fillRect(-13, -15, 26, 28);

    ctx.fillStyle = '#777e70';
    ctx.fillRect(-50, 20, 100, 9);

    ctx.restore();
  }

  drawPlayer(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.angle + Math.PI / 2);

    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(0, 3, 14, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    // Small arms, matching the original interior astronaut.
    this.drawArm(ctx, -6, 2, -1);
    this.drawArm(ctx, 6, 2, 1);

    // Helmet.
    ctx.fillStyle = '#343d3a';
    ctx.beginPath();
    ctx.ellipse(0, -4, 9, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#aab3a8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -4, 8, 10, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#858f85';
    ctx.beginPath();
    ctx.ellipse(0, -4, 6.5, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1b3035';
    ctx.beginPath();
    ctx.ellipse(0, -8, 5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(177,211,197,0.6)';
    ctx.fillRect(-3, -10, 2, 1.5);

    ctx.fillStyle = '#d6c58d';
    ctx.fillRect(-1, -15, 2, 2);

    ctx.restore();
  }

  drawArm(ctx, shoulderX, shoulderY, direction) {
    ctx.save();
    ctx.translate(shoulderX, shoulderY);

    const swing = this.moving
      ? Math.sin(this.walkAnimation) * 2
      : 0;

    ctx.translate(0, swing);

    ctx.fillStyle = '#78847b';
    ctx.fillRect(direction === -1 ? -4 : 0, -2, 4, 4);

    ctx.fillStyle = '#aeb7a9';
    ctx.fillRect(direction === -1 ? -3 : 0, -2, 1, 4);

    ctx.fillStyle = '#c0b69e';
    ctx.beginPath();
    ctx.arc(direction * 5, 0, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Darkness around the player. With the flashlight on, a beam of light
  // also points the way the player is facing.
  // this.flashlight is set by main.js: { length, halfAngle } or null (off).
  drawVisibility(ctx, width, height) {
    if (this.flashlight) {
      this.drawFlashlightDarkness(ctx, width, height, this.flashlight);
      return;
    }

    const radius = AMBIENT_LIGHT_RADIUS;
    const fade = 65;

    const centerX = width / 2;
    const centerY = height / 2;

    const darkness = ctx.createRadialGradient(
      centerX,
      centerY,
      radius * 0.65,
      centerX,
      centerY,
      radius + fade
    );

    darkness.addColorStop(0, 'rgba(0,0,0,0)');
    darkness.addColorStop(0.65, 'rgba(0,0,0,0.02)');
    darkness.addColorStop(0.82, 'rgba(25,28,29,0.35)');
    darkness.addColorStop(0.94, 'rgba(10,12,13,0.82)');
    darkness.addColorStop(1, '#000000');

    ctx.save();
    ctx.fillStyle = darkness;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  drawFlashlightDarkness(ctx, width, height, beam) {
    // A separate darkness layer: fill it black, then "cut out" the light.
    if (!this.darknessLayer) {
      this.darknessLayer = document.createElement('canvas');
      this.darknessCtx = this.darknessLayer.getContext('2d');
    }

    const layer = this.darknessLayer;
    const dctx = this.darknessCtx;

    if (layer.width !== ctx.canvas.width || layer.height !== ctx.canvas.height) {
      layer.width = ctx.canvas.width;
      layer.height = ctx.canvas.height;
    }

    const centerX = width / 2;
    const centerY = height / 2;

    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.globalCompositeOperation = 'source-over';
    dctx.fillStyle = '#000';
    dctx.fillRect(0, 0, layer.width, layer.height);

    // Same coordinates as the game (CSS pixels).
    dctx.setTransform(ctx.getTransform());
    dctx.globalCompositeOperation = 'destination-out';

    // 1. Small glow around the player (same as without a flashlight).
    const radius = AMBIENT_LIGHT_RADIUS;
    const glow = dctx.createRadialGradient(
      centerX, centerY, radius * 0.65,
      centerX, centerY, radius + 65
    );

    glow.addColorStop(0, 'rgba(0,0,0,1)');
    glow.addColorStop(0.65, 'rgba(0,0,0,0.98)');
    glow.addColorStop(0.82, 'rgba(0,0,0,0.65)');
    glow.addColorStop(0.94, 'rgba(0,0,0,0.18)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');

    dctx.fillStyle = glow;
    dctx.fillRect(0, 0, width, height);

    // 2. The beam: three nested cones, so the edges are soft.
    const cones = [
      [1, 0.35],
      [0.7, 0.45],
      [0.4, 0.5]
    ];

    for (const [angleScale, strength] of cones) {
      const half = beam.halfAngle * angleScale;

      const light = dctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, beam.length
      );

      light.addColorStop(0, `rgba(0,0,0,${strength})`);
      light.addColorStop(0.7, `rgba(0,0,0,${strength})`);
      light.addColorStop(1, 'rgba(0,0,0,0)');

      dctx.fillStyle = light;
      dctx.beginPath();
      dctx.moveTo(centerX, centerY);
      dctx.arc(
        centerX,
        centerY,
        beam.length,
        this.angle - half,
        this.angle + half
      );
      dctx.closePath();
      dctx.fill();
    }

    dctx.globalCompositeOperation = 'source-over';

    // Put the darkness over the game.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);
    ctx.restore();

    // Very faint warm tint inside the beam.
    ctx.save();
    ctx.fillStyle = 'rgba(255, 236, 190, 0.05)';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(
      centerX,
      centerY,
      beam.length,
      this.angle - beam.halfAngle * 0.7,
      this.angle + beam.halfAngle * 0.7
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawInteractionPrompt(ctx, centerX, centerY) {
    if (!this.canEnterShip()) return;

    ctx.save();

    ctx.textAlign = 'center';
    ctx.font = 'bold 15px monospace';

    const x = centerX;
    const y = centerY + 110;
    const boxWidth = 230;

    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(x - boxWidth / 2, y, boxWidth, 36);

    ctx.strokeStyle = '#a9b18c';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - boxWidth / 2, y, boxWidth, 36);

    ctx.fillStyle = '#d5dfb4';
    ctx.fillText('PRESS E TO ENTER SHIP', x, y + 23);

    ctx.restore();
  }

  drawMap(ctx, screenWidth) {
    const size = MAP_SIZE;
    const x = screenWidth - size - 25;
    const y = 25;
    const radius = size / 2 - 25;
    const scale = radius / SURFACE_RADIUS;

    ctx.save();

    // Map panel.
    ctx.fillStyle = 'rgba(9,11,10,0.94)';
    ctx.fillRect(x, y, size, size);

    ctx.strokeStyle = '#777c70';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, size, size);

    const cx = x + size / 2;
    const cy = y + size / 2 + 8;

    ctx.save();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#77766e';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Map crater pattern.
    for (const crater of this.craters) {
      const mx = cx + crater.x * scale;
      const my = cy + crater.y * scale;
      const r = Math.max(2, crater.radius * scale);

      ctx.fillStyle = '#55544e';
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#aaa69a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mx, my, r * 0.8, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Uncollected scrap markers.
    this.scraps.drawMap(ctx, cx, cy, scale);

    // Player-to-ship direction line.
    ctx.strokeStyle = 'rgba(220,220,200,0.35)';
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(cx + this.x * scale, cy + this.y * scale);
    ctx.lineTo(cx + this.shipX * scale, cy + this.shipY * scale);
    ctx.stroke();
    ctx.setLineDash([]);

    // Ship marker.
    ctx.fillStyle = '#8bd0b7';
    ctx.beginPath();
    ctx.arc(
      cx + this.shipX * scale,
      cy + this.shipY * scale,
      6,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Player marker.
    ctx.fillStyle = '#f0e4b9';
    ctx.beginPath();
    ctx.arc(
      cx + this.x * scale,
      cy + this.y * scale,
      5,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();

    ctx.fillStyle = '#d5d0c5';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('LUNAR SURFACE MAP', x + 14, y + 19);

    ctx.font = '10px monospace';
    ctx.fillStyle = '#8bd0b7';
    ctx.fillText('● SHIP', x + 15, y + size - 13);

    ctx.fillStyle = '#f0e4b9';
    ctx.fillText('● YOU', x + 100, y + size - 13);

    ctx.restore();
  }

  // Control hints in the bottom-right corner, above the coordinates,
  // so they don't overlap the survival panel on the left.
  drawControls(ctx, width, height) {
    ctx.save();

    ctx.textAlign = 'right';
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(220,220,205,0.7)';

    const lines = [
      'WASD / ARROWS  MOVE',
      'SHIFT  RUN',
      'SPACE / CLICK  ATTACK',
      'E  ENTER SHIP',
      'B  INVENTORY',
      'F  FLASHLIGHT',
      'Q  METAL DETECTOR',
      'M  MAP'
    ];

    lines.forEach((line, index) => {
      ctx.fillText(line, width - 22, height - 180 + index * 18);
    });

    ctx.restore();
  }
}