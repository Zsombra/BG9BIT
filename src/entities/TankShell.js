import { Container, Sprite, Graphics } from 'pixi.js';
import { TANK_HIT_RADIUS, TANK_SHELL_SCALE } from '../constants.js';

/**
 * A tank shell projectile with arc trajectory and smoke trail.
 */
export class TankShell {
  constructor(texture, options) {
    this.container = new Container();

    // Smoke trail (drawn behind the shell)
    this.trail = new Graphics();
    this.container.addChild(this.trail);
    this.trailPoints = []; // stores past positions for trail

    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(0.5, 0.5);
    this.sprite.scale.set(TANK_SHELL_SCALE);
    this.container.addChild(this.sprite);

    if (options.tint) this.sprite.tint = options.tint;

    this.container.position.set(options.x, options.y);

    // Calculate velocity toward target
    const dx = options.targetX - options.x;
    const dy = options.targetY - options.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = options.speed || 3;
    this.vx = (dx / dist) * speed;
    this.vy = (dy / dist) * speed;

    // Arc: upward initial offset, gravity pulls down
    this.vy -= 1.2; // more arc for epic look
    this.gravity = 0.04;

    // Rotate to face travel direction
    this.sprite.rotation = Math.atan2(this.vy, this.vx);

    this.targetTank = options.targetTank;
    this.done = false;
    this.hit = false;
    this.lifetime = 0;
    this.maxLifetime = 4;

    // Store spawn position for trail
    this.spawnX = options.x;
    this.spawnY = options.y;
  }

  update(deltaTime) {
    if (this.done) return;

    // Store trail point (in world coordinates relative to container start)
    this.trailPoints.push({
      x: this.container.x,
      y: this.container.y,
      age: 0,
    });

    // Keep only last 12 trail points
    if (this.trailPoints.length > 12) {
      this.trailPoints.shift();
    }

    // Age trail points
    this.trailPoints.forEach((p) => {
      p.age += deltaTime / 60;
    });

    // Draw smoke trail
    this._drawTrail();

    // Apply gravity
    this.vy += this.gravity * deltaTime;

    this.container.x += this.vx * deltaTime;
    this.container.y += this.vy * deltaTime;
    this.lifetime += deltaTime / 60;

    // Update rotation to follow arc
    this.sprite.rotation = Math.atan2(this.vy, this.vx);

    // Off-screen or expired
    if (
      this.lifetime > this.maxLifetime ||
      this.container.x < -30 || this.container.x > 900 ||
      this.container.y < -30 || this.container.y > 260
    ) {
      this.done = true;
      return;
    }

    // Hit detection against target tank
    if (this.targetTank && this.targetTank.isAlive) {
      const dx = this.container.x - this.targetTank.container.x;
      const dy = this.container.y - (this.targetTank.container.y - 15);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < TANK_HIT_RADIUS) {
        this.done = true;
        this.hit = true;
      }
    }
  }

  _drawTrail() {
    const trail = this.trail;
    trail.clear();

    if (this.trailPoints.length < 2) return;

    // Draw fading smoke puffs along the trail
    for (let i = 0; i < this.trailPoints.length; i++) {
      const p = this.trailPoints[i];
      const alpha = (1 - p.age * 3) * (i / this.trailPoints.length) * 0.4;
      if (alpha <= 0) continue;

      const radius = 2 + p.age * 8; // puffs expand over time
      // Position relative to current container position
      const rx = p.x - this.container.x;
      const ry = p.y - this.container.y;

      trail.circle(rx, ry, radius);
      trail.fill({ color: 0x888888, alpha: Math.max(0, alpha) });
    }
  }
}
