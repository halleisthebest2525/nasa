import { isTypingTarget } from './input.js';

const ROOM_WIDTH = 1100;
const ROOM_HEIGHT = 760;

const WALK_SPEED = 210;
const RUN_MULTIPLIER = 1.2;

const SEAT_INTERACTION_DISTANCE = 95;
const BED_INTERACTION_DISTANCE = 105;
const EXIT_INTERACTION_DISTANCE = 105;
const COMPUTER_INTERACTION_DISTANCE = 110;

// The top-center console is positioned at (0, -267).
const COMPUTER = {
  x: 0,
  y: -267
};

// The ship interior is lit, so the player sees much more of it.
const VISIBILITY_RADIUS = 280;

const BED = {
  x: -350,
  y: 190
};

const EXIT = {
  x: ROOM_WIDTH / 2 - 75,
  y: 0
};

export class OnFoot {
  constructor(assets = {}) {
    this.assets = assets;

    this.x = 0;
    this.y = 125;
    this.angle = -Math.PI / 2;

    this.keys = new Set();
    this.walkAnimation = 0;
    this.moving = false;

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

    window.addEventListener('blur', () => {
      this.clearKeys();
    });
  }

  clearKeys() {
    this.keys.clear();
    this.moving = false;
  }

  enter() {
    this.x = 0;
    this.y = 125;
    this.angle = -Math.PI / 2;
    this.walkAnimation = 0;
    this.clearKeys();
  }

  update(dt, canRun = true) {
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
      const speed = WALK_SPEED * (running ? RUN_MULTIPLIER : 1);
      this.x += dx * speed * dt;
      this.y += dy * speed * dt;

      this.angle = Math.atan2(dy, dx);
      this.walkAnimation += dt * 11;
    }

    const halfWidth = ROOM_WIDTH / 2 - 35;
    const halfHeight = ROOM_HEIGHT / 2 - 35;

