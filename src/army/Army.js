import { Container } from 'pixi.js';
import { Tank } from '../entities/Tank.js';
import { Soldier } from '../entities/Soldier.js';
import { Plane } from '../entities/Plane.js';
import { Explosion } from '../entities/Explosion.js';
import { Bullet } from '../entities/Bullet.js';
import { TankShell } from '../entities/TankShell.js';
import { FallingCoin } from '../entities/FallingCoin.js';
import { Paratrooper } from '../entities/Paratrooper.js';
import {
  RED_TINT, GREEN_TINT,
  TANKS_PER_ARMY, SOLDIERS_PER_ARMY, PLANES_PER_ARMY,
  GROUND_Y, CANVAS_WIDTH,
  PLANE_RESPAWN_DELAY, PLANE_BULLET_SPEED, AIR_EXPLOSION_SCALE,
  TANK_RESPAWN_DELAY, TANK_SHELL_SPEED, TANK_EXPLOSION_SCALE,
  SOLDIER_RESPAWN_DELAY, SOLDIER_EXPLOSION_SCALE,
  COIN_DROP_MIN, COIN_DROP_MAX,
} from '../constants.js';

export class Army {
  /**
   * @param {'red'|'green'} side
   * @param {Object} assets - All loaded textures from loader
   */
  constructor(side, assets) {
    this.side = side;
    this.container = new Container();
    this.tanks = [];
    this.soldiers = [];
    this.planes = [];
    this.paratroopers = [];
    this.explosions = [];
    this.bullets = [];
    this.tankShells = [];
    this.fallingCoins = [];
    this.coinTextures = assets.coinTextures || [];
    this.effectsLayer = null; // set externally for coins to render on top

    const tint = side === 'red' ? RED_TINT : GREEN_TINT;
    const facingRight = side === 'red';

    this.tint = tint;
    this.facingRight = facingRight;
    this.assets = assets;

    // Create tanks
    for (let i = 0; i < TANKS_PER_ARMY; i++) {
      const tank = new Tank(assets.tank, {
        tint,
        facingRight,
        scale: 0.325,
      });
      this.tanks.push(tank);
      this.container.addChild(tank.container);
    }

    // Create soldiers
    for (let i = 0; i < SOLDIERS_PER_ARMY; i++) {
      const soldier = new Soldier(assets.soldier, {
        tint,
        facingRight,
        scale: 0.385,
      });
      this.soldiers.push(soldier);
      this.container.addChild(soldier.container);
    }

    // Create planes (WW2 P-51 Mustang — single sprite + effect overlays)
    for (let i = 0; i < PLANES_PER_ARMY; i++) {
      const plane = new Plane(assets.airplane, {
        tint,
        facingRight,
        speed: 0.5 + Math.random() * 0.3,
        scale: 0.243,
      });
      this.planes.push(plane);
      this.container.addChild(plane.container);
    }
  }

  /**
   * Position all units in starting formation.
   */
  setFormation() {
    const startX = this.side === 'red' ? 100 : CANVAS_WIDTH - 100;
    const dir = this.side === 'red' ? 1 : -1;

    // Tanks in front row (staggered)
    this.tanks.forEach((tank, i) => {
      const x = startX + dir * i * 50;
      const y = GROUND_Y - 2 + (i % 2) * 6;
      tank.setPosition(x, y);
    });

    // Soldiers behind tanks
    this.soldiers.forEach((soldier, i) => {
      const x = startX - dir * 30 + dir * i * 30;
      const y = GROUND_Y + 2 + (i % 2) * 5;
      soldier.setPosition(x, y);
    });

    // Planes in the sky
    this.planes.forEach((plane, i) => {
      const y = 30 + i * 30;
      plane.container.position.set(
        startX + dir * i * 120,
        y,
      );
      plane.setBaseY(y);
    });
  }

  /**
   * Move army forward (toward enemy). Only alive tanks/soldiers move.
   */
  advance(deltaTime, speed) {
    const dir = this.side === 'red' ? 1 : -1;

    this.tanks.forEach((tank) => {
      if (!tank.isAlive) return;
      tank.container.x += dir * speed * deltaTime;
      tank.container.x = Math.max(20, Math.min(CANVAS_WIDTH - 20, tank.container.x));
      tank.moveForward();
    });

    this.soldiers.forEach((soldier) => {
      soldier.container.x += dir * speed * 0.8 * deltaTime;
      soldier.container.x = Math.max(20, Math.min(CANVAS_WIDTH - 20, soldier.container.x));
      soldier.walk();
    });
  }

