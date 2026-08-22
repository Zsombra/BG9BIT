import {
  CANVAS_WIDTH, GROUND_Y,
  PLANE_SHOOT_COOLDOWN, PLANE_SHOOT_COOLDOWN_WINNING,
  TANK_SHOOT_COOLDOWN, TANK_SHOOT_COOLDOWN_WINNING,
  SOLDIER_SHOOT_COOLDOWN, SOLDIER_SHOOT_COOLDOWN_WINNING,
  SOLDIER_HIT_CHANCE, SOLDIER_HIT_CHANCE_WINNING,
} from '../constants.js';
import { soundManager } from '../audio/SoundManager.js';

/**
 * The brain of the battle.
 * Translates price data into army commands (advance, retreat, attack).
 * Orchestrates air combat and tank combat with screen shake.
 */
export class BattleDirector {
  constructor(redArmy, greenArmy, config = {}) {
    this.redArmy = redArmy;
    this.greenArmy = greenArmy;
    this.baseSpeed = config.baseSpeed || 0.4;
    this.bulletTexture = config.bulletTexture || null;
    this.stage = config.stage || null; // for screen shake
    this.battlefield = config.battlefield || null;

    // Current battle state
    this.currentDirection = null;
    this.intensity = 0;

    // Timers
    this.explosionTimer = 0;
    this.explosionInterval = 2;

    // Screen shake
    this.shakeIntensity = 0;
    this.shakeDecay = 8; // how fast shake fades

    // Market data state
    this.buyWallTotal = 0;
    this.sellWallTotal = 0;
    this.marketPressure = 'contested';
    this.lastLiquidation = null;
  }

  /**
   * Handle order book summary update from PriceFeed.
   * Adjusts battle intensity based on buy/sell wall imbalance.
   */
  onOrderBookUpdate({ buyWallTotal, sellWallTotal, pressure }) {
    this.buyWallTotal = buyWallTotal;
    this.sellWallTotal = sellWallTotal;
    this.marketPressure = pressure;

    // Shift front line position
    if (this.battlefield && buyWallTotal && sellWallTotal) {
      const total = buyWallTotal + sellWallTotal;
      const bullRatio = buyWallTotal / total;
      // High buy ratio -> bulls push toward bear base (left, smaller x)
      const targetX = CANVAS_WIDTH * (1 - bullRatio);
      this.battlefield.setFrontLinePosition(targetX);
    }

    // Stronger buy wall = green advances, stronger sell wall = red advances
    const ratio = buyWallTotal / (sellWallTotal || 1);
    if (ratio > 1.15) {
      this.currentDirection = 'up';
      this.intensity = Math.min((ratio - 1) * 2, 1);
    } else if (ratio < 0.85) {
      this.currentDirection = 'down';
      this.intensity = Math.min((1 / ratio - 1) * 2, 1);
    }
    // If contested, let the price feed drive direction
  }

  /**
   * Handle a liquidation event.
   * Triggers tiered battle effects based on USD size.
   */
  onLiquidation({ side, totalUSD, price }) {
    this.lastLiquidation = { side, totalUSD, price, timestamp: Date.now() };

    // Determine which army gets hit
    // Liquidated LONG = bulls lose (price went down, longs got rekt)
    // Liquidated SHORT = bears lose (price went up, shorts got rekt)
    const hitArmy = side === 'long' ? this.greenArmy : this.redArmy;
    const winArmy = side === 'long' ? this.redArmy : this.greenArmy;

    // Tier 1: Small liquidation (< $50K) — small explosion
    if (totalUSD < 50_000) {
      // Spawn a small explosion near the front line
      this._spawnBattleExplosion();
      return;
    }

    // Tier 2: Medium liquidation ($50K - $150K) — strong attack burst
    if (totalUSD < 150_000) {
      winArmy.triggerAttack();
      this._spawnBattleExplosion();
      this._spawnBattleExplosion();
      this.shake(2.5);
      return;
    }

    // Tier 3: Large liquidation ($150K - $500K) — heavy assault
    if (totalUSD < 500_000) {
      winArmy.triggerAttack();
      for (let i = 0; i < 4; i++) {
        setTimeout(() => this._spawnBattleExplosion(), i * 200);
      }
      this.shake(4.0);

      // Burst fire from all winning units
      winArmy.planes.forEach((p) => { if (p.isAlive) p.shootCooldown = 0; });
      winArmy.tanks.forEach((t) => { if (t.isAlive) t.shootCooldown = 0; });
      winArmy.soldiers.forEach((s) => { if (s.isAlive) s.shootCooldown = 0; });
      return;
    }

    // Tier 4: Massive liquidation (> $500K) — bombardment
    winArmy.triggerAttack();
    for (let i = 0; i < 8; i++) {
      setTimeout(() => this._spawnBattleExplosion(), i * 150);
    }
    this.shake(6.0);

    // Sustained burst fire
    winArmy.planes.forEach((p) => { if (p.isAlive) p.shootCooldown = 0; });
    winArmy.tanks.forEach((t) => { if (t.isAlive) t.shootCooldown = 0; });
    winArmy.soldiers.forEach((s) => { if (s.isAlive) s.shootCooldown = 0; });

    // Spawn paratrooper for dramatic effect
    winArmy.spawnParatrooper();
  }

