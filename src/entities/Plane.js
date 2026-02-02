import { Container, Sprite, Graphics } from 'pixi.js';
import {
  PLANE_MAX_HP, PLANE_DAMAGED_THRESHOLD, GROUND_Y,
} from '../constants.js';

/**
 * WW2 P-51 Mustang fighter with effect-based states.
 * Uses a SINGLE sprite (normal or damaged) and overlays effects
 * (muzzle flash, hit spark, fire/smoke) programmatically.
 * Up/Down handled via rotation instead of separate textures.
 *
 * States: idle, attacking, hit, evading, dying, dead
 */
export class Plane {
  constructor(textures, options = {}) {
    this.container = new Container();

    // Main plane sprite — single texture for all states
    this.normalTexture = textures.idle;
    this.deathFrames = textures.death || [];

    this.sprite = new Sprite(this.normalTexture);
    this.sprite.anchor.set(0.5, 0.5);
    this.container.addChild(this.sprite);

    const scale = options.scale || 0.15;
    this.facingRight = options.facingRight || false;
    this.baseScale = scale;
    // WW2 P-51 sprite faces LEFT natively, flip for facingRight
    this.container.scale.set(
      this.facingRight ? -scale : scale,
      scale
    );

    if (options.tint) this.sprite.tint = options.tint;

    this.speed = options.speed || 0.8;

    // State
    this.state = 'idle';

    // Bobbing
    this.bobPhase = Math.random() * Math.PI * 2;
    this.bobSpeed = 0.02 + Math.random() * 0.01;
    this.bobAmount = 0.3;

    // Combat
    this.hp = PLANE_MAX_HP;
    this.isDamaged = false;
    this.baseY = 0;

    // Shooting cooldown
    this.shootCooldown = Math.random() * 1.5;

    // Hit reaction
    this.hitTimer = 0;

    // Evasion
    this.evadeTimer = 0;
    this.evadeDirection = 0;

    // Death/crash
    this.deathTimer = 0;
    this.crashVelocityY = 0;

    // Respawn
    this.respawnTimer = 0;

    // === Effect overlays ===

    // Muzzle flash (attack effect) - small yellow-orange circle at nose
    this.muzzleFlash = new Graphics();
    this.muzzleFlash.visible = false;
    this.container.addChild(this.muzzleFlash);
    this.attackTimer = 0;

    // Hit spark (damage effect) - bright flash on body
    this.hitSpark = new Graphics();
    this.hitSpark.visible = false;
    this.container.addChild(this.hitSpark);

    // Fire effect (death) - orange glow
    this.fireEffect = new Graphics();
    this.fireEffect.visible = false;
    this.container.addChild(this.fireEffect);

    // Smoke trail (damaged idle) - grey puff behind
    this.smokeTrail = new Graphics();
    this.smokeTrail.visible = false;
    this.container.addChild(this.smokeTrail);
    this.smokePhase = 0;

    // Rotation for up/down (in local space, so it works with container flip)
    this.targetRotation = 0;
  }

  /** Store the base patrol altitude */
  setBaseY(y) {
    this.baseY = y;
  }

  /** Can this plane be targeted? */
  get isAlive() {
    return this.state !== 'dying' && this.state !== 'dead';
  }

  /** Switch to attack state (muzzle flash) */
  attack() {
    if (this.state !== 'idle') return false;
    this.state = 'attacking';
    this.attackTimer = 0;
    this._showMuzzleFlash();
    return true;
  }

  /** Take damage from a bullet hit */
  takeDamage(amount = 1) {
    if (!this.isAlive) return;
    this.hp -= amount;

    if (this.hp <= PLANE_DAMAGED_THRESHOLD && this.hp > 0) {
      this.isDamaged = true;
    }

    if (this.hp <= 0) {
      this._startDying();
    } else {
      this._startHit();
    }
  }

  _startHit() {
    this.state = 'hit';
    this.hitTimer = 0;
    this._showHitSpark();
  }

  _startDying() {
    this.state = 'dying';
    this.deathTimer = 0;
    this.deathFrameIndex = 0;
    this.deathFrameElapsed = 0;
    this.crashVelocityY = 0.5;
    // Switch to first death frame (fire/explosion animation from old biplane)
    if (this.deathFrames.length > 0) {
      this.sprite.texture = this.deathFrames[0];
    }
    this.fireEffect.visible = true;
  }

