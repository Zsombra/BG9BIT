import * as THREE from 'three';

/**
 * ModelLoader — Manages the full library of Rise of Nations 3D assets:
 * - Military Armor (Tanks, Tank Destroyers, Missile Carriers, Armored Cars, Artillery)
 * - Aircraft (F-16s, MiGs, A-10 Warthogs, Stealth Bombers, Attack Helis)
 * - Infantry & Squads (Assault Infantry, Commandos, Marines, Shock Troops)
 * - Base Citadels & Buildings (Metropolis HQ, Heavy Fortresses, Radar Dishes, Towers, Hangars)
 * - Environmental Props (Pine trees, Dead battlefield stumps, Savannah acacias, Banyans)
 * - Destruction Stages (Healthy, Damaged, Critical Burning, Wreck Hull, Ground Craters)
 */
export class ModelLoader {
  constructor() {
    this.bufferLoader = new THREE.BufferGeometryLoader();
    this.texLoader = new THREE.TextureLoader();

    this.geometries = {};
    this.textures = {};
    this.isLoaded = false;
  }

  async loadAll() {
    const modelKeys = [
      // Tanks & Armor
      'hvytank', 'euro_mtank', 'lighttank', 'lighttank_mkiv', 'mediumtank',
      'mediumtank_russian', 'mediumtank_asian', 'tankdestroyer', 'antitankmissile',
      // Vehicles & Recon
      'armoredscoutcar', 'armcar', 'truck', 'artillery_truck', 'supplytruck',
      // Artillery & AA
      'artillery_cannon', 'airdefensegun', 'aagun', 'flakgun', 'sam',
      // Aircraft & Helis
      'jetfighter_f16', 'jetfighter_mig', 'jetfighter_mirage', 'a10',
      'stealthbomber', 'jetfighterbomber', 'stratbomber_backfire', 'advfighter',
      'helicopter', 'helicopter_blade',
      // Soldiers
      'assault_infantry', 'infantry', 'commando', 'assaultmarine1', 'shockinfantry',
      // Citadels & Buildings
      'city_6z', 'city_6az', 'fort_6z', 'tower_6z', 'airbase_6z', 'barracks_6z',
      'smelter_6z', 'radardefensegun', 'nukesilo_z', 'oilwell_5z', 'refinery_6z', 'university_6z',
      // Trees & Environmental Props
      'tree_pine1', 'tree_pine2', 'tree_dead1', 'tree_dead2',
      'tree_savannah1', 'tree_savannah2', 'tree_banyan1', 'tree_banyan2',
      // Debris & VFX
      'debris', 'explosion', 'bullet'
    ];

    const textureKeys = [
      // Units
      'hvytank', 'euro_mtank', 'lighttank', 'lighttank_mkiv', 'mediumtank',
      'mediumtank_russian', 'mediumtank_asian', 'tankdestroyer',
      'armoredscoutcar', 'armcar', 'truck', 'artillery_cannon', 'airdefensegun', 'aagun', 'flakgun', 'sam',
      'jetfighter_f16', 'jetfighter_mig', 'a10', 'jetfighterbomber', 'stratbomber_backfire', 'advfighter',
      'helicopter_blade', 'nuclearmissile',
      'assault_infantry', 'infantry', 'commando', 'shockinfantry',
      // Buildings
      'city_6', 'city_6a', 'fort_6', 'tower_6', 'airbase_6', 'barracks_6', 'smelter_6', 'radardefensegun', 'nukesilo', 'oilwell_5', 'refinery_6', 'university_6',
      // Terrain, Roads & Nature
      'terrain_grass', 'terrain_grass_savannah', 'terrain_dirt', 'terrain_mud', 'terrain_rock', 'terrain_sand',
      'road_late', 'road_early', 'water_surface', 'water_river',
      'tree_jungle_bark', 'tree_jungle_leaf', 'tree_tropical_bark', 'tree_tropical_top',
      // Craters & FX
      'crater_scorch1', 'crater_scorch2', 'debris_smoke', 'dirt_debris', 'debris1', 'scorch_nuke1', 'scorch_nuke2', 'missile_smoke', 'nukeflame'
    ];

    // Load Textures
    for (const key of textureKeys) {
      try {
        const tex = this.texLoader.load(`/assets/ron/textures/${key}.png`);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        this.textures[key] = tex;
      } catch (e) { /* skip */ }
    }

    // Load BufferGeometries
    const promises = modelKeys.map(async (key) => {
      try {
        const res = await fetch(`/assets/ron/models/${key}.json?v=${Date.now()}`);
        if (res.ok) {
          const json = await res.json();
          const geo = this.bufferLoader.parse(json);
          geo.computeVertexNormals();
          this.geometries[key] = geo;
        }
      } catch (e) { /* skip */ }
    });

    await Promise.all(promises);
    this.isLoaded = true;
    console.log(`ModelLoader: Loaded ${Object.keys(this.geometries).length} 3D models & ${Object.keys(this.textures).length} textures.`);
  }

