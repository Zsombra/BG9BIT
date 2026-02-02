import { Container, Sprite } from 'pixi.js';
import { PLANE_HIT_RADIUS } from '../constants.js';

/**
 * A small bullet projectile that flies toward a target plane.
 * Does its own hit detection against the assigned target.
 */
export class Bullet {
  /**
   * @param {Texture} texture - bullet.png texture
   * @param {Object} options
   * @param {number} options.x - spawn x
   * @param {number} options.y - spawn y
   * @param {number} options.targetX - target x (for direction)
   * @param {number} options.targetY - target y (for direction)
   * @param {number} options.speed - pixels per deltaTime unit
   * @param {number} options.tint - team color
   * @param {Plane} options.targetPlane - reference for hit detection
   */
  constructor(texture, options) {
    this.container = new Container();

    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(0.5, 0.5);
    this.sprite.scale.set(0.08);
    this.container.addChild(this.sprite);

    if (options.tint) this.sprite.tint = options.tint;

    this.container.position.set(options.x, options.y);

    // Calculate velocity vector toward target position
    const dx = options.targetX - options.x;
    const dy = options.targetY - options.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = options.speed || 4;
    this.vx = (dx / dist) * speed;
    this.vy = (dy / dist) * speed;

    // Rotate sprite to face travel direction
    this.sprite.rotation = Math.atan2(dy, dx);

    this.targetPlane = options.targetPlane;
    this.done = false;
    this.hit = false;
    this.lifetime = 0;
    this.maxLifetime = 3; // seconds
  }

  update(deltaTime) {
    if (this.done) return;

    this.container.x += this.vx * deltaTime;
    this.container.y += this.vy * deltaTime;
    this.lifetime += deltaTime / 60;

    // Off-screen or expired
    if (
      this.lifetime > this.maxLifetime ||
      this.container.x < -30 || this.container.x > 900 ||
      this.container.y < -30 || this.container.y > 260
    ) {
      this.done = true;
      return;
    }

    // Hit detection against target plane
    if (this.targetPlane && this.targetPlane.isAlive) {
      const dx = this.container.x - this.targetPlane.container.x;
      const dy = this.container.y - this.targetPlane.container.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < PLANE_HIT_RADIUS) {
        this.done = true;
        this.hit = true;
      }
    }
  }
}