  /** Reset plane after respawn delay */
  respawn(x, y) {
    this.hp = PLANE_MAX_HP;
    this.isDamaged = false;
    this.state = 'idle';
    this.sprite.texture = this.normalTexture;
    this.deathFrameIndex = 0;
    this.deathFrameElapsed = 0;
    this.container.position.set(x, y);
    this.baseY = y;
    this.container.visible = true;
    this.container.alpha = 1;
    this.sprite.rotation = 0;
    this.targetRotation = 0;
    this.deathTimer = 0;
    this.respawnTimer = 0;
    this.shootCooldown = 1;

    // Reset effects
    this.muzzleFlash.visible = false;
    this.hitSpark.visible = false;
    this.fireEffect.visible = false;
    this.smokeTrail.visible = false;

    // Restore scale (P-51 faces LEFT natively)
    this.container.scale.set(
      this.facingRight ? -this.baseScale : this.baseScale,
      this.baseScale
    );
  }

  /** Brief up/down evasive dodge */
  evade() {
    if (this.state !== 'idle') return;
    this.state = 'evading';
    this.evadeDirection = Math.random() > 0.5 ? -1 : 1;
    this.evadeTimer = 0;
    // Tilt the plane sprite for evasion
    this.targetRotation = this.evadeDirection * -0.25; // ~15 degrees
  }

  // ============ EFFECT DRAWING ============

  _showMuzzleFlash() {
    const flash = this.muzzleFlash;
    flash.clear();
    // Flash at the nose of the plane (sprite-local coords, plane faces right)
    const noseX = this.sprite.width * 0.5 + 5;
    const noseY = 2;

    // Bright yellow-orange flash
    flash.circle(noseX, noseY, 8 + Math.random() * 4);
    flash.fill({ color: 0xFFDD44, alpha: 0.9 });
    flash.circle(noseX + 3, noseY, 5);
    flash.fill({ color: 0xFF8800, alpha: 0.7 });
    // Small white core
    flash.circle(noseX, noseY, 3);
    flash.fill({ color: 0xFFFFFF, alpha: 0.8 });

    flash.visible = true;
  }

  _showHitSpark() {
    const spark = this.hitSpark;
    spark.clear();
    // Spark on the body (random position on fuselage)
    const sparkX = (Math.random() - 0.5) * this.sprite.width * 0.6;
    const sparkY = (Math.random() - 0.5) * this.sprite.height * 0.4;

    // Bright yellow spark
    spark.circle(sparkX, sparkY, 10 + Math.random() * 5);
    spark.fill({ color: 0xFFEE00, alpha: 0.9 });
    spark.circle(sparkX, sparkY, 6);
    spark.fill({ color: 0xFFFFFF, alpha: 0.8 });

    spark.visible = true;
  }

  _updateFireEffect(deltaTime) {
    const fire = this.fireEffect;
    fire.clear();

    this.deathTimer += deltaTime / 60;
    const intensity = Math.min(this.deathTimer * 2, 1); // ramps up

    // Fire at engine area
    const engineX = this.sprite.width * 0.3;
    const engineY = 0;
    const size = 10 + intensity * 20;

    // Orange/red fire
    fire.circle(engineX + Math.random() * 6, engineY + Math.random() * 4, size);
    fire.fill({ color: 0xFF4400, alpha: 0.6 + intensity * 0.3 });
    fire.circle(engineX - 5 + Math.random() * 10, engineY - 3, size * 0.7);
    fire.fill({ color: 0xFFAA00, alpha: 0.5 + intensity * 0.3 });
    // Yellow core
    fire.circle(engineX, engineY, size * 0.4);
    fire.fill({ color: 0xFFDD00, alpha: 0.7 });

    // Black smoke trail behind
    const smokeX = -this.sprite.width * 0.2;
    fire.circle(smokeX + Math.random() * 10, engineY + Math.random() * 6 - 3, 8 + intensity * 12);
    fire.fill({ color: 0x222222, alpha: 0.3 + intensity * 0.3 });

    fire.visible = true;
  }

  _updateSmokeTrail(deltaTime) {
    if (!this.isDamaged || !this.isAlive) {
      this.smokeTrail.visible = false;
      return;
    }

    this.smokePhase += deltaTime * 0.05;
    const smoke = this.smokeTrail;
    smoke.clear();

    // Thin smoke puff behind the engine
    const tailX = -this.sprite.width * 0.3;
    const wobble = Math.sin(this.smokePhase) * 3;

    smoke.circle(tailX, wobble, 4 + Math.sin(this.smokePhase * 1.3) * 2);
    smoke.fill({ color: 0x888888, alpha: 0.35 });
    smoke.circle(tailX - 8, wobble + 2, 3);
    smoke.fill({ color: 0x999999, alpha: 0.25 });

    smoke.visible = true;
  }

