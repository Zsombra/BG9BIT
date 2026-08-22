import * as THREE from 'three';

const texLoader = new THREE.TextureLoader();

// Rise of Nations texture maps
const tankTexRed = texLoader.load('/assets/ron/units/hvytank.png');
const tankTexGreen = texLoader.load('/assets/ron/units/Euro_MTank.png');
const soldierTex = texLoader.load('/assets/ron/units/infantry.png');
const jetTex = texLoader.load('/assets/ron/units/jetfighter_F16.png');
const heloTex = texLoader.load('/assets/ron/units/a10.png');
const barracksTex = texLoader.load('/assets/ron/units/barracks_6.png');
const towerTex = texLoader.load('/assets/ron/units/tower_6.png');

/**
 * LowPolyBuilder — Constructs 3D models textured with authentic Rise of Nations assets.
 * Creates tanks, infantry soldiers, fighter jets, attack helicopters, trees, buildings, and watchtowers.
 */
export class LowPolyBuilder {
  /**
   * Create a tank mesh using Rise of Nations tank skins.
   * @param {number} color - Faction tint (0xd93838 for Bears, 0x22a050 for Bulls)
   */
  static createTank(color) {
    const group = new THREE.Group();
    const isRed = color === 0xd93838;
    const tankTex = isRed ? tankTexRed : tankTexGreen;

    const hullMat = new THREE.MeshStandardMaterial({
      map: tankTex,
      color: isRed ? 0xff6666 : 0x66ff88,
      roughness: 0.65,
      metalness: 0.3,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x1a202c,
      roughness: 0.8,
      flatShading: true,
    });
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x4a5568,
      roughness: 0.4,
      metalness: 0.6,
      flatShading: true,
    });

    // 1. Treads (left & right)
    const treadGeo = new THREE.BoxGeometry(0.7, 0.5, 3.2);
    const leftTread = new THREE.Mesh(treadGeo, darkMat);
    leftTread.position.set(-0.9, 0.25, 0);
    leftTread.castShadow = true;
    group.add(leftTread);

    const rightTread = new THREE.Mesh(treadGeo, darkMat);
    rightTread.position.set(0.9, 0.25, 0);
    rightTread.castShadow = true;
    group.add(rightTread);

    // 2. Main Chassis / Hull
    const hullGeo = new THREE.BoxGeometry(1.6, 0.6, 2.8);
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.set(0, 0.55, 0);
    hull.castShadow = true;
    hull.receiveShadow = true;
    group.add(hull);

    // Sloped front armor
    const slopeGeo = new THREE.CylinderGeometry(0.4, 0.8, 1.4, 4);
    slopeGeo.rotateY(Math.PI / 4);
    slopeGeo.rotateZ(Math.PI / 2);
    const slope = new THREE.Mesh(slopeGeo, hullMat);
    slope.position.set(0, 0.6, 1.3);
    group.add(slope);

    // 3. Turret (rotatable part)
    const turretGroup = new THREE.Group();
    turretGroup.position.set(0, 0.9, -0.1);

    const turretGeo = new THREE.CylinderGeometry(0.65, 0.75, 0.45, 6);
    const turret = new THREE.Mesh(turretGeo, hullMat);
    turret.castShadow = true;
    turretGroup.add(turret);

    // Hatch
    const hatchGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 6);
    const hatch = new THREE.Mesh(hatchGeo, darkMat);
    hatch.position.set(0.2, 0.25, -0.15);
    turretGroup.add(hatch);

    // Cannon Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.8, 6);
    barrelGeo.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, metalMat);
    barrel.position.set(0, 0.05, 1.1);
    barrel.castShadow = true;
    turretGroup.add(barrel);

    // Muzzle brake
    const muzzleGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.25, 6);
    muzzleGeo.rotateX(Math.PI / 2);
    const muzzle = new THREE.Mesh(muzzleGeo, darkMat);
    muzzle.position.set(0, 0.05, 2.0);
    turretGroup.add(muzzle);

    group.add(turretGroup);
    group.userData.turret = turretGroup;
    group.userData.barrel = barrel;

    return group;
  }

  /**
   * Create an infantry soldier with Rise of Nations soldier textures.
   * @param {number} color - Uniform color
   */
  static createSoldier(color) {
    const group = new THREE.Group();
    const isRed = color === 0xd93838;

    const uniformMat = new THREE.MeshStandardMaterial({
      map: soldierTex,
      color: isRed ? 0xff7777 : 0x77ff99,
      roughness: 0.75,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xdfa07a,
      roughness: 0.6,
      flatShading: true,
    });
    const helmetMat = new THREE.MeshStandardMaterial({
      color: isRed ? 0x8a2020 : 0x1b6832,
      roughness: 0.5,
      flatShading: true,
    });
    const weaponMat = new THREE.MeshStandardMaterial({
      color: 0x1a202c,
      roughness: 0.4,
      flatShading: true,
    });

    // 1. Legs
    const legGeo = new THREE.BoxGeometry(0.12, 0.4, 0.12);
    const leftLeg = new THREE.Mesh(legGeo, uniformMat);
    leftLeg.position.set(-0.08, 0.2, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, uniformMat);
    rightLeg.position.set(0.08, 0.2, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);

    // 2. Torso
    const torsoGeo = new THREE.BoxGeometry(0.32, 0.42, 0.2);
    const torso = new THREE.Mesh(torsoGeo, uniformMat);
    torso.position.set(0, 0.58, 0);
    torso.castShadow = true;
    group.add(torso);

    // 3. Head & Helmet
    const headGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.set(0, 0.86, 0);
    group.add(head);

    const helmetGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.12, 6);
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    helmet.position.set(0, 0.94, 0);
    helmet.castShadow = true;
    group.add(helmet);

    // 4. Rifle
    const rifleGeo = new THREE.BoxGeometry(0.06, 0.08, 0.65);
    const rifle = new THREE.Mesh(rifleGeo, weaponMat);
    rifle.position.set(0.16, 0.6, 0.25);
    rifle.rotation.x = -Math.PI / 12;
    rifle.castShadow = true;
    group.add(rifle);

    group.scale.set(1.2, 1.2, 1.2);
    return group;
  }

  /**
   * Create a military fighter jet with Rise of Nations F-16 skin.
   */
  static createJet(color) {
    const group = new THREE.Group();
    const isRed = color === 0xd93838;

    const bodyMat = new THREE.MeshStandardMaterial({
      map: jetTex,
      color: isRed ? 0xff7777 : 0x77ff99,
      roughness: 0.5,
      metalness: 0.35,
    });
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x112233,
      roughness: 0.1,
      metalness: 0.9,
      flatShading: true,
    });

    // Fuselage
    const fuseGeo = new THREE.ConeGeometry(0.6, 4.2, 6);
    fuseGeo.rotateX(Math.PI / 2);
    const fuse = new THREE.Mesh(fuseGeo, bodyMat);
    fuse.castShadow = true;
    group.add(fuse);

    // Delta Wings
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0.5);
    wingShape.lineTo(-2.4, -1.2);
    wingShape.lineTo(0, -1.0);
    wingShape.lineTo(2.4, -1.2);
    wingShape.closePath();

    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.08, bevelEnabled: false });
    wingGeo.rotateX(Math.PI / 2);
    const wings = new THREE.Mesh(wingGeo, bodyMat);
    wings.position.set(0, 0.05, 0);
    wings.castShadow = true;
    group.add(wings);

    // Twin Tail Fins
    const tailGeo = new THREE.BoxGeometry(0.06, 0.8, 0.7);
    const leftTail = new THREE.Mesh(tailGeo, bodyMat);
    leftTail.position.set(-0.35, 0.45, -1.4);
    leftTail.rotation.z = -0.2;
    group.add(leftTail);

    const rightTail = new THREE.Mesh(tailGeo, bodyMat);
    rightTail.position.set(0.35, 0.45, -1.4);
    rightTail.rotation.z = 0.2;
    group.add(rightTail);

    // Cockpit canopy
    const canopyGeo = new THREE.BoxGeometry(0.35, 0.3, 1.2);
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(0, 0.32, 0.4);
    group.add(canopy);

    return group;
  }

  /**
   * Create an attack helicopter with Rise of Nations textures.
   */
  static createHelicopter(color) {
    const group = new THREE.Group();
    const isRed = color === 0xd93838;

    const bodyMat = new THREE.MeshStandardMaterial({
      map: heloTex,
      color: isRed ? 0xff7777 : 0x77ff99,
      roughness: 0.5,
      metalness: 0.3,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x1a202c,
      roughness: 0.6,
      flatShading: true,
    });

    // Cabin
    const cabinGeo = new THREE.BoxGeometry(1.0, 1.1, 2.4);
    const cabin = new THREE.Mesh(cabinGeo, bodyMat);
    cabin.castShadow = true;
    group.add(cabin);

    // Tail Boom
    const tailGeo = new THREE.CylinderGeometry(0.18, 0.3, 2.6, 6);
    tailGeo.rotateX(Math.PI / 2);
    const tail = new THREE.Mesh(tailGeo, bodyMat);
    tail.position.set(0, 0.2, -2.2);
    tail.castShadow = true;
    group.add(tail);

    // Main Rotor Mast & Blades
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 6), darkMat);
    mast.position.set(0, 0.8, 0);
    group.add(mast);

    const rotorGroup = new THREE.Group();
    rotorGroup.position.set(0, 1.05, 0);

    const bladeGeo = new THREE.BoxGeometry(4.8, 0.04, 0.25);
    const blade1 = new THREE.Mesh(bladeGeo, darkMat);
    rotorGroup.add(blade1);

    const blade2 = new THREE.Mesh(bladeGeo, darkMat);
    blade2.rotation.y = Math.PI / 2;
    rotorGroup.add(blade2);

    group.add(rotorGroup);
    group.userData.rotor = rotorGroup;

    // Landing skids
    const skidGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.0, 4);
    skidGeo.rotateX(Math.PI / 2);
    const leftSkid = new THREE.Mesh(skidGeo, darkMat);
    leftSkid.position.set(-0.6, -0.65, 0);
    group.add(leftSkid);

    const rightSkid = new THREE.Mesh(skidGeo, darkMat);
    rightSkid.position.set(0.6, -0.65, 0);
    group.add(rightSkid);

    return group;
  }

  /**
   * Create military barracks / HQ textured with Rise of Nations barracks textures.
   */
  static createBaseBuilding(color, isHQ = false) {
    const group = new THREE.Group();
    const isRed = color === 0xd93838;

    const wallMat = new THREE.MeshStandardMaterial({
      map: isHQ ? barracksTex : towerTex,
      color: isRed ? 0xffcccc : 0xccffdd,
      roughness: 0.8,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: isRed ? 0x8a2020 : 0x1b6832,
      roughness: 0.6,
      flatShading: true,
    });

    if (isHQ) {
      // Large Barracks Command Center
      const main = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 5), wallMat);
      main.position.y = 1.6;
      main.castShadow = true;
      main.receiveShadow = true;
      group.add(main);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(4.8, 2.0, 4), roofMat);
      roof.position.y = 4.2;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      group.add(roof);

      // Radar dish
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.5), roofMat);
      dish.position.set(1.5, 4.8, 1.0);
      dish.rotation.x = -Math.PI / 4;
      group.add(dish);
    } else {
      // Field tent / watch outpost
      const tentGeo = new THREE.ConeGeometry(2.2, 2.2, 4);
      tentGeo.rotateY(Math.PI / 4);
      const tent = new THREE.Mesh(tentGeo, roofMat);
      tent.position.y = 1.1;
      tent.castShadow = true;
      group.add(tent);
    }

    return group;
  }

  /**
   * Create low-poly pine / deciduous trees.
   */
  static createTree(type = 'pine') {
    const group = new THREE.Group();

    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x5a3d28,
      roughness: 0.9,
      flatShading: true,
    });
    const leafMat = new THREE.MeshStandardMaterial({
      color: type === 'pine' ? 0x24582f : 0x3d7e36,
      roughness: 0.8,
      flatShading: true,
    });

    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.35, 1.4, 5);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.7;
    trunk.castShadow = true;
    group.add(trunk);

    if (type === 'pine') {
      const cone1 = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.0, 5), leafMat);
      cone1.position.y = 2.0;
      cone1.castShadow = true;
      group.add(cone1);

      const cone2 = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.7, 5), leafMat);
      cone2.position.y = 2.8;
      cone2.castShadow = true;
      group.add(cone2);

      const cone3 = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.4, 5), leafMat);
      cone3.position.y = 3.6;
      cone3.castShadow = true;
      group.add(cone3);
    } else {
      const sphere = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5, 0), leafMat);
      sphere.position.y = 2.4;
      sphere.castShadow = true;
      group.add(sphere);
    }

    const scale = 0.7 + Math.random() * 0.5;
    group.scale.set(scale, scale, scale);
    return group;
  }

  /**
   * Create sandbag barricade.
   */
  static createSandbag() {
    const group = new THREE.Group();
    const bagMat = new THREE.MeshStandardMaterial({
      color: 0xc4a482,
      roughness: 0.9,
      flatShading: true,
    });

    for (let r = 0; r < 2; r++) {
      for (let c = -1; c <= 1; c++) {
        const bag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.4), bagMat);
        bag.position.set(c * 0.85 + (r % 2) * 0.4, r * 0.32 + 0.18, 0);
        bag.castShadow = true;
        group.add(bag);
      }
    }
    return group;
  }
}