  /**
   * Move army backward (retreating). Only alive tanks/soldiers move.
   */
  retreat(deltaTime, speed) {
    const dir = this.side === 'red' ? -1 : 1;

    this.tanks.forEach((tank) => {
      if (!tank.isAlive) return;
      tank.container.x += dir * speed * deltaTime;
      tank.container.x = Math.max(20, Math.min(CANVAS_WIDTH - 20, tank.container.x));
      tank.moveForward();
    });

    this.soldiers.forEach((soldier) => {
      soldier.container.x += dir * speed * 0.8 * deltaTime;
      soldier.container.x = Math.max(20, Math.min(CANVAS_WIDTH - 20, soldier.container.x));
      soldier.walk();
    });
  }

  /**
   * Trigger attack animations for ground units (staggered).
   * Tanks and planes are now handled by BattleDirector combat systems.
   */
  triggerAttack() {
    this.soldiers.forEach((soldier, i) => {
      setTimeout(() => soldier.triggerShoot(), i * 80);
    });
  }

  // ========== AIR COMBAT ==========

  /**
   * Fire a bullet from a plane at a target enemy plane.
   */
  fireBullet(shooter, target, bulletTexture, spread = 5) {
    const noseOffset = this.facingRight ? 30 : -30;
    const spawnX = shooter.container.x + noseOffset;
    const spawnY = shooter.container.y;

    const targetX = target.container.x + (Math.random() - 0.5) * spread * 2;
    const targetY = target.container.y + (Math.random() - 0.5) * spread * 2;

    const bullet = new Bullet(bulletTexture, {
      x: spawnX,
      y: spawnY,
      targetX,
      targetY,
      speed: PLANE_BULLET_SPEED,
      tint: this.tint,
      targetPlane: target,
    });

    this.bullets.push(bullet);
    this.container.addChild(bullet.container);
  }

  // ========== TANK COMBAT ==========

  /**
   * Fire a shell from a tank at a target enemy tank.
   */
  fireTankShell(shooter, target, shellTexture, spread = 10) {
    // Spawn from the barrel nozzle of the tank
    // Tank sprite is ~300px wide, barrel tip ~150px from center, scaled by 0.295 ≈ 44px
    // Barrel height is ~200px from bottom (at anchor), scaled ≈ 59px up
    const scale = shooter.baseScale || 0.295;
    const barrelOffset = this.facingRight ? 150 * scale : -150 * scale;
    const spawnX = shooter.container.x + barrelOffset;
    const spawnY = shooter.container.y - 200 * scale; // barrel height from ground

    // Target the body of the enemy tank with spread
    const targetX = target.container.x + (Math.random() - 0.5) * spread * 2;
    const targetY = (target.container.y - 15) + (Math.random() - 0.5) * spread;

    const shell = new TankShell(shellTexture, {
      x: spawnX,
      y: spawnY,
      targetX,
      targetY,
      speed: TANK_SHELL_SPEED,
      tint: this.tint,
      targetTank: target,
    });

    this.tankShells.push(shell);
    this.container.addChild(shell.container);
  }

  // ========== EXPLOSIONS ==========

  /**
   * Spawn an explosion at a position.
   */
  spawnExplosion(x, y, scale) {
    const frames = Math.random() > 0.5
      ? this.assets.explosion.explosion1
      : this.assets.explosion.explosion2;

    const explosion = new Explosion(frames, {
      scale: scale != null ? scale : (0.6 + Math.random() * 0.4),
    });
    explosion.container.position.set(x, y);
    this.explosions.push(explosion);
    this.container.addChild(explosion.container);
  }

  spawnAirExplosion(x, y) {
    this.spawnExplosion(x, y, AIR_EXPLOSION_SCALE);
  }

  spawnTankExplosion(x, y) {
    this.spawnExplosion(x, y, TANK_EXPLOSION_SCALE);
  }

  spawnSoldierExplosion(x, y) {
    this.spawnExplosion(x, y, SOLDIER_EXPLOSION_SCALE);
  }

  // ========== FALLING COINS ==========