  // ============ UPDATE ============

  update(deltaTime, canvasWidth) {
    // Dead: waiting for respawn
    if (this.state === 'dead') return;

    // Tick shoot cooldown
    if (this.shootCooldown > 0) {
      this.shootCooldown -= deltaTime / 60;
    }

    // Smoke trail for damaged planes
    this._updateSmokeTrail(deltaTime);

    // ---- DYING: crash animation with death frames ----
    if (this.state === 'dying') {
      this.deathTimer += deltaTime / 60;
      this.crashVelocityY += 0.05 * deltaTime;
      this.container.y += this.crashVelocityY * deltaTime;
      // Rotate sprite during crash
      this.sprite.rotation += (this.facingRight ? 0.02 : -0.02) * deltaTime;

      // Animate through death frames
      if (this.deathFrames.length > 0) {
        this.deathFrameElapsed += deltaTime / 60;
        if (this.deathFrameElapsed >= 0.2) { // 0.2s per frame
          this.deathFrameElapsed = 0;
          if (this.deathFrameIndex < this.deathFrames.length - 1) {
            this.deathFrameIndex++;
            this.sprite.texture = this.deathFrames[this.deathFrameIndex];
          }
        }
      }

      // Hit the ground -> dead
      if (this.container.y > GROUND_Y + 20) {
        this.state = 'dead';
        this.container.visible = false;
        this.respawnTimer = 0;
        this.fireEffect.visible = false;
      }
      return;
    }

    // ---- HIT: brief flash then back to idle ----
    if (this.state === 'hit') {
      this.hitTimer += deltaTime / 60;
      // Flash the sprite white briefly
      if (this.hitTimer < 0.1) {
        this.sprite.alpha = 0.6;
      } else {
        this.sprite.alpha = 1;
      }
      if (this.hitTimer > 0.4) {
        this.state = 'idle';
        this.hitSpark.visible = false;
        this.sprite.alpha = 1;
      }
      this._moveHorizontal(deltaTime, canvasWidth);
      return;
    }

    // ---- ATTACKING: muzzle flash then back to idle ----
    if (this.state === 'attacking') {
      this.attackTimer += deltaTime / 60;
      // Flicker the muzzle flash
      if (this.attackTimer < 0.15) {
        this.muzzleFlash.alpha = 0.7 + Math.random() * 0.3;
      } else {
        this.muzzleFlash.visible = false;
        this.state = 'idle';
      }
      this._moveHorizontal(deltaTime, canvasWidth);
      this._doBob(deltaTime);
      this._smoothRotation(deltaTime);
      return;
    }

    // ---- EVADING: dodge up/down then return ----
    if (this.state === 'evading') {
      this.evadeTimer += deltaTime / 60;
      this.container.y += this.evadeDirection * 1.5 * deltaTime;
      this._moveHorizontal(deltaTime, canvasWidth);
      this._smoothRotation(deltaTime);

      if (this.evadeTimer > 0.5) {
        this.state = 'idle';
        this.targetRotation = 0;
      }
      return;
    }

    // ---- IDLE: normal flight ----
    this._moveHorizontal(deltaTime, canvasWidth);

    // Drift back toward baseY
    const yDiff = this.baseY - this.container.y;
    if (Math.abs(yDiff) > 2) {
      this.container.y += Math.sign(yDiff) * 0.3 * deltaTime;
      // Tilt slightly based on vertical movement
      this.targetRotation = Math.sign(yDiff) * -0.08;
    } else {
      this.targetRotation = 0;
    }

    this._doBob(deltaTime);
    this._smoothRotation(deltaTime);
  }

  _moveHorizontal(deltaTime, canvasWidth) {
    const direction = this.facingRight ? 1 : -1;
    this.container.x += this.speed * direction * deltaTime;
    // Wrap around screen
    if (this.facingRight && this.container.x > canvasWidth + 60) {
      this.container.x = -60;
    } else if (!this.facingRight && this.container.x < -60) {
      this.container.x = canvasWidth + 60;
    }
  }

  _doBob(deltaTime) {
    this.bobPhase += this.bobSpeed * deltaTime;
    this.container.y += Math.sin(this.bobPhase) * this.bobAmount;
  }

  /** Smoothly interpolate sprite rotation toward target */
  _smoothRotation(deltaTime) {
    const diff = this.targetRotation - this.sprite.rotation;
    if (Math.abs(diff) > 0.005) {
      this.sprite.rotation += diff * 0.08 * deltaTime;
    }
  }
}
