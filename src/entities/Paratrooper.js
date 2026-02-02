import { Container, Sprite, Graphics } from 'pixi.js';

export class Paratrooper {
  /**
   * A paratrooper that falls from the sky with a parachute.
   * Uses the soldier sprite for the body.
   */
  constructor(options = {}) {
    this.container = new Container();
    this.landed = false;
    this.groundY = options.groundY || 200;
    this.fadeTimer = 0;

    const soldierScale = 0.22;

    // Step 1: Create soldier sprite, anchored at center-center
    // This way (0,0) is the visual center of the soldier
    if (options.soldierTexture) {
      const soldier = new Sprite(options.soldierTexture);
      soldier.anchor.set(0.5, 0.5); // Center-center
      soldier.scale.set(options.facingRight ? -soldierScale : soldierScale, soldierScale);
      soldier.position.set(0, 0);
      this.soldierSprite = soldier;
      this.container.addChild(soldier);

      if (options.tint) {
        soldier.tint = options.tint;
      }
    }

    // Step 2: Draw parachute above the soldier center
    // With center anchor, the soldier center is at (0,0)
    // The top of the soldier head is roughly at y = -15 (half of ~30px rendered height)
    const headY = -14;
    const chuteRadius = 13;
    const stringLength = 12;
    const canopyY = headY - stringLength; // canopy bottom edge

    const canopyColor = options.tint === 0xff4444 ? 0xcc8888 : options.tint === 0x44ff44 ? 0x88cc88 : 0xddddcc;
    const stringColor = 0x777766;

    const chute = new Graphics();

    // Canopy dome
    chute.arc(0, canopyY, chuteRadius, Math.PI, 0);
    chute.closePath();
    chute.fill({ color: canopyColor, alpha: 0.9 });

    // Strings from canopy rim down to soldier head area
    // Fan out from canopy, converge at head
    const attachY = headY + 2; // just below the head

    chute.moveTo(-chuteRadius, canopyY);
    chute.lineTo(-2, attachY);
    chute.stroke({ width: 0.7, color: stringColor });

    chute.moveTo(chuteRadius, canopyY);
    chute.lineTo(2, attachY);
    chute.stroke({ width: 0.7, color: stringColor });

    chute.moveTo(-chuteRadius * 0.4, canopyY);
    chute.lineTo(-1, attachY);
    chute.stroke({ width: 0.7, color: stringColor });

    chute.moveTo(chuteRadius * 0.4, canopyY);
    chute.lineTo(1, attachY);
    chute.stroke({ width: 0.7, color: stringColor });

    // Nudge chute slightly right and lower to align with soldier body
    chute.position.set(2, 3);

    this.chute = chute;
    this.container.addChild(chute);

    // Fall speed with randomness
    this.fallSpeed = 0.3 + Math.random() * 0.2;
    this.drift = (Math.random() - 0.5) * 0.15;
  }

  update(deltaTime) {
    if (!this.landed) {
      this.container.y += this.fallSpeed * deltaTime;
      this.container.x += this.drift * deltaTime;

      if (this.container.y >= this.groundY) {
        this.container.y = this.groundY;
        this.landed = true;
        this.chute.visible = false;
      }
    } else {
      this.fadeTimer += deltaTime / 60;
      if (this.fadeTimer > 2) {
        this.container.alpha = Math.max(0, 1 - (this.fadeTimer - 2));
      }
    }
  }

  get shouldRemove() {
    return this.landed && this.fadeTimer > 3;
  }
}