  async reloadGeometry(geoKey) {
    try {
      const res = await fetch(`/assets/ron/models/${geoKey}.json?v=${Date.now()}`);
      if (res.ok) {
        const json = await res.json();
        const geo = this.bufferLoader.parse(json);
        geo.computeVertexNormals();
        this.geometries[geoKey] = geo;
      }
    } catch (e) { /* skip */ }
  }



  /**
   * Helper to build a standard mesh with unit livery and material state.
   */
  _makeMesh(geoKey, texKey, color, scale, fallbackGeo, state = 'healthy') {
    const group = new THREE.Group();
    const geo = this.geometries[geoKey] || fallbackGeo;
    const tex = this.textures[texKey];

    let matColor = new THREE.Color(color);
    let roughness = 0.55;
    let metalness = 0.25;

    if (state === 'damaged') {
      matColor.multiplyScalar(0.7); // Darkened from combat soot
      roughness = 0.7;
    } else if (state === 'critical') {
      matColor.multiplyScalar(0.4); // Heavily charred & scorched
      roughness = 0.85;
      metalness = 0.1;
    } else if (state === 'wreck') {
      matColor.setHex(0x1a1815); // Blackened burned-out metal hull
      roughness = 0.95;
      metalness = 0.05;
    }

    const mat = new THREE.MeshStandardMaterial({
      map: tex || null,
      color: matColor,
      roughness,
      metalness,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.set(scale, scale, scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // If wreck, slightly tilt or damage the chassis
    if (state === 'wreck') {
      mesh.rotation.z = (Math.random() - 0.5) * 0.25;
      mesh.rotation.x = (Math.random() - 0.5) * 0.2;
      mesh.position.y = -0.15; // slightly sunken into mud
    }

    group.add(mesh);
    group.userData.mainMesh = mesh;
    return group;
  }

  _getTint(color) {
    if (color === 0xd93838) return 0xffcccc;
    if (color === 0x22a050) return 0xccffdd;
    if (color === 0x8c7355) return 0xf2d6b3;
    return color;
  }

  // ==========================================================
  // MILITARY VEHICLES & ARMOR FACTORIES
  // ==========================================================

  createTank(type = 'heavy', color = 0xd93838, state = 'healthy') {
    const tint = this._getTint(color);
    const configs = {
      heavy:     { geo: 'hvytank',             tex: 'hvytank',             scale: 0.045 },
      euro:      { geo: 'euro_mtank',          tex: 'euro_mtank',          scale: 0.048 },
      light:     { geo: 'lighttank',           tex: 'lighttank',           scale: 0.042 },
      light_mkiv:{ geo: 'lighttank_mkiv',      tex: 'lighttank_mkiv',      scale: 0.045 },
      medium:    { geo: 'mediumtank',          tex: 'mediumtank',          scale: 0.042 },
      russian:   { geo: 'mediumtank_russian',  tex: 'mediumtank_russian',  scale: 0.042 },
      asian:     { geo: 'mediumtank_asian',    tex: 'mediumtank_asian',    scale: 0.042 },
      destroyer: { geo: 'tankdestroyer',       tex: 'tankdestroyer',       scale: 0.042 },
      missile:   { geo: 'antitankmissile',     tex: 'hvytank',             scale: 0.095 },
    };
    const c = configs[type] || configs.heavy;
    return this._makeMesh(c.geo, c.tex, tint, c.scale, new THREE.BoxGeometry(2, 1, 3), state);
  }

  createVehicle(type = 'scout', color = 0xd93838, state = 'healthy') {
    const tint = this._getTint(color);
    const configs = {
      scout:          { geo: 'armoredscoutcar', tex: 'armoredscoutcar', scale: 0.048 },
      armcar:         { geo: 'armcar',          tex: 'armcar',          scale: 0.042 },
      truck:          { geo: 'truck',           tex: 'truck',           scale: 0.048 },
      artillery_truck:{ geo: 'artillery_truck', tex: 'truck',           scale: 0.048 },
      supply:         { geo: 'supplytruck',     tex: 'truck',           scale: 0.045 },
    };
    const c = configs[type] || configs.scout;
    return this._makeMesh(c.geo, c.tex, tint, c.scale, new THREE.BoxGeometry(1.5, 1, 2.5), state);
  }

  createArtillery(type = 'cannon', color = 0xd93838, state = 'healthy') {
    const tint = this._getTint(color);
    const configs = {
      cannon:     { geo: 'artillery_cannon', tex: 'artillery_cannon', scale: 0.048 },
      aa:         { geo: 'aagun',            tex: 'aagun',            scale: 0.048 },
      airdefense: { geo: 'airdefensegun',    tex: 'airdefensegun',    scale: 0.048 },
      flak:       { geo: 'flakgun',          tex: 'flakgun',          scale: 0.048 },
      sam:        { geo: 'sam',              tex: 'sam',              scale: 0.048 },
    };
    const c = configs[type] || configs.cannon;
    return this._makeMesh(c.geo, c.tex, tint, c.scale, new THREE.BoxGeometry(1.5, 1, 2), state);
  }

  createSoldier(type = 'infantry', color = 0xd93838, state = 'healthy') {
    const tint = this._getTint(color);
    const configs = {
      infantry:  { geo: 'infantry',         tex: 'infantry',         scale: 0.065 },
      assault:   { geo: 'assault_infantry', tex: 'assault_infantry', scale: 0.065 },
      commando:  { geo: 'commando',         tex: 'commando',         scale: 0.058 },
      marine:    { geo: 'assaultmarine1',   tex: 'infantry',         scale: 0.058 },
      shock:     { geo: 'shockinfantry',    tex: 'shockinfantry',    scale: 0.068 },
    };
    const c = configs[type] || configs.infantry;
    const group = this._makeMesh(c.geo, c.tex, tint, c.scale, new THREE.BoxGeometry(0.5, 1.2, 0.5), state);

    // If soldier died, rotate flat on ground
    if (state === 'wreck') {
      const mesh = group.userData.mainMesh;
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = 0.1;
    }
    return group;
  }

  createAircraft(type = 'f16', color = 0xd93838) {
    const tint = this._getTint(color);
    const configs = {
      f16:        { geo: 'jetfighter_f16',      tex: 'jetfighter_f16',      scale: 0.058 },
      mig:        { geo: 'jetfighter_mig',      tex: 'jetfighter_mig',      scale: 0.058 },
      mirage:     { geo: 'jetfighter_mirage',   tex: 'jetfighter_mig',      scale: 0.058 },
      a10:        { geo: 'a10',                 tex: 'a10',                 scale: 0.062 },
      stealth:    { geo: 'stealthbomber',       tex: 'jetfighterbomber',    scale: 0.065 },
      bomber:     { geo: 'stratbomber_backfire',tex: 'stratbomber_backfire',scale: 0.065 },
      advfighter: { geo: 'advfighter',          tex: 'advfighter',          scale: 0.058 },
    };
    const c = configs[type] || configs.f16;
    return this._makeMesh(c.geo, c.tex, tint, c.scale, new THREE.ConeGeometry(1, 4, 6));
  }

  createHelicopter(color = 0xd93838) {
    const tint = this._getTint(color);
    const group = new THREE.Group();

    const bodyGeo = this.geometries['helicopter'] || new THREE.BoxGeometry(1, 1, 2.5);
    const bladeGeo = this.geometries['helicopter_blade'] || new THREE.BoxGeometry(4, 0.05, 0.2);

    const bodyMat = new THREE.MeshStandardMaterial({
      map: this.textures['a10'] || null,
      color: tint,
      roughness: 0.5,
      metalness: 0.25,
      side: THREE.DoubleSide,
    });

    const bladeMat = new THREE.MeshStandardMaterial({
      map: this.textures['helicopter_blade'] || null,
      color: 0x222222,
      roughness: 0.6,
      side: THREE.DoubleSide
    });

    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.scale.set(0.052, 0.052, 0.052);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);

    const rotor = new THREE.Mesh(bladeGeo, bladeMat);
    rotor.scale.set(0.052, 0.052, 0.052);
    rotor.position.y = 1.25;
    group.add(rotor);
    group.userData.rotor = rotor;

    return group;
  }

  // ==========================================================
  // CITADELS & BASE BUILDINGS FACTORIES
  // ==========================================================

  createBuilding(type = 'city', color = 0xd93838) {
    const isRed = color === 0xd93838;
    const tint = isRed ? 0xffe0e0 : 0xe0ffea;
    const configs = {
      city:     { geo: isRed ? 'city_6z' : 'city_6az', tex: isRed ? 'city_6' : 'city_6a', scale: 0.075 },
      fort:     { geo: 'fort_6z',                      tex: 'fort_6',                      scale: 0.070 },
      tower:    { geo: 'tower_6z',                     tex: 'tower_6',                     scale: 0.065 },
      airbase:  { geo: 'airbase_6z',                   tex: 'airbase_6',                   scale: 0.075 },
      barracks: { geo: 'barracks_6z',                  tex: 'barracks_6',                  scale: 0.065 },
      smelter:  { geo: 'smelter_6z',                   tex: 'smelter_6',                   scale: 0.070 },
      radar:    { geo: 'radardefensegun',              tex: 'radardefensegun',              scale: 0.065 },
      silo:     { geo: 'nukesilo_z',                   tex: 'nukesilo',                    scale: 0.080 },
      oilwell:  { geo: 'oilwell_5z',                   tex: 'oilwell_5',                   scale: 0.065 },
      refinery: { geo: 'refinery_6z',                  tex: 'refinery_6',                  scale: 0.070 },
    };
    const c = configs[type] || configs.city;
    return this._makeMesh(c.geo, c.tex, tint, c.scale, new THREE.BoxGeometry(4, 3, 4));
  }

  // ==========================================================
  // NATURE, TREES & CRATERS FACTORIES
  // ==========================================================

  createTree(type = 'pine') {
    const group = new THREE.Group();

    if (type === 'dead' || type === 'dead2') {
      // 3D Scorched battlefield dead tree trunk with jagged branches
      const trunkMat = new THREE.MeshStandardMaterial({
        map: this.textures['tree_jungle_bark'] || this.textures['terrain_dirt'],
        color: 0x544234,
        roughness: 0.85,
        metalness: 0.1,
      });
      const trunkGeo = new THREE.CylinderGeometry(0.25, 0.5, 4.0, 7);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 2.0;
      trunk.castShadow = true;
      group.add(trunk);

      // Jagged dead branches
      const branchGeo = new THREE.CylinderGeometry(0.08, 0.14, 1.8, 5);
      const b1 = new THREE.Mesh(branchGeo, trunkMat);
      b1.position.set(0.4, 2.6, 0.2);
      b1.rotation.z = Math.PI / 3;
      group.add(b1);

      const b2 = new THREE.Mesh(branchGeo, trunkMat);
      b2.position.set(-0.35, 2.2, -0.25);
      b2.rotation.z = -Math.PI / 3.5;
      b2.rotation.y = Math.PI / 4;
      group.add(b2);

    } else if (type === 'savannah' || type === 'banyan') {
      // 3D Acacia / Tropical canopy tree
      const trunkMat = new THREE.MeshStandardMaterial({
        map: this.textures['tree_tropical_bark'] || this.textures['tree_jungle_bark'],
        color: 0x3d3024,
        roughness: 0.9,
      });
      const leafMat = new THREE.MeshStandardMaterial({
        map: this.textures['tree_tropical_top'] || this.textures['tree_jungle_leaf'],
        color: 0x486b32,
        roughness: 0.75,
      });

      const trunkGeo = new THREE.CylinderGeometry(0.3, 0.6, 4.2, 6);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 2.1;
      trunk.castShadow = true;
      group.add(trunk);

      // Umbrella canopy
      const canopyGeo = new THREE.CylinderGeometry(2.8, 1.2, 1.2, 8);
      const canopy = new THREE.Mesh(canopyGeo, leafMat);
      canopy.position.y = 4.4;
      canopy.castShadow = true;
      group.add(canopy);

    } else {
      // 3D Alpine Conifer Pine
      const trunkMat = new THREE.MeshStandardMaterial({
        map: this.textures['tree_jungle_bark'] || this.textures['terrain_dirt'],
        color: 0x332418,
        roughness: 0.9,
      });
      const pineMat = new THREE.MeshStandardMaterial({
        map: this.textures['terrain_grass'] || null,
        color: 0x224c2b,
        roughness: 0.75,
      });

      const trunkGeo = new THREE.CylinderGeometry(0.2, 0.4, 2.0, 6);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1.0;
      trunk.castShadow = true;
      group.add(trunk);

      // 3 layered pine cones
      const c1 = new THREE.Mesh(new THREE.ConeGeometry(2.0, 2.5, 7), pineMat);
      c1.position.y = 2.4;
      c1.castShadow = true;
      group.add(c1);

      const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.2, 7), pineMat);
      c2.position.y = 3.6;
      c2.castShadow = true;
      group.add(c2);

      const c3 = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.8, 7), pineMat);
      c3.position.y = 4.8;
      c3.castShadow = true;
      group.add(c3);
    }

    return group;
  }

  createCraterDecal(radius = 3.5, type = 1) {
    const tex = this.textures[type === 1 ? 'crater_scorch1' : 'crater_scorch2'] || this.textures['crater_scorch1'];
    const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.random() * Math.PI * 2;
    return mesh;
  }
}

export const modelLoader = new ModelLoader();