    this.x = Math.max(-halfWidth, Math.min(halfWidth, this.x));
    this.y = Math.max(-halfHeight, Math.min(halfHeight, this.y));
  }

  canDrive() {
    return Math.hypot(this.x, this.y) <= SEAT_INTERACTION_DISTANCE;
  }

  canSleep() {
    return Math.hypot(
      this.x - BED.x,
      this.y - BED.y
    ) <= BED_INTERACTION_DISTANCE;
  }

  canExit() {
    return Math.hypot(
      this.x - EXIT.x,
      this.y - EXIT.y
    ) <= EXIT_INTERACTION_DISTANCE;
  }

  canUseComputer() {
    return Math.hypot(
      this.x - COMPUTER.x,
      this.y - COMPUTER.y
    ) <= COMPUTER_INTERACTION_DISTANCE;
  }

  draw(ctx, width, height) {
    ctx.save();

    const centerX = width / 2;
    const centerY = height / 2;

    const roomX = centerX - this.x;
    const roomY = centerY - this.y;

    // FLOOR
    ctx.fillStyle = '#303634';

    ctx.fillRect(
      roomX - ROOM_WIDTH / 2,
      roomY - ROOM_HEIGHT / 2,
      ROOM_WIDTH,
      ROOM_HEIGHT
    );

    // FLOOR PANELS
    ctx.save();

    ctx.beginPath();
    ctx.rect(
      roomX - ROOM_WIDTH / 2,
      roomY - ROOM_HEIGHT / 2,
      ROOM_WIDTH,
      ROOM_HEIGHT
    );
    ctx.clip();

    ctx.strokeStyle = '#414947';
    ctx.lineWidth = 2;

    for (let x = -ROOM_WIDTH / 2; x <= ROOM_WIDTH / 2; x += 80) {
      ctx.beginPath();
      ctx.moveTo(roomX + x, roomY - ROOM_HEIGHT / 2);
      ctx.lineTo(roomX + x, roomY + ROOM_HEIGHT / 2);
      ctx.stroke();
    }

    for (let y = -ROOM_HEIGHT / 2; y <= ROOM_HEIGHT / 2; y += 80) {
      ctx.beginPath();
      ctx.moveTo(roomX - ROOM_WIDTH / 2, roomY + y);
      ctx.lineTo(roomX + ROOM_WIDTH / 2, roomY + y);
      ctx.stroke();
    }

    // FLOOR LIGHTS
    ctx.fillStyle = '#8c987d';

    for (let x = -ROOM_WIDTH / 2 + 25; x < ROOM_WIDTH / 2; x += 160) {
      ctx.fillRect(roomX + x, roomY - ROOM_HEIGHT / 2 + 12, 35, 3);
      ctx.fillRect(roomX + x, roomY + ROOM_HEIGHT / 2 - 15, 35, 3);
    }

    ctx.restore();

    // OUTER WALLS
    ctx.strokeStyle = '#777d75';
    ctx.lineWidth = 18;

    ctx.strokeRect(
      roomX - ROOM_WIDTH / 2,
      roomY - ROOM_HEIGHT / 2,
      ROOM_WIDTH,
      ROOM_HEIGHT
    );

    ctx.strokeStyle = '#242927';
    ctx.lineWidth = 5;

    ctx.strokeRect(
      roomX - ROOM_WIDTH / 2 + 12,
      roomY - ROOM_HEIGHT / 2 + 12,
      ROOM_WIDTH - 24,
      ROOM_HEIGHT - 24
    );

    // EQUIPMENT
    this.drawConsole(ctx, roomX - 390, roomY - 100, 130, 190);
    this.drawConsole(ctx, roomX + 260, roomY - 100, 130, 190);
    this.drawConsole(ctx, roomX - 120, roomY - 300, 240, 65);

    // BED AND PILOT SEAT
    this.drawBed(
      ctx,
      centerX + BED.x - this.x,
      centerY + BED.y - this.y
    );

    this.drawDriverSeat(
      ctx,
      centerX - this.x,
      centerY - this.y
    );

    // EXIT DOOR
    this.drawExitDoor(
      ctx,
      centerX + EXIT.x - this.x,
      centerY + EXIT.y - this.y
    );

    // PLAYER
    this.drawCharacter(ctx, centerX, centerY);

    // INTERACTION PROMPTS
    if (this.canUseComputer()) {
      this.drawPrompt(
        ctx,
        centerX + COMPUTER.x - this.x,
        centerY + COMPUTER.y - this.y - 55,
        'PRESS E TO USE COMPUTER'
      );
    } else if (this.canExit()) {
      this.drawPrompt(
        ctx,
        centerX + EXIT.x - this.x,
        centerY + EXIT.y - this.y + 65,
        'PRESS E TO EXIT'
      );
    } else if (this.canDrive()) {
      this.drawPrompt(
        ctx,
        centerX - this.x,
        centerY - this.y - 105,
        'PRESS E TO DRIVE'
      );
    } else if (this.canSleep()) {
      this.drawPrompt(
        ctx,
        centerX + BED.x - this.x,
        centerY + BED.y - this.y - 80,
        'PRESS E TO SLEEP'
      );
    }

    this.drawVisibility(ctx, width, height);

    ctx.restore();
  }

  drawExitDoor(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = '#171d1b';
    ctx.fillRect(-45, -70, 90, 140);

    ctx.strokeStyle = '#858b7e';
    ctx.lineWidth = 5;
    ctx.strokeRect(-45, -70, 90, 140);

    ctx.fillStyle = '#424b46';
    ctx.fillRect(-34, -59, 68, 118);

    ctx.strokeStyle = '#737e70';
    ctx.lineWidth = 2;
    ctx.strokeRect(-34, -59, 68, 118);

    ctx.fillStyle = '#c5a66a';
    ctx.fillRect(-24, -47, 8, 5);
    ctx.fillRect(16, -47, 8, 5);

    ctx.fillStyle = '#b7b69d';
    ctx.fillRect(22, -4, 5, 18);

    ctx.fillStyle = '#d0c6a5';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EXIT', 0, 80);

    ctx.restore();
  }

  drawPrompt(ctx, x, y, message) {
    ctx.save();

    ctx.textAlign = 'center';
    ctx.font = 'bold 15px monospace';

    const boxWidth = message.length > 20 ? 290 : 210;

    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(x - boxWidth / 2, y, boxWidth, 34);

    ctx.strokeStyle = '#a9b18c';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - boxWidth / 2, y, boxWidth, 34);

    ctx.fillStyle = '#d5dfb4';
    ctx.fillText(message, x, y + 22);

    ctx.restore();
  }

  drawConsole(ctx, x, y, width, height) {
    ctx.save();

    ctx.fillStyle = '#171d1c';
    ctx.fillRect(x, y, width, height);

    ctx.strokeStyle = '#858b7e';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, width, height);

    ctx.fillStyle = '#48564d';
    ctx.fillRect(x + 12, y + 12, width - 24, height - 24);

    ctx.fillStyle = '#a5b38c';

    const lightCount = Math.max(3, Math.floor(width / 22));

    for (let i = 0; i < lightCount; i++) {
      ctx.fillRect(
        x + 15 + i * 19,
        y + height / 2 - 3,
        9,
        6
      );
    }

    ctx.fillStyle = '#202927';
    ctx.fillRect(x + 15, y + 20, width - 30, 8);

    ctx.restore();
  }

  drawDriverSeat(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = '#171b1a';
    ctx.fillRect(-42, -43, 84, 86);

    ctx.strokeStyle = '#858b7e';
    ctx.lineWidth = 4;
    ctx.strokeRect(-42, -43, 84, 86);

    ctx.fillStyle = '#59615b';
    ctx.fillRect(-29, -29, 58, 58);

    ctx.fillStyle = '#343b37';
    ctx.fillRect(-22, -49, 44, 19);

    ctx.fillStyle = '#777e73';
    ctx.fillRect(-47, -22, 13, 43);
    ctx.fillRect(34, -22, 13, 43);

    ctx.fillStyle = '#d0c6a5';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PILOT', 0, 6);

    ctx.restore();
  }

  drawBed(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = '#171d1b';
    ctx.fillRect(-75, -42, 150, 84);

    ctx.strokeStyle = '#858b7e';
    ctx.lineWidth = 4;
    ctx.strokeRect(-75, -42, 150, 84);

    ctx.fillStyle = '#777d73';
    ctx.fillRect(-67, -34, 134, 68);

    ctx.fillStyle = '#c0bda9';
    ctx.fillRect(-58, -26, 38, 51);

    ctx.fillStyle = '#485c56';
    ctx.fillRect(-12, -29, 72, 58);

    ctx.strokeStyle = '#718078';
    ctx.lineWidth = 2;
    ctx.strokeRect(-12, -29, 72, 58);

    ctx.fillStyle = '#d0c6a5';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('REST AREA', 0, 57);

    ctx.restore();
  }

  drawCharacter(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.angle + Math.PI / 2);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 13, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    this.drawArm(ctx, -6, 2, -1);
    this.drawArm(ctx, 6, 2, 1);

    // HELMET
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

  drawVisibility(ctx, width, height) {
    const radius = VISIBILITY_RADIUS;
    const fade = 65;

    const darkness = ctx.createRadialGradient(
      width / 2,
      height / 2,
      radius * 0.65,
      width / 2,
      height / 2,
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
}