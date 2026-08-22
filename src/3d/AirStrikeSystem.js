import * as THREE from 'three';
import { modelLoader } from './ModelLoader.js';
import { soundManager } from '../audio/SoundManager.js';

/**
 * AirStrikeSystem — Spawns authentic Rise of Nations aircraft (F-16s, MiGs, A-10s,
 * Stealth Bombers, Strategic Bombers, Attack Helicopters) flying across the 3D sky on liquidations.
 */
export class AirStrikeSystem {
  constructor(scene, terrain, unitSystem) {
    this.scene = scene;
    this.terrain = terrain;
    this.unitSystem = unitSystem;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.aircraft = [];
    this.bombs = [];
  }

  /**
   * Trigger an authentic air strike based on Binance liquidation magnitude.
   * @param {'long'|'short'} side - Liquidated side
   * @param {number} totalUSD - Dollar amount
   */
  triggerStrike(side, totalUSD = 50000) {
    const isLong = side === 'long';
    // Long liquidation -> Bears strike Bulls (flies from -X to +X)
    // Short liquidation -> Bulls strike Bears (flies from +X to -X)
    const strikerColor = isLong ? 0xd93838 : 0x22a050;
    const startX = isLong ? -140 : 140;
    const endX = isLong ? 140 : -140;
    const targetX = isLong ? (20 + Math.random() * 40) : (-20 - Math.random() * 40);
    const targetZ = (Math.random() - 0.5) * 60;
    const startZ = targetZ + (Math.random() - 0.5) * 20;
    const altitude = 24 + Math.random() * 8;

    soundManager.playLiquidation();

    if (totalUSD >= 250000) {
      // Tier 4: Heavy Stealth Bomber / Strategic Bomber Formation
      const bomberType = isLong ? 'bomber' : 'stealth';
      this._spawnAircraft(bomberType, strikerColor, startX, startZ, endX, startZ, altitude + 4, targetX, targetZ, 0.45);
      setTimeout(() => {
        this._spawnAircraft('f16', strikerColor, startX, startZ - 10, endX, startZ - 10, altitude, targetX - 6, targetZ - 10, 0.65);
        this._spawnAircraft('mig', strikerColor, startX, startZ + 10, endX, startZ + 10, altitude, targetX + 6, targetZ + 10, 0.65);
      }, 400);
    } else if (totalUSD >= 100000) {
      // Tier 3: A-10 Thunderbolt / Warthog Tank Buster Strike
      this._spawnAircraft('a10', strikerColor, startX, startZ - 6, endX, startZ - 6, altitude, targetX, targetZ - 6, 0.55);
      setTimeout(() => {
        this._spawnAircraft('a10', strikerColor, startX, startZ + 6, endX, startZ + 6, altitude + 2, targetX, targetZ + 6, 0.55);
      }, 300);
    } else if (totalUSD >= 40000) {
      // Tier 2: Attack Helicopter Strike
      this._spawnHelicopter(strikerColor, startX, startZ, endX, startZ, altitude - 8, targetX, targetZ);
    } else {
      // Tier 1: F-16 Falcon / MiG Supersonic Flyby
      const jetType = isLong ? 'mig' : 'f16';
      this._spawnAircraft(jetType, strikerColor, startX, startZ, endX, startZ, altitude, targetX, targetZ, 0.7);
    }
  }

  _spawnAircraft(type, color, startX, startZ, endX, endZ, altitude, dropX, dropZ, speed = 0.65) {
    const mesh = modelLoader.createAircraft(type, color);
    mesh.position.set(startX, altitude, startZ);
    mesh.rotation.y = startX < endX ? Math.PI / 2 : -Math.PI / 2;
    this.group.add(mesh);

    this.aircraft.push({
      type,
      mesh,
      startX, endX,
      startZ, endZ,
      dropX, dropZ,
      altitude,
      progress: 0,
      speed,
      hasDropped: false,
    });
  }

  _spawnHelicopter(color, startX, startZ, endX, endZ, altitude, dropX, dropZ) {
    const mesh = modelLoader.createHelicopter(color);
    mesh.position.set(startX, altitude, startZ);
    mesh.rotation.y = startX < endX ? Math.PI / 2 : -Math.PI / 2;
    this.group.add(mesh);

    this.aircraft.push({
      type: 'heli',
      mesh,
      startX, endX,
      startZ, endZ,
      dropX, dropZ,
      altitude,
      progress: 0,
      speed: 0.45,
      hasDropped: false,
    });
  }

  update(delta) {
    // 1. Update Aircraft Flights
    this.aircraft = this.aircraft.filter((ac) => {
      ac.progress += ac.speed * delta;
      const currentX = THREE.MathUtils.lerp(ac.startX, ac.endX, ac.progress);
      const currentZ = THREE.MathUtils.lerp(ac.startZ, ac.endZ, ac.progress);
      ac.mesh.position.set(currentX, ac.altitude, currentZ);

      // Spin helicopter rotor
      if (ac.mesh.userData.rotor) {
        ac.mesh.userData.rotor.rotation.y += 28.0 * delta;
      }

      // Check bomb drop trigger
      if (!ac.hasDropped) {
        const distToDrop = Math.abs(currentX - ac.dropX);
        if (distToDrop < 8) {
          ac.hasDropped = true;
          this._dropBomb(currentX, ac.altitude, currentZ, ac.dropX, ac.dropZ);
        }
      }

      if (ac.progress >= 1.0) {
        this.group.remove(ac.mesh);
        return false;
      }
      return true;
    });

    // 2. Update Falling Bombs
    this.bombs = this.bombs.filter((b) => {
      b.progress += b.speed * delta;
      if (b.progress >= 1.0) {
        this.group.remove(b.mesh);
        const groundY = this.terrain.getHeightAt(b.targetX, b.targetZ);
        this.unitSystem.spawnExplosion(b.targetX, groundY + 1, b.targetZ, 2.5);
        this.terrain.addCrater(b.targetX, b.targetZ, 5.5);

        // AOE damage to nearby units
        const allUnits = [...this.unitSystem.redUnits, ...this.unitSystem.greenUnits];
        allUnits.forEach((u) => {
          if (u.alive) {
            const dist = Math.hypot(u.x - b.targetX, u.z - b.targetZ);
            if (dist < 14) {
              const dmg = (1 - dist / 14) * 160;
              this.unitSystem.takeDamage(u, dmg);
            }
          }
        });
        return false;
      }

      const x = THREE.MathUtils.lerp(b.startX, b.targetX, b.progress);
      const z = THREE.MathUtils.lerp(b.startZ, b.targetZ, b.progress);
      const y = THREE.MathUtils.lerp(b.startY, this.terrain.getHeightAt(x, z), b.progress * b.progress);
      b.mesh.position.set(x, y, z);
      b.mesh.rotation.x += 4 * delta;
      return true;
    });
  }

  _dropBomb(startX, startY, startZ, targetX, targetZ) {
    const geo = new THREE.DodecahedronGeometry(0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(startX, startY, startZ);
    this.group.add(mesh);

    this.bombs.push({
      mesh,
      startX, startY, startZ,
      targetX, targetZ,
      progress: 0,
      speed: 1.8,
    });
  }
}
