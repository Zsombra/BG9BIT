import { Container, Sprite } from 'pixi.js';
import { SOLDIER_MAX_HP, GROUND_Y } from '../constants.js';

/**
 * WW2 tactical soldier with full ground combat:
 * States: idle, walk, sprint, shootFront, shootUp (kneeling), prone, hit, dying, dead
 * Tactical roles: rusher, kneeler, prone — assigned randomly on spawn.
 * Sprite faces LEFT natively.
 */
export class Soldier {
  constructor(textures, options = {}) {
    this.container = new Container();

    this.sprite = new Sprite(textures.idle[0]);
    this.sprite.anchor.set(0.5, 1); // Bottom-center for ground placement
    this.container.addChild(this.sprite);

    // Soldier sprite faces LEFT natively
    const scale = options.scale || 0.35;
    this.facingRight = options.facingRight || false;
    this.baseScale = scale;
    this.container.scale.set(
      this.facingRight ? -scale : scale,
      scale
    );

    if (options.tint) {
      this.sprite.tint = options.tint;
    }

    this.textures = textures;
    this.currentFrames = textures.idle;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.frameRate = 0.1;
    this.state = 'idle';
    this.looping = true;

    // Combat
    this.hp = SOLDIER_MAX_HP;
    this.shootCooldown = Math.random() * 2.5; // stagger initial shots
    this.hitTimer = 0;
    this.respawnTimer = 0;
    this.baseX = 0;
    this.baseY = 0;

    // Tactical role
    this.tacticalRole = this._randomRole();
    this.tacticalTimer = 0;       // timer for current tactical behavior phase
    this.tacticalPhase = 'idle';  // sub-phase within role behavior

    // Prone visual
    this.isProne = false;

    // Death
    this.deathTimer = 0;
  }

  _randomRole() {
    const r = Math.random();
    if (r < 0.30) return 'rusher';
    if (r < 0.65) return 'kneeler';
    return 'prone';
  }

  setPosition(x, y) {
    this.container.position.set(x, y);
    this.baseX = x;
    this.baseY = y;
  }

  get isAlive() {
    return this.state !== 'dying' && this.state !== 'dead';
  }

  // ========== STATE TRANSITIONS ==========

  shootFront() {
    if (!this.isAlive || this.state === 'shootFront') return false;
    this._standUp(); // ensure not prone
    this.state = 'shootFront';
    this.currentFrames = this.textures.shoot;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.frameRate = 0.07;
    this.looping = false;
    return true;
  }

  shootUp() {
    if (!this.isAlive || this.state === 'shootUp') return false;
    this._standUp();
    this.state = 'shootUp';
    this.currentFrames = this.textures.shootUp;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.frameRate = 0.06;
    this.looping = false;
    return true;
  }

  walk() {
    if (!this.isAlive || this.state === 'walk') return;
    this._standUp();
    this.state = 'walk';
    this.currentFrames = this.textures.walk;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.frameRate = 0.1;
    this.looping = true;
  }

  sprint() {
    if (!this.isAlive || this.state === 'sprint') return;
    this._standUp();
    this.state = 'sprint';
    this.currentFrames = this.textures.walk;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.frameRate = 0.065; // faster animation for sprint
    this.looping = true;
  }

  idle() {
    if (!this.isAlive || this.state === 'idle') return;
    this._standUp();
    this.state = 'idle';
    this.currentFrames = this.textures.idle;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.looping = true;
  }

  goProne() {
    if (!this.isAlive || this.isProne) return;
    this.state = 'prone';
    this.isProne = true;
    this.currentFrames = this.textures.idle;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.looping = true;
    // Squash sprite vertically to simulate lying down
    this.container.scale.set(
      this.facingRight ? -this.baseScale : this.baseScale,
      this.baseScale * 0.45
    );
    // Shift Y slightly so feet stay on ground
    this.container.y = this.baseY + 2;
  }

  _standUp() {
    if (!this.isProne) return;
    this.isProne = false;
    this.container.scale.set(
      this.facingRight ? -this.baseScale : this.baseScale,
      this.baseScale
    );
    this.container.y = this.baseY;
  }

  // ========== COMBAT ==========

