import { Container } from 'pixi.js';

export class Battlefield {
  /**
   * @param {Texture} skyTexture - unused, kept for API compatibility
   */
  constructor(skyTexture) {
    this.container = new Container();

    // Layer 3: Units (armies added here)
    this.unitsLayer = new Container();

    // Layer 4: Effects (explosions rendered on top)
    this.effectsLayer = new Container();

    // Z-order: back to front (no background layers)
    this.container.addChild(this.unitsLayer);
    this.container.addChild(this.effectsLayer);
  }
}