  /**
   * Trigger screen shake effect.
   * @param {number} intensity - shake strength in pixels
   */
  shake(intensity = 2) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  onPriceUpdate({ direction, magnitude }) {
    this.currentDirection = direction;
    this.intensity = magnitude;

    // Winning side soldiers attack
    if (direction === 'down') {
      this.redArmy.triggerAttack();
    } else {
      this.greenArmy.triggerAttack();
    }

    // Winning side planes get burst fire
    const winningArmy = direction === 'down' ? this.redArmy : this.greenArmy;
    winningArmy.planes.forEach((plane) => {
      if (plane.isAlive && plane.shootCooldown > 0.3) {
        plane.shootCooldown = 0.3;
      }
    });

    // Winning side tanks get burst fire
    winningArmy.tanks.forEach((tank) => {
      if (tank.isAlive && tank.shootCooldown > 0.5) {
        tank.shootCooldown = 0.5;
      }
    });

    // Winning side soldiers get burst fire
    winningArmy.soldiers.forEach((soldier) => {
      if (soldier.isAlive && soldier.shootCooldown > 0.3) {
        soldier.shootCooldown = 0.3;
      }
    });
  }

  update(deltaTime) {
    // ---- Screen shake ----
    if (this.stage && this.shakeIntensity > 0.1) {
      this.stage.x = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.stage.y = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.shakeIntensity -= this.shakeDecay * (deltaTime / 60);
      if (this.shakeIntensity <= 0.1) {
        this.shakeIntensity = 0;
        this.stage.x = 0;
        this.stage.y = 0;
      }
    }

    if (!this.currentDirection) {
      this._updateAirCombat(deltaTime);
      this._updateTankCombat(deltaTime);
      this._updateSoldierCombat(deltaTime);
      this.redArmy.update(deltaTime);
      this.greenArmy.update(deltaTime);
      return;
    }

    const speed = this.baseSpeed * (0.3 + this.intensity * 0.7);

    if (this.currentDirection === 'down') {
      this.redArmy.advance(deltaTime, speed);
      this.greenArmy.retreat(deltaTime, speed * 0.4);
    } else {
      this.greenArmy.advance(deltaTime, speed);
      this.redArmy.retreat(deltaTime, speed * 0.4);
    }

    // Combat systems
    this._updateAirCombat(deltaTime);
    this._updateTankCombat(deltaTime);
    this._updateSoldierCombat(deltaTime);

    // Spawn ambient explosions
    this.explosionTimer += deltaTime / 60;
    if (this.explosionTimer >= this.explosionInterval) {
      this.explosionTimer = 0;
      this._spawnBattleExplosion();
    }

    // Update all units
    this.redArmy.update(deltaTime);
    this.greenArmy.update(deltaTime);
  }

  // ========== AIR COMBAT ==========

  _updateAirCombat(deltaTime) {
    if (!this.bulletTexture) return;
    this._processArmyAirCombat(this.redArmy, this.greenArmy, deltaTime);
    this._processArmyAirCombat(this.greenArmy, this.redArmy, deltaTime);
  }