  /**
   * Trigger the appropriate shoot animation based on tactical role.
   * Returns true if the soldier actually shot.
   */
  triggerShoot() {
    if (!this.isAlive) return false;
    if (this.tacticalRole === 'kneeler') {
      return this.shootUp();
    }
    // Prone soldiers shoot from the ground (still use shootFront anim)
    if (this.isProne) {
      this.state = 'shootFront';
      this.currentFrames = this.textures.shoot;
      this.frameIndex = 0;
      this.elapsed = 0;
      this.frameRate = 0.07;
      this.looping = false;
      return true;
    }
    return this.shootFront();
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
    this._standUp();
    this.state = 'hit';
    this.currentFrames = this.textures.idle;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.hitTimer = 0;
  }

  _startDying() {
    this._standUp();
    this.state = 'dying';
    this.currentFrames = this.textures.idle;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.deathTimer = 0;
    // Start rotation for fall-over effect
    this.container.rotation = 0;
  }

  respawn(x, y) {
    this.hp = SOLDIER_MAX_HP;
    this.state = 'idle';
    this.isProne = false;
    this.currentFrames = this.textures.idle;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.looping = true;
    this.container.position.set(x, y);
    this.baseX = x;
    this.baseY = y;
    this.container.visible = true;
    this.sprite.alpha = 1;
    this.container.rotation = 0;
    this.container.scale.set(
      this.facingRight ? -this.baseScale : this.baseScale,
      this.baseScale
    );
    this.deathTimer = 0;
    this.respawnTimer = 0;
    this.hitTimer = 0;
    this.shootCooldown = 1.0 + Math.random() * 1.0; // brief cooldown after respawn
    this.tacticalRole = this._randomRole();
    this.tacticalTimer = 0;
    this.tacticalPhase = 'idle';
  }

  // ========== UPDATE ==========

  update(deltaTime) {
    if (this.state === 'dead') return;

    // Tick shoot cooldown
    if (this.shootCooldown > 0) {
      this.shootCooldown -= deltaTime / 60;
    }

    // Tick tactical timer
    this.tacticalTimer += deltaTime / 60;

    // ---- DYING: rotate and fall over ----
    if (this.state === 'dying') {
      this.deathTimer += deltaTime / 60;
      // Rotate to fall sideways (toward facing direction)
      const fallDir = this.facingRight ? 1 : -1;
      const targetRotation = fallDir * (Math.PI / 2);
      const progress = Math.min(this.deathTimer / 0.5, 1);
      this.container.rotation = targetRotation * progress;
      // Slight slide down
      this.container.y += 0.5 * deltaTime;

      if (this.deathTimer >= 0.6) {
        this.state = 'dead';
        this.container.visible = false;
        this.respawnTimer = 0;
      }
      return;
    }

    // ---- HIT: brief flash ----
    if (this.state === 'hit') {
      this.hitTimer += deltaTime / 60;
      this.sprite.alpha = Math.sin(this.hitTimer * 30) > 0 ? 1 : 0.4;
      if (this.hitTimer > 0.3) {
        this.sprite.alpha = 1;
        this.state = 'idle';
        this.currentFrames = this.textures.idle;
        this.frameIndex = 0;
      }
      return;
    }

    // ---- PRONE: hold position, wait ----
    if (this.state === 'prone') {
      // Prone soldiers just hold; BattleDirector will trigger their shooting
      return;
    }

    // ---- Animation ----
    this._animateFrames(deltaTime);
  }

  _animateFrames(deltaTime) {
    if (this.currentFrames.length <= 1) return;

    this.elapsed += deltaTime / 60;
    if (this.elapsed >= this.frameRate) {
      this.elapsed = 0;
      this.frameIndex++;

      if (this.frameIndex >= this.currentFrames.length) {
        if (!this.looping) {
          // Non-looping animation complete
          this._onAnimationComplete();
          return;
        }
        this.frameIndex = 0;
      }

      this.sprite.texture = this.currentFrames[this.frameIndex];
    }
  }

  _onAnimationComplete() {
    // After shooting, transition based on role
    if (this.state === 'shootFront' || this.state === 'shootUp') {
      if (this.tacticalRole === 'kneeler') {
        // Kneeler: after shootUp, briefly go prone
        this.goProne();
        this.tacticalTimer = 0;
        this.tacticalPhase = 'prone_after_shoot';
      } else if (this.tacticalRole === 'prone' && this.isProne) {
        // Stay prone after shooting from prone
        this.state = 'prone';
      } else {
        // Rusher or default: go back to idle
        this.idle();
      }
      return;
    }

    // Default: return to walk
    this.walk();
  }
}
