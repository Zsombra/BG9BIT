import { Container, Sprite } from 'pixi.js';

export class Explosion {
  /**
   * One-shot explosion animation that removes itself when done.
   * @param {Texture[]} frames - Array of explosion frame textures
   * @param {Object} options
   * @param {number} options.scale - Size multiplier
   */
  constructor(frames, options = {}) {
    this.container = new Container();

    this.sprite = new Sprite(frames[0]);
    this.sprite.anchor.set(0.5, 0.5);
    this.container.addChild(this.sprite);

    const scale = options.scale || 0.5;
    this.container.scale.set(scale);

    this.frames = frames;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.frameRate = 0.08;
    this.done = false;
  }

  update(deltaTime) {
    if (this.done) return;

    this.elapsed += deltaTime / 60;
    if (this.elapsed >= this.frameRate) {
      this.elapsed = 0;
      this.frameIndex++;

      if (this.frameIndex >= this.frames.length) {
        this.done = true;
        this.container.visible = false;
        return;
      }

      this.sprite.texture = this.frames[this.frameIndex];
    }
  }
}