  _processArmyAirCombat(army, enemyArmy, deltaTime) {
    const isWinning =
      (this.currentDirection === 'down' && army.side === 'red') ||
      (this.currentDirection === 'up' && army.side === 'green');

    const baseCooldown = isWinning ? PLANE_SHOOT_COOLDOWN_WINNING : PLANE_SHOOT_COOLDOWN;
    const baseSpread = isWinning ? 3 : 8;

    const enemyPlanes = enemyArmy.planes.filter((p) => p.isAlive);
    if (enemyPlanes.length === 0) return;

    army.planes.forEach((plane) => {
      if (!plane.isAlive) return;
      if (plane.shootCooldown > 0) return;

      // 10% chance to skip (repositioning)
      if (Math.random() < 0.1) {
        plane.shootCooldown = 0.2 + Math.random() * 0.4;
        return;
      }

      const target = enemyPlanes[Math.floor(Math.random() * enemyPlanes.length)];
      const shotSpread = baseSpread * (0.5 + Math.random() * 1.0);

      plane.attack();
      army.fireBullet(plane, target, this.bulletTexture, shotSpread);
      soundManager.playLaser(1100 + Math.random() * 300);

      // Scattered cooldowns
      plane.shootCooldown = baseCooldown * (0.6 + Math.random() * 0.8);

      if (!isWinning && Math.random() < 0.3) {
        setTimeout(() => {
          if (plane.isAlive) plane.evade();
        }, 200 + Math.random() * 300);
      }
    });
  }

  // ========== TANK COMBAT ==========

  _updateTankCombat(deltaTime) {
    if (!this.bulletTexture) return;
    this._processArmyTankCombat(this.redArmy, this.greenArmy, deltaTime);
    this._processArmyTankCombat(this.greenArmy, this.redArmy, deltaTime);
  }

  _processArmyTankCombat(army, enemyArmy, deltaTime) {
    const isWinning =
      (this.currentDirection === 'down' && army.side === 'red') ||
      (this.currentDirection === 'up' && army.side === 'green');

    const baseCooldown = isWinning ? TANK_SHOOT_COOLDOWN_WINNING : TANK_SHOOT_COOLDOWN;
    const baseSpread = isWinning ? 5 : 15;

    const enemyTanks = enemyArmy.tanks.filter((t) => t.isAlive);
    if (enemyTanks.length === 0) return;

    army.tanks.forEach((tank) => {
      if (!tank.isAlive) return;
      if (tank.shootCooldown > 0) return;

      // 15% chance to skip this cycle (hesitation — more realistic)
      if (Math.random() < 0.15) {
        tank.shootCooldown = 0.3 + Math.random() * 0.5; // brief pause then retry
        return;
      }

      const target = enemyTanks[Math.floor(Math.random() * enemyTanks.length)];

      // Each tank gets its own spread variation (some shots wilder than others)
      const shotSpread = baseSpread * (0.5 + Math.random() * 1.0);

      // Play attack animation (includes recoil + muzzle flash)
      tank.attack();

      // Fire shell
      army.fireTankShell(tank, target, this.bulletTexture, shotSpread);
      soundManager.playCannon();

      // Subtle screen shake
      this.shake(1.0);

      // Scattered cooldowns — wide range so tanks don't sync up
      tank.shootCooldown = baseCooldown * (0.6 + Math.random() * 0.8);
    });
  }

  // ========== SOLDIER COMBAT ==========

  _updateSoldierCombat(deltaTime) {
    this._processArmySoldierCombat(this.redArmy, this.greenArmy, deltaTime);
    this._processArmySoldierCombat(this.greenArmy, this.redArmy, deltaTime);
  }

