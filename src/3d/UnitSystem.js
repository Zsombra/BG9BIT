import * as THREE from 'three';
import { modelLoader } from './ModelLoader.js';
import { soundManager } from '../audio/SoundManager.js';

/**
 * UnitSystem — Comprehensive military unit simulation with Multi-Stage Health Lifecycle:
 * - Healthy (100% - 60% HP): Pristine textured models, team liveries, animated firing
 * - Damaged (60% - 25% HP): Darkened/soot chassis, intermittent engine smoke trail
 * - Critical (25% - 1% HP): Violent fire licking from hull, heavy black smoke columns
 * - Destroyed Wreck (0% HP): Explosion blast, ground scorch crater decal etched into terrain,
 *   tilted charred metal wreck hull, and 25-second lingering smoke column before reinforcement respawn.
 */
export class UnitSystem {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Army units
    this.redUnits = [];   // Bears
    this.greenUnits = []; // Bulls

    // Active projectiles, explosions, smoke & fire particles, and wrecks
    this.bullets = [];
    this.shells = [];
    this.explosions = [];
    this.smokeEmitters = [];
    this.wrecks = [];

    // Projectile materials & geometries
    this.redTracerMat = new THREE.MeshBasicMaterial({ color: 0xff3355 });
    this.greenTracerMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    this.shellGeo = new THREE.SphereGeometry(0.35, 6, 4);
    this.tracerGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.2, 4);
    this.tracerGeo.rotateX(Math.PI / 2);

    this._initArmies();
  }

  _initArmies() {
    // ==========================================
    // 1. RED BEARS ARMY (Left: x < 0)
    // ==========================================
    const tankRoster = ['heavy', 'euro', 'medium', 'russian', 'asian', 'destroyer', 'light_mkiv', 'missile'];
    for (let i = 0; i < 14; i++) {
      const type = tankRoster[i % tankRoster.length];
      const col = Math.floor(i / 3);
      const row = i % 3;
      const x = -30 - col * 10 - (row * 3);
      const z = -34 + (row * 24) + (Math.random() - 0.5) * 4;
      this._spawnUnit('red', 'tank', type, x, z);
    }

    const vehRoster = ['scout', 'artillery_truck', 'armcar', 'supply'];
    for (let i = 0; i < 6; i++) {
      const type = vehRoster[i % vehRoster.length];
      const x = -50 - (i % 2) * 8;
      const z = -22 + (i * 9);
      this._spawnUnit('red', 'vehicle', type, x, z);
    }

    const artyRoster = ['cannon', 'flak', 'aa', 'sam'];
    for (let i = 0; i < 5; i++) {
      const type = artyRoster[i % artyRoster.length];
      const x = -64 - (i % 2) * 6;
      const z = -24 + (i * 12);
      this._spawnUnit('red', 'artillery', type, x, z);
    }

    const soldierRoster = ['assault', 'commando', 'marine', 'shock', 'infantry'];
    for (let i = 0; i < 50; i++) {
      const type = soldierRoster[i % soldierRoster.length];
      const col = Math.floor(i / 5);
      const row = i % 5;
      const x = -14 - (col * 3.2) - Math.random() * 2.5;
      const z = -42 + (row * 18) + (Math.random() - 0.5) * 4;
      this._spawnUnit('red', 'soldier', type, x, z);
    }

    // ==========================================
    // 2. GREEN BULLS ARMY (Right: x > 0)
    // ==========================================
    for (let i = 0; i < 14; i++) {
      const type = tankRoster[i % tankRoster.length];
      const col = Math.floor(i / 3);
      const row = i % 3;
      const x = 30 + col * 10 + (row * 3);
      const z = -34 + (row * 24) + (Math.random() - 0.5) * 4;
      this._spawnUnit('green', 'tank', type, x, z);
    }

    for (let i = 0; i < 6; i++) {
      const type = vehRoster[i % vehRoster.length];
      const x = 50 + (i % 2) * 8;
      const z = -22 + (i * 9);
      this._spawnUnit('green', 'vehicle', type, x, z);
    }

    for (let i = 0; i < 5; i++) {
      const type = artyRoster[i % artyRoster.length];
      const x = 64 + (i % 2) * 6;
      const z = -24 + (i * 12);
      this._spawnUnit('green', 'artillery', type, x, z);
    }

    for (let i = 0; i < 50; i++) {
      const type = soldierRoster[i % soldierRoster.length];
      const col = Math.floor(i / 5);
      const row = i % 5;
      const x = 14 + (col * 3.2) + Math.random() * 2.5;
      const z = -42 + (row * 18) + (Math.random() - 0.5) * 4;
      this._spawnUnit('green', 'soldier', type, x, z);
    }
  }

  _spawnUnit(side, category, type, x, z, state = 'healthy') {
    const isRed = side === 'red';
    const color = isRed ? 0xd93838 : 0x22a050;
    let mesh;

    if (category === 'tank') {
      mesh = modelLoader.createTank(type, color, state);
    } else if (category === 'vehicle') {
      mesh = modelLoader.createVehicle(type, color, state);
    } else if (category === 'artillery') {
      mesh = modelLoader.createArtillery(type, color, state);
    } else {
      mesh = modelLoader.createSoldier(type, color, state);
    }

    const y = this.terrain.getHeightAt(x, z);
    mesh.position.set(x, y, z);
    mesh.rotation.y = isRed ? Math.PI / 2 : -Math.PI / 2;
    this.group.add(mesh);

    const maxHp = category === 'tank' ? 220 : (category === 'artillery' ? 160 : (category === 'vehicle' ? 140 : 45));

    const unit = {
      side,
      category,
      type,
      mesh,
      baseX: x,
      baseZ: z,
      x, z, y,
      maxHp,
      currentHp: maxHp,
      state: 'healthy',
      shootCooldown: (category === 'soldier' ? 0.8 : 2.0) + Math.random() * 2.5,
      alive: true,
      smokeTimer: 0,
    };

    if (isRed) {
      this.redUnits.push(unit);
    } else {
      this.greenUnits.push(unit);
    }

    return unit;
  }

  takeDamage(unit, amount) {
    if (!unit.alive) return;

    unit.currentHp -= amount;
    const hpRatio = unit.currentHp / unit.maxHp;

    if (unit.currentHp <= 0) {
      this._destroyUnit(unit);
    } else if (hpRatio <= 0.25 && unit.state !== 'critical') {
      unit.state = 'critical';
      this._updateUnitMeshState(unit, 'critical');
    } else if (hpRatio <= 0.60 && unit.state === 'healthy') {
      unit.state = 'damaged';
      this._updateUnitMeshState(unit, 'damaged');
    }
  }

  _updateUnitMeshState(unit, state) {
    const isRed = unit.side === 'red';
    const color = isRed ? 0xd93838 : 0x22a050;
    const oldMesh = unit.mesh;
    const parent = oldMesh.parent;

    let newMesh;
    if (unit.category === 'tank') {
      newMesh = modelLoader.createTank(unit.type, color, state);
    } else if (unit.category === 'vehicle') {
      newMesh = modelLoader.createVehicle(unit.type, color, state);
    } else if (unit.category === 'artillery') {
      newMesh = modelLoader.createArtillery(unit.type, color, state);
    } else {
      newMesh = modelLoader.createSoldier(unit.type, color, state);
    }

    newMesh.position.copy(oldMesh.position);
    newMesh.rotation.copy(oldMesh.rotation);

    if (parent) {
      parent.remove(oldMesh);
      parent.add(newMesh);
    }
    unit.mesh = newMesh;
  }

  _destroyUnit(unit) {
    unit.alive = false;
    unit.state = 'wreck';

    // 1. Trigger explosion blast at unit position
    const scale = unit.category === 'tank' ? 1.6 : (unit.category === 'soldier' ? 0.6 : 1.2);
    this.spawnExplosion(unit.x, unit.y + 0.5, unit.z, scale);

    // 2. Etch ground scorch crater on terrain under the wreck
    this.terrain.addCrater(unit.x, unit.z, unit.category === 'tank' ? 4.5 : 2.5);

    // 3. Transform unit mesh into charred wreck
    this._updateUnitMeshState(unit, 'wreck');

    // 4. Create persistent smoke column rising from the wreck
    const wreckEmitter = {
      x: unit.x,
      y: unit.y + 0.8,
      z: unit.z,
      life: 25.0, // persists 25 seconds
      spawnRate: 0.12,
      timer: 0,
    };
    this.smokeEmitters.push(wreckEmitter);

    // 5. Track wreck and schedule Citadel reinforcement respawn after 35 seconds
    setTimeout(() => {
      // Remove wreck mesh
      if (unit.mesh && unit.mesh.parent) {
        unit.mesh.parent.remove(unit.mesh);
      }
      // Remove from army array
      if (unit.side === 'red') {
        this.redUnits = this.redUnits.filter((u) => u !== unit);
      } else {
        this.greenUnits = this.greenUnits.filter((u) => u !== unit);
      }
      // Respawn fresh unit from citadel base
      const spawnX = unit.side === 'red' ? -75 : 75;
      this._spawnUnit(unit.side, unit.category, unit.type, spawnX, unit.baseZ);
    }, 35000);
  }

  fireTracer(fromUnit, toUnit) {
    const start = new THREE.Vector3(fromUnit.mesh.position.x, fromUnit.mesh.position.y + 0.8, fromUnit.mesh.position.z);
    const target = new THREE.Vector3(
      toUnit.mesh.position.x + (Math.random() - 0.5) * 3,
      toUnit.mesh.position.y + 0.6,
      toUnit.mesh.position.z + (Math.random() - 0.5) * 3
    );

    const mat = fromUnit.side === 'red' ? this.redTracerMat : this.greenTracerMat;
    const mesh = new THREE.Mesh(this.tracerGeo, mat);
    mesh.position.copy(start);
    mesh.lookAt(target);
    this.group.add(mesh);

    this.bullets.push({
      mesh,
      start,
      target,
      targetUnit: toUnit,
      progress: 0,
      speed: 4.0 + Math.random() * 1.5,
      damage: 12 + Math.random() * 8,
    });
  }

  fireTankShell(fromUnit, targetPos, targetUnit = null) {
    const start = new THREE.Vector3(fromUnit.mesh.position.x, fromUnit.mesh.position.y + 1.3, fromUnit.mesh.position.z);
    const target = new THREE.Vector3(
      targetPos.x + (Math.random() - 0.5) * 5,
      this.terrain.getHeightAt(targetPos.x, targetPos.z),
      targetPos.z + (Math.random() - 0.5) * 5
    );

    const mat = fromUnit.side === 'red' ? this.redTracerMat : this.greenTracerMat;
    const mesh = new THREE.Mesh(this.shellGeo, mat);
    mesh.position.copy(start);
    this.group.add(mesh);

    this.spawnExplosion(start.x, start.y, start.z, 0.4);
    soundManager.playCannon();

    this.shells.push({
      mesh,
      start,
      target,
      targetUnit,
      progress: 0,
      speed: 1.6,
      arcHeight: 7.5 + Math.random() * 3.0,
      damage: 55 + Math.random() * 35,
      side: fromUnit.side,
    });
  }

  spawnExplosion(x, y, z, scale = 1.0) {
    const count = Math.floor(12 * scale);
    const particles = [];

    const mat = new THREE.MeshBasicMaterial({
      color: Math.random() > 0.3 ? 0xff5500 : 0xffcc00,
      transparent: true,
      opacity: 0.9,
    });

    for (let i = 0; i < count; i++) {
      const size = (0.2 + Math.random() * 0.4) * scale;
      const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), mat);
      mesh.position.set(x, y, z);
      this.group.add(mesh);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 6 * scale,
        (2 + Math.random() * 6) * scale,
        (Math.random() - 0.5) * 6 * scale
      );

      particles.push({ mesh, vel, life: 1.0 });
    }

    soundManager.playExplosion(scale);

    this.explosions.push({
      particles,
      mat,
      life: 1.0,
      decay: 2.2 / scale,
    });
  }

  update(delta, frontLineX) {
    const redTargetOffset = frontLineX - 8;
    const greenTargetOffset = frontLineX + 8;

    // 1. Update Red Bears Units
    this.redUnits.forEach((u) => {
      if (!u.alive) return;

      const desiredX = Math.min(redTargetOffset - (Math.abs(u.baseX) - 14) * 0.35, -8);
      const speedMult = u.state === 'critical' ? 0.4 : (u.state === 'damaged' ? 0.7 : 1.0);
      u.x += (desiredX - u.x) * 0.8 * speedMult * delta;
      u.y = this.terrain.getHeightAt(u.x, u.z);
      u.mesh.position.set(u.x, u.y, u.z);

      // Smoke emitters for damaged/critical units
      if (u.state === 'damaged' || u.state === 'critical') {
        u.smokeTimer += delta;
        if (u.smokeTimer > (u.state === 'critical' ? 0.15 : 0.4)) {
          u.smokeTimer = 0;
          this._spawnSmokeParticle(u.x, u.y + 1.0, u.z, u.state === 'critical');
        }
      }

      u.shootCooldown -= delta;
      if (u.shootCooldown <= 0) {
        u.shootCooldown = (u.category === 'tank' || u.category === 'artillery' ? 2.5 : 1.0) + Math.random() * 1.5;
        const liveTargets = this.greenUnits.filter((t) => t.alive);
        if (liveTargets.length > 0) {
          const target = liveTargets[Math.floor(Math.random() * liveTargets.length)];
          if (u.category === 'tank' || u.category === 'artillery' || u.category === 'vehicle') {
            this.fireTankShell(u, target.mesh.position, target);
          } else {
            this.fireTracer(u, target);
            soundManager.playLaser(950 + Math.random() * 250);
          }
        }
      }
    });

    // 2. Update Green Bulls Units
    this.greenUnits.forEach((u) => {
      if (!u.alive) return;

      const desiredX = Math.max(greenTargetOffset + (Math.abs(u.baseX) - 14) * 0.35, 8);
      const speedMult = u.state === 'critical' ? 0.4 : (u.state === 'damaged' ? 0.7 : 1.0);
      u.x += (desiredX - u.x) * 0.8 * speedMult * delta;
      u.y = this.terrain.getHeightAt(u.x, u.z);
      u.mesh.position.set(u.x, u.y, u.z);

      if (u.state === 'damaged' || u.state === 'critical') {
        u.smokeTimer += delta;
        if (u.smokeTimer > (u.state === 'critical' ? 0.15 : 0.4)) {
          u.smokeTimer = 0;
          this._spawnSmokeParticle(u.x, u.y + 1.0, u.z, u.state === 'critical');
        }
      }

      u.shootCooldown -= delta;
      if (u.shootCooldown <= 0) {
        u.shootCooldown = (u.category === 'tank' || u.category === 'artillery' ? 2.5 : 1.0) + Math.random() * 1.5;
        const liveTargets = this.redUnits.filter((t) => t.alive);
        if (liveTargets.length > 0) {
          const target = liveTargets[Math.floor(Math.random() * liveTargets.length)];
          if (u.category === 'tank' || u.category === 'artillery' || u.category === 'vehicle') {
            this.fireTankShell(u, target.mesh.position, target);
          } else {
            this.fireTracer(u, target);
            soundManager.playLaser(1150 + Math.random() * 250);
          }
        }
      }
    });

    // 3. Update Wreck Smoke Emitters
    this.smokeEmitters = this.smokeEmitters.filter((emitter) => {
      emitter.life -= delta;
      emitter.timer += delta;
      if (emitter.timer >= emitter.spawnRate) {
        emitter.timer = 0;
        this._spawnSmokeParticle(emitter.x, emitter.y, emitter.z, false, 1.4);
      }
      return emitter.life > 0;
    });

    // 4. Update Bullets
    this.bullets = this.bullets.filter((b) => {
      b.progress += b.speed * delta;
      if (b.progress >= 1.0) {
        this.group.remove(b.mesh);
        this.spawnExplosion(b.target.x, b.target.y, b.target.z, 0.25);
        if (b.targetUnit && b.targetUnit.alive) {
          this.takeDamage(b.targetUnit, b.damage);
        }
        return false;
      }
      b.mesh.position.lerpVectors(b.start, b.target, b.progress);
      return true;
    });

    // 5. Update Shells
    this.shells = this.shells.filter((s) => {
      s.progress += s.speed * delta;
      if (s.progress >= 1.0) {
        this.group.remove(s.mesh);
        this.spawnExplosion(s.target.x, s.target.y + 0.5, s.target.z, 1.3);
        if (s.targetUnit && s.targetUnit.alive) {
          this.takeDamage(s.targetUnit, s.damage);
        }
        return false;
      }
      const currentPos = new THREE.Vector3().lerpVectors(s.start, s.target, s.progress);
      const arc = Math.sin(s.progress * Math.PI) * s.arcHeight;
      currentPos.y += arc;
      s.mesh.position.copy(currentPos);
      return true;
    });

    // 6. Update Explosions
    this.explosions = this.explosions.filter((exp) => {
      exp.life -= exp.decay * delta;
      if (exp.life <= 0) {
        exp.particles.forEach((p) => this.group.remove(p.mesh));
        return false;
      }
      exp.mat.opacity = exp.life;
      exp.particles.forEach((p) => {
        p.mesh.position.addScaledVector(p.vel, delta);
        p.vel.y -= 9.8 * delta * 0.8;
      });
      return true;
    });
  }

  _spawnSmokeParticle(x, y, z, isFire = false, sizeMult = 1.0) {
    const size = (0.35 + Math.random() * 0.3) * sizeMult;
    const color = isFire ? (Math.random() > 0.4 ? 0xff4400 : 0x222222) : 0x1f1f1f;
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.75,
    });
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), mat);
    mesh.position.set(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6);
    this.group.add(mesh);

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 0.8,
      1.2 + Math.random() * 1.5,
      (Math.random() - 0.5) * 0.8
    );

    const particle = { mesh, vel, mat, life: 1.0, decay: 0.7 };
    this.explosions.push({
      particles: [particle],
      mat,
      life: 1.0,
      decay: 0.7,
    });
  }
}
