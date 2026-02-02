import { Sprite } from 'pixi.js';
import { COIN_SCALE, COIN_GRAVITY, GROUND_Y, CANVAS_HEIGHT } from '../constants.js';

/**
 * A crypto coin icon that falls from a destroyed plane.
 * Spins while falling with gravity, fades near ground, auto-cleans up.
 */
export class FallingCoin {
  constructor(texture, x, y) {
    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(0.5, 0.5);
    this.sprite.scale.set(COIN_SCALE);
    this.sprite.position.set(x, y);

    // Random initial velocity (scatter outward)
    this.vx = (Math.random() - 0.5) * 1.5;
    this.vy = -(Math.random() * 1.5 + 0.5); // slight upward burst first

    // Spin
    this.spinSpeed = (Math.random() - 0.5) * 0.15;

    this.done = false;
  }

  update(deltaTime) {
    if (this.done) return;

    // Gravity
    this.vy += COIN_GRAVITY * deltaTime;

    // Move
    this.sprite.x += this.vx * deltaTime;
    this.sprite.y += this.vy * deltaTime;

    // Spin
    this.sprite.rotation += this.spinSpeed * deltaTime;

    // Fade near ground
    if (this.sprite.y > GROUND_Y - 20) {
      this.sprite.alpha -= 0.03 * deltaTime;
      if (this.sprite.alpha <= 0) {
        this.sprite.alpha = 0;
        this.done = true;
      }
    }

    // Off-screen cleanup
    if (this.sprite.y > CANVAS_HEIGHT + 20) {
      this.done = true;
    }
  }
}