  _processArmySoldierCombat(army, enemyArmy, deltaTime) {
    const isWinning =
      (this.currentDirection === 'down' && army.side === 'red') ||
      (this.currentDirection === 'up' && army.side === 'green');

    const baseCooldown = isWinning ? SOLDIER_SHOOT_COOLDOWN_WINNING : SOLDIER_SHOOT_COOLDOWN;
    const hitChance = isWinning ? SOLDIER_HIT_CHANCE_WINNING : SOLDIER_HIT_CHANCE;

    const enemySoldiers = enemyArmy.soldiers.filter((s) => s.isAlive);

    army.soldiers.forEach((soldier) => {
      if (!soldier.isAlive) return;
      if (soldier.shootCooldown > 0) return;

      // 10% hesitation chance
      if (Math.random() < 0.10) {
        soldier.shootCooldown = 0.2 + Math.random() * 0.4;
        return;
      }

      // Tactical behavior: prone soldiers should go prone between shots
      if (soldier.tacticalRole === 'prone' && !soldier.isProne && soldier.state === 'idle') {
        soldier.goProne();
        soldier.tacticalTimer = 0;
      }

      // Trigger shoot animation
      const didShoot = soldier.triggerShoot();
      if (!didShoot) return;
      soundManager.playLaser(750 + Math.random() * 250);

      // Implied hit: chance-based damage on random enemy soldier
      if (enemySoldiers.length > 0 && Math.random() < hitChance) {
        const target = enemySoldiers[Math.floor(Math.random() * enemySoldiers.length)];
        // Delayed hit to simulate bullet travel time
        setTimeout(() => {
          if (target.isAlive) {
            target.takeDamage(1);
            // Spawn small explosion on death
            if (!target.isAlive) {
              enemyArmy.spawnSoldierExplosion(
                target.container.x,
                target.container.y - 10
              );
              this.shake(0.5);
              soundManager.playExplosion(0.5);
            }
          }
        }, 150 + Math.random() * 200);
      }

      // Staggered cooldowns
      soldier.shootCooldown = baseCooldown * (0.6 + Math.random() * 0.6);

      // Rusher behavior: after shooting, sprint for a bit
      if (soldier.tacticalRole === 'rusher') {
        setTimeout(() => {
          if (soldier.isAlive && soldier.state === 'idle') {
            soldier.sprint();
            // Stop sprinting after a bit
            setTimeout(() => {
              if (soldier.isAlive && soldier.state === 'sprint') {
                soldier.idle();
              }
            }, 600 + Math.random() * 400);
          }
        }, 300 + Math.random() * 200);
      }

      // Kneeler: after prone phase, get back up
      if (soldier.tacticalRole === 'kneeler' && soldier.tacticalPhase === 'prone_after_shoot') {
        setTimeout(() => {
          if (soldier.isAlive && soldier.isProne) {
            soldier.idle(); // _standUp is called inside idle()
            soldier.tacticalPhase = 'idle';
          }
        }, 800 + Math.random() * 600);
      }

      // Prone soldier: get up occasionally to reposition
      if (soldier.tacticalRole === 'prone' && soldier.isProne && soldier.tacticalTimer > 3) {
        setTimeout(() => {
          if (soldier.isAlive && soldier.isProne) {
            soldier.walk();
            soldier.tacticalTimer = 0;
            // Go prone again after walking a bit
            setTimeout(() => {
              if (soldier.isAlive && soldier.state === 'walk') {
                soldier.goProne();
              }
            }, 1000 + Math.random() * 800);
          }
        }, 200);
      }
    });
  }

  // ========== GROUND EXPLOSIONS ==========

  _spawnBattleExplosion() {
    const redFront = this.redArmy.tanks.reduce(
      (max, t) => t.isAlive ? Math.max(max, t.container.x) : max, 0
    );
    const greenFront = this.greenArmy.tanks.reduce(
      (min, t) => t.isAlive ? Math.min(min, t.container.x) : min, CANVAS_WIDTH
    );
    const midX = (redFront + greenFront) / 2;

    const x = midX + (Math.random() - 0.5) * 80;
    const y = GROUND_Y - 10 - Math.random() * 30;

    if (this.currentDirection === 'down') {
      this.greenArmy.spawnExplosion(x, y);
    } else {
      this.redArmy.spawnExplosion(x, y);
    }

    // Subtle shake on ground explosions
    this.shake(0.8);
    soundManager.playExplosion(0.7);
  }
}