  /**
   * Spawn 3-5 random crypto coin icons that rain down from a position.
   */
  spawnFallingCoins(x, y) {
    if (this.coinTextures.length === 0) return;
    let count = COIN_DROP_MIN + Math.floor(Math.random() * (COIN_DROP_MAX - COIN_DROP_MIN + 1));
    count = Math.min(count, this.coinTextures.length); // never more than available unique coins

    // Shuffle and pick unique textures (no duplicates per explosion)
    const shuffled = [...this.coinTextures].sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) {
      const coin = new FallingCoin(shuffled[i], x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 10);
      this.fallingCoins.push(coin);
      const layer = this.effectsLayer || this.container;
      layer.addChild(coin.sprite);
    }
  }

  // ========== PARATROOPERS ==========

  spawnParatrooper() {
    if (this.planes.length === 0) return;
    const plane = this.planes[Math.floor(Math.random() * this.planes.length)];
    const pt = new Paratrooper({
      tint: this.tint,
      groundY: GROUND_Y + 8,
      facingRight: this.facingRight,
      soldierTexture: this.assets.soldier.idle[0],
    });
    pt.container.position.set(plane.container.x, plane.container.y + 15);
    this.paratroopers.push(pt);
    this.container.addChild(pt.container);
  }

  // ========== UPDATE ==========

  update(deltaTime) {
    this.tanks.forEach((t) => t.update(deltaTime));
    this.soldiers.forEach((s) => s.update(deltaTime));
    this.planes.forEach((p) => p.update(deltaTime, CANVAS_WIDTH));
    this.paratroopers.forEach((pt) => pt.update(deltaTime));

    // Update plane bullets and handle hits
    this.bullets = this.bullets.filter((bullet) => {
      bullet.update(deltaTime);
      if (bullet.hit) {
        const wasAlive = bullet.targetPlane.isAlive;
        bullet.targetPlane.takeDamage(1);
        this.spawnAirExplosion(bullet.container.x, bullet.container.y);
        // Spawn falling coins when a plane is destroyed
        if (wasAlive && !bullet.targetPlane.isAlive) {
          this.spawnFallingCoins(bullet.container.x, bullet.container.y);
        }
      }
      if (bullet.done) {
        this.container.removeChild(bullet.container);
        return false;
      }
      return true;
    });

    // Update tank shells and handle hits
    this.tankShells = this.tankShells.filter((shell) => {
      shell.update(deltaTime);
      if (shell.hit) {
        shell.targetTank.takeDamage(1);
        this.spawnTankExplosion(shell.container.x, shell.container.y);
      }
      if (shell.done) {
        this.container.removeChild(shell.container);
        return false;
      }
      return true;
    });

    // Handle dead plane respawning
    this.planes.forEach((plane) => {
      if (plane.state === 'dead') {
        plane.respawnTimer += deltaTime / 60;
        if (plane.respawnTimer >= PLANE_RESPAWN_DELAY) {
          const x = this.facingRight ? -50 : CANVAS_WIDTH + 50;
          const y = 20 + Math.random() * 50;
          plane.respawn(x, y);
        }
      }
    });

    // Handle dead tank respawning
    this.tanks.forEach((tank) => {
      if (tank.state === 'dead') {
        tank.respawnTimer += deltaTime / 60;
        if (tank.respawnTimer >= TANK_RESPAWN_DELAY) {
          // Respawn at army's starting side
          const startX = this.side === 'red' ? 60 : CANVAS_WIDTH - 60;
          const y = GROUND_Y - 2 + Math.random() * 6;
          tank.respawn(startX, y);
        }
      }
    });

    // Handle dead soldier respawning
    this.soldiers.forEach((soldier) => {
      if (soldier.state === 'dead') {
        soldier.respawnTimer += deltaTime / 60;
        if (soldier.respawnTimer >= SOLDIER_RESPAWN_DELAY) {
          const startX = this.side === 'red' ? 80 : CANVAS_WIDTH - 80;
          const y = GROUND_Y + 2 + Math.random() * 5;
          soldier.respawn(startX, y);
        }
      }
    });

    // Clean up explosions
    this.explosions = this.explosions.filter((exp) => {
      exp.update(deltaTime);
      if (exp.done) {
        this.container.removeChild(exp.container);
        return false;
      }
      return true;
    });

    // Clean up falling coins
    this.fallingCoins = this.fallingCoins.filter((coin) => {
      coin.update(deltaTime);
      if (coin.done) {
        const layer = this.effectsLayer || this.container;
        layer.removeChild(coin.sprite);
        return false;
      }
      return true;
    });

    // Clean up paratroopers
    this.paratroopers = this.paratroopers.filter((pt) => {
      if (pt.shouldRemove) {
        this.container.removeChild(pt.container);
        return false;
      }
      return true;
    });
  }
}
