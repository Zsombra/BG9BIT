import { Container, Sprite, Graphics } from 'pixi.js';
import { WALK_FRAME_RATE, SHOOT_FRAME_RATE, TANK_MAX_HP } from '../constants.js';

/**
 * HD Sherman tank with full ground combat:
 * States: idle, move, attack, hit, dying, dead
 * Epic attack: recoil kick + muzzle flash.
 * Sprite faces RIGHT natively.
 */
export class Tank {
  constructor(textures, options = {}) {
    this.container = new Container();

    this.sprite = new Sprite(textures.idle[0]);
    this.sprite.anchor.set(0.5, 1);
    this.container.addChild(this.sprite);

    const scale = options.scale || 0.22;
    this.facingRight = options.facingRight || false;
    this.baseScale = scale;
    this.container.scale.set(
      options.facingRight ? scale : -scale,
      scale
    );

    if (options.tint) {
      this.sprite.tint = options.tint;
    }

    this.textures = textures;
    this.currentFrames = textures.idle;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.frameRate = WALK_FRAME_RATE;
    this.state = 'idle';
    this.looping = true;

    // Combat
    this.hp = TANK_MAX_HP;
    this.shootCooldown = Math.random() * 2; // stagger initial shots
    this.hitTimer = 0;
    this.respawnTimer = 0;
    this.baseX = 0;
    this.baseY = 0;

    // Recoil
    this.recoilOffset = 0;
    this.recoilPhase = 0;

    // Muzzle flash
    this.muzzleFlash = new Graphics();
    this.muzzleFlash.visible = false;
    this.container.addChild(this.muzzleFlash);
    this.muzzleFlashTimer = 0;
  }

  setPosition(x, y) {
    this.container.position.set(x, y);
    this.baseX = x;
    this.baseY = y;
  }

  get isAlive() {
    return this.state !== 'dying' && this.state !== 'dead';
  }

  attack() {
    if (this.state === 'attack' || !this.isAlive) return false;
    this.state = 'attack';
    this.currentFrames = this.textures.attack;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.frameRate = 0.06; // Faster frames for snappy attack
    this.looping = false;

    // Trigger recoil kick
    this.recoilPhase = 1.0; // starts at max
    this.recoilOffset = 0;

    // Trigger muzzle flash
    this._drawMuzzleFlash();
    this.muzzleFlash.visible = true;
    this.muzzleFlashTimer = 0.15; // visible for 150ms

    return true;
  }

  _drawMuzzleFlash() {
    const flash = this.muzzleFlash;
    flash.clear();

    // Barrel tip position (relative to sprite center, unscaled coords)
    // Tank faces RIGHT natively, barrel extends to the right
    const barrelX = 150; // pixels from center to barrel tip (unscaled)
    const barrelY = -200; // pixels up from bottom anchor (unscaled)

    // Bright yellow-white core
    flash.circle(barrelX, barrelY, 18);
    flash.fill({ color: 0xffffaa, alpha: 0.9 });

    // Orange outer glow
    flash.circle(barrelX, barrelY, 30);
    flash.fill({ color: 0xff8800, alpha: 0.5 });

    // Red outer ring
    flash.circle(barrelX, barrelY, 40);
    flash.fill({ color: 0xff4400, alpha: 0.25 });

    // Small sparks shooting out
    for (let i = 0; i < 4; i++) {
      const angle = (Math.random() - 0.5) * 1.2;
      const dist = 25 + Math.random() * 20;
      const sx = barrelX + Math.cos(angle) * dist;
      const sy = barrelY + Math.sin(angle) * dist;
      flash.circle(sx, sy, 3 + Math.random() * 3);
      flash.fill({ color: 0xffdd44, alpha: 0.8 });
    }
  }

  moveForward() {
    if (this.state === 'move' || !this.isAlive) return;
    this.state = 'move';
    this.currentFrames = this.textures.moveForward;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.frameRate = WALK_FRAME_RATE;
    this.looping = true;
  }

  idle() {
    if (this.state === 'idle' || !this.isAlive) return;
    this.state = 'idle';
    this.currentFrames = this.textures.idle;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.looping = true;
  }

  takeDamage(amount = 1) {
    if (!this.isAlive) return;
    this.hp -= amount;

    if (this.hp <= 0) {
      this._startDying();
    } else {
      this._startHit();
    }
  }

  _startHit() {
    this.state = 'hit';
    this.currentFrames = this.textures.moveBackward;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.frameRate = 0.06;
    this.looping = false;
    this.hitTimer = 0;
  }

  _startDying() {
    this.state = 'dying';
    this.currentFrames = this.textures.death;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.frameRate = 0.1;
    this.looping = false;
  }

  respawn(x, y) {
    this.hp = TANK_MAX_HP;
    this.state = 'idle';
    this.currentFrames = this.textures.idle;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.looping = true;
    this.container.position.set(x, y);
    this.baseX = x;
    this.baseY = y;
    this.container.visible = true;
    this.sprite.alpha = 1;
    this.shootCooldown = 1.5;
    this.recoilOffset = 0;
    this.recoilPhase = 0;
    this.muzzleFlash.visible = false;
    this.container.scale.set(
      this.facingRight ? this.baseScale : -this.baseScale,
      this.baseScale
    );
  }

  update(deltaTime) {
    if (this.state === 'dead') return;

    // Tick shoot cooldown
    if (this.shootCooldown > 0) {
      this.shootCooldown -= deltaTime / 60;
    }

    // ---- Recoil animation (runs during any state) ----
    if (this.recoilPhase > 0) {
      this.recoilPhase -= deltaTime / 60 * 5; // decay over ~0.2s
      if (this.recoilPhase < 0) this.recoilPhase = 0;
      // Kick backward then spring back — sine curve
      this.recoilOffset = Math.sin(this.recoilPhase * Math.PI) * 8;
      // Apply recoil to sprite position (backward = opposite of facing)
      this.sprite.x = this.facingRight ? -this.recoilOffset : this.recoilOffset;
    } else {
      this.sprite.x = 0;
    }

    // ---- Muzzle flash fade ----
    if (this.muzzleFlash.visible) {
      this.muzzleFlashTimer -= deltaTime / 60;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleFlash.visible = false;
      } else {
        // Fade out
        this.muzzleFlash.alpha = this.muzzleFlashTimer / 0.15;
        // Slight scale pulse
        const pulse = 1.0 + (this.muzzleFlashTimer / 0.15) * 0.3;
        this.muzzleFlash.scale.set(pulse);
      }
    }

    // ---- DYING: play death animation then go dead ----
    if (this.state === 'dying') {
      this.elapsed += deltaTime / 60;
      if (this.elapsed >= this.frameRate) {
        this.elapsed = 0;
        this.frameIndex++;
        if (this.frameIndex >= this.currentFrames.length) {
          this.state = 'dead';
          this.container.visible = false;
          this.respawnTimer = 0;
          return;
        }
        this.sprite.texture = this.currentFrames[this.frameIndex];
      }
      return;
    }

    // ---- HIT: brief recoil with flash ----
    if (this.state === 'hit') {
      this.hitTimer += deltaTime / 60;
      this.elapsed += deltaTime / 60;
      if (this.elapsed >= this.frameRate) {
        this.elapsed = 0;
        this.frameIndex++;
        if (this.frameIndex >= this.currentFrames.length) {
          this.frameIndex = 0;
        }
        this.sprite.texture = this.currentFrames[this.frameIndex];
      }
      this.sprite.alpha = Math.sin(this.hitTimer * 30) > 0 ? 1 : 0.5;
      if (this.hitTimer > 0.4) {
        this.sprite.alpha = 1;
        this.state = 'idle';
        this.currentFrames = this.textures.idle;
        this.frameIndex = 0;
      }
      return;
    }

    // ---- Normal animation (idle, move, attack) ----
    if (this.currentFrames.length <= 1) return;

    this.elapsed += deltaTime / 60;
    if (this.elapsed >= this.frameRate) {
      this.elapsed = 0;
      this.frameIndex++;

      if (this.frameIndex >= this.currentFrames.length) {
        if (!this.looping) {
          this.moveForward();
          return;
        }
        this.frameIndex = 0;
      }

      this.sprite.texture = this.currentFrames[this.frameIndex];
    }
  }
}
