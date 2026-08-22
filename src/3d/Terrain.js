import * as THREE from 'three';
import { modelLoader } from './ModelLoader.js';

/**
 * Terrain — Realistic Rise of Nations 3D Battlefield & Citadel System.
 * Features:
 *   - Procedural rolling hills with tactical ridges and central trench corridor
 *   - Blended authentic RoN textures (Grass, Muddy Weathering, Rocky Cliffs)
 *   - Paved military highway connecting the Red Bear and Green Bull Citadels
 *   - Full Citadel complexes: Metropolis HQ, Fort Bunkers, Radar Stations, Hangars, Silos, Towers
 *   - Authentic 3D RoN vegetation (Pine forests, Dead battlefield stumps, Savannah groves)
 *   - Dynamic Crater System for artillery/bomb impacts
 *   - Real-time Bitcoin Spot Price demarcation laser frontline
 */
export class Terrain {
  constructor() {
    this.group = new THREE.Group();

    this.width = 240;
    this.depth = 130;
    this.baseHeight = 16;

    this.currentPrice = 63000;
    this.frontLineX = 0;
    this.targetFrontLineX = 0;

    // Active craters
    this.craters = [];
    this.maxCraters = 40;

    // Cache price tick meshes
    this.priceTicks = [];

    this._buildTerrainMesh();
    this._buildRoad();
    this._buildWater();
    this._buildCitadels();
    this._buildFoliage();
    this._buildFrontLine();
    this._buildPriceTicks();
  }

  /**
   * Sample the terrain height at any (x, z) coordinate.
   */
  getHeightAt(x, z) {
    // Edge falloff
    const edgeX = Math.abs(x) / (this.width * 0.5);
    const edgeZ = Math.abs(z) / (this.depth * 0.5);
    if (edgeX > 0.98 || edgeZ > 0.98) return -this.baseHeight;

    // Rolling hill waves with tactical defensive ridges on the flanks
    const h1 = Math.sin(x * 0.04) * Math.cos(z * 0.05) * 3.5;
    const h2 = Math.sin(x * 0.08 + 1.2) * Math.sin(z * 0.09) * 1.8;
    const h3 = Math.cos(x * 0.02 - z * 0.03) * 2.0;

    // Flatten road path in the middle (z approx 0)
    const roadDist = Math.abs(z - Math.sin(x * 0.03) * 8);
    const roadFactor = Math.min(1, roadDist / 14);

    // Lake hollows
    let lakeHollow = 0;
    const lake1Dist = Math.hypot(x - 40, z + 36);
    if (lake1Dist < 24) lakeHollow += Math.cos((lake1Dist / 24) * Math.PI * 0.5) * 4.5;

    const lake2Dist = Math.hypot(x + 48, z - 34);
    if (lake2Dist < 22) lakeHollow += Math.cos((lake2Dist / 22) * Math.PI * 0.5) * 4.0;

    return Math.max(0.5, (h1 + h2 + h3 + 3.2) * roadFactor - lakeHollow);
  }

  _buildTerrainMesh() {
    const texLoader = new THREE.TextureLoader();

    // Authentic RoN Grass texture
    const grassTex = texLoader.load('/assets/ron/textures/terrain_grass.png');
    grassTex.wrapS = THREE.RepeatWrapping;
    grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(18, 12);

    const segX = 80;
    const segZ = 50;
    const geo = new THREE.PlaneGeometry(this.width, this.depth, segX, segZ);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.getHeightAt(x, z);
      pos.setY(i, y);
    }
    geo.computeVertexNormals();

    const grassMat = new THREE.MeshStandardMaterial({
      map: grassTex,
      color: 0x98b87e,
      roughness: 0.8,
      metalness: 0.05,
      flatShading: false,
    });

    this.terrainMesh = new THREE.Mesh(geo, grassMat);
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.castShadow = true;
    this.group.add(this.terrainMesh);

    // 2. Cliff sides with authentic RoN Rock texture
    const cliffTex = texLoader.load('/assets/ron/textures/terrain_rock.png');
    cliffTex.wrapS = THREE.RepeatWrapping;
    cliffTex.wrapT = THREE.RepeatWrapping;
    cliffTex.repeat.set(16, 3);

    const cliffMat = new THREE.MeshStandardMaterial({
      map: cliffTex,
      color: 0x7a6350,
      roughness: 0.9,
      flatShading: false,
    });

    // Skirt around perimeter
    const skirtGeo = new THREE.BufferGeometry();
    const skirtVerts = [];
    const skirtUVs = [];

    // North & South edges
    for (let i = 0; i < segX; i++) {
      const x1 = -this.width / 2 + (i / segX) * this.width;
      const x2 = -this.width / 2 + ((i + 1) / segX) * this.width;
      const zS = this.depth / 2;
      const y1S = this.getHeightAt(x1, zS);
      const y2S = this.getHeightAt(x2, zS);
      const yB = -this.baseHeight;

      skirtVerts.push(x1, y1S, zS,  x1, yB, zS,   x2, y1S, zS);
      skirtVerts.push(x2, y1S, zS,  x1, yB, zS,   x2, yB, zS);

      const u1 = i / segX;
      const u2 = (i + 1) / segX;
      skirtUVs.push(u1, 1,  u1, 0,  u2, 1);
      skirtUVs.push(u2, 1,  u1, 0,  u2, 0);

      // North edge (z = -depth/2)
      const zN = -this.depth / 2;
      const y1N = this.getHeightAt(x1, zN);
      const y2N = this.getHeightAt(x2, zN);

      skirtVerts.push(x1, y1N, zN,  x2, y1N, zN,  x1, yB, zN);
      skirtVerts.push(x2, y1N, zN,  x2, yB, zN,   x1, yB, zN);

      skirtUVs.push(u1, 1,  u2, 1,  u1, 0);
      skirtUVs.push(u2, 1,  u2, 0,  u1, 0);
    }

    // West & East edges
    for (let j = 0; j < segZ; j++) {
      const z1 = -this.depth / 2 + (j / segZ) * this.depth;
      const z2 = -this.depth / 2 + ((j + 1) / segZ) * this.depth;
      const xW = -this.width / 2;
      const y1W = this.getHeightAt(xW, z1);
      const y2W = this.getHeightAt(xW, z2);
      const yB = -this.baseHeight;

      skirtVerts.push(xW, y1W, z1,  xW, y1W, z2,  xW, yB, z1);
      skirtVerts.push(xW, y1W, z2,  xW, yB, z2,   xW, yB, z1);

      const v1 = j / segZ;
      const v2 = (j + 1) / segZ;
      skirtUVs.push(v1, 1,  v2, 1,  v1, 0);
      skirtUVs.push(v2, 1,  v2, 0,  v1, 0);

      const xE = this.width / 2;
      const y1E = this.getHeightAt(xE, z1);
      const y2E = this.getHeightAt(xE, z2);

      skirtVerts.push(xE, y1E, z1,  xE, yB, z1,   xE, y1E, z2);
      skirtVerts.push(xE, y1E, z2,  xE, yB, z1,   xE, yB, z2);

      skirtUVs.push(v1, 1,  v1, 0,  v2, 1);
      skirtUVs.push(v2, 1,  v1, 0,  v2, 0);
    }

    skirtGeo.setAttribute('position', new THREE.Float32BufferAttribute(skirtVerts, 3));
    skirtGeo.setAttribute('uv', new THREE.Float32BufferAttribute(skirtUVs, 2));
    skirtGeo.computeVertexNormals();

    const skirtMesh = new THREE.Mesh(skirtGeo, cliffMat);
    skirtMesh.receiveShadow = true;
    this.group.add(skirtMesh);

    // Bottom slab plate
    const bottomGeo = new THREE.PlaneGeometry(this.width, this.depth);
    bottomGeo.rotateX(Math.PI / 2);
    const bottomMesh = new THREE.Mesh(bottomGeo, cliffMat);
    bottomMesh.position.y = -this.baseHeight;
    this.group.add(bottomMesh);
  }

  _buildRoad() {
    const texLoader = new THREE.TextureLoader();
    const roadTex = texLoader.load('/assets/ron/textures/road_late.png');
    roadTex.wrapS = THREE.RepeatWrapping;
    roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.repeat.set(18, 1);

    const points = [];
    const count = 60;
    for (let i = 0; i <= count; i++) {
      const x = -this.width * 0.48 + (i / count) * (this.width * 0.96);
      const z = Math.sin(x * 0.03) * 8 + Math.cos(x * 0.06) * 3;
      const y = this.getHeightAt(x, z) + 0.12;
      points.push(new THREE.Vector3(x, y, z));
    }

    const roadGeo = new THREE.BufferGeometry();
    const verts = [];
    const uvs = [];
    const roadWidth = 6.0;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
      const normal = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(roadWidth * 0.5);

      const v1L = new THREE.Vector3().addVectors(p1, normal);
      const v1R = new THREE.Vector3().subVectors(p1, normal);
      const v2L = new THREE.Vector3().addVectors(p2, normal);
      const v2R = new THREE.Vector3().subVectors(p2, normal);

      verts.push(v1L.x, v1L.y, v1L.z,   v1R.x, v1R.y, v1R.z,   v2L.x, v2L.y, v2L.z);
      verts.push(v2L.x, v2L.y, v2L.z,   v1R.x, v1R.y, v1R.z,   v2R.x, v2R.y, v2R.z);

      const u1 = i / (points.length - 1);
      const u2 = (i + 1) / (points.length - 1);
      uvs.push(u1, 0,  u1, 1,  u2, 0);
      uvs.push(u2, 0,  u1, 1,  u2, 1);
    }

    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeo.computeVertexNormals();

    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTex,
      color: 0xbaa48e,
      roughness: 0.85,
    });

    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    this.group.add(roadMesh);
  }

  _buildWater() {
    const texLoader = new THREE.TextureLoader();
    this.waterTex = texLoader.load('/assets/ron/textures/water_surface.png');
    this.waterTex.wrapS = THREE.RepeatWrapping;
    this.waterTex.wrapT = THREE.RepeatWrapping;
    this.waterTex.repeat.set(5, 5);

    const waterMat = new THREE.MeshStandardMaterial({
      map: this.waterTex,
      color: 0x1f7bb8,
      roughness: 0.15,
      metalness: 0.7,
      transparent: true,
      opacity: 0.88,
    });

    // Lake 1 (North-East)
    const lake1Geo = new THREE.CylinderGeometry(20, 20, 1.2, 18);
    const lake1 = new THREE.Mesh(lake1Geo, waterMat);
    lake1.position.set(40, 1.6, -36);
    lake1.receiveShadow = true;
    this.group.add(lake1);

    // Lake 2 (South-West)
    const lake2Geo = new THREE.CylinderGeometry(18, 18, 1.2, 16);
    const lake2 = new THREE.Mesh(lake2Geo, waterMat);
    lake2.position.set(-48, 1.5, 34);
    lake2.receiveShadow = true;
    this.group.add(lake2);
  }

  _buildCitadels() {
    // =======================================================
    // 1. RED BEAR CITADEL (West: x ~ -68)
    // =======================================================
    const bearX = -68;
    const bearZ = 0;
    const bearY = this.getHeightAt(bearX, bearZ);

    // Central Metropolis Capital HQ
    const bearHQ = modelLoader.createBuilding('city', 0xd93838);
    bearHQ.position.set(bearX, bearY, bearZ);
    bearHQ.rotation.y = Math.PI / 4;
    this.group.add(bearHQ);

    // Heavy Bunker Fortress
    const bearFort = modelLoader.createBuilding('fort', 0xd93838);
    bearFort.position.set(bearX + 8, this.getHeightAt(bearX + 8, bearZ - 18), bearZ - 18);
    bearFort.rotation.y = Math.PI / 6;
    this.group.add(bearFort);

    // Strategic Radar Defense Tracking Dish
    const bearRadar = modelLoader.createBuilding('radar', 0xd93838);
    bearRadar.position.set(bearX - 12, this.getHeightAt(bearX - 12, bearZ - 14), bearZ - 14);
    this.group.add(bearRadar);

    // Military Airbase & Hangar
    const bearAirbase = modelLoader.createBuilding('airbase', 0xd93838);
    bearAirbase.position.set(bearX - 14, this.getHeightAt(bearX - 14, bearZ + 18), bearZ + 18);
    bearAirbase.rotation.y = Math.PI / 3;
    this.group.add(bearAirbase);

    // Heavy Armor Foundry / Smelter
    const bearSmelter = modelLoader.createBuilding('smelter', 0xd93838);
    bearSmelter.position.set(bearX + 10, this.getHeightAt(bearX + 10, bearZ + 16), bearZ + 16);
    this.group.add(bearSmelter);

    // ICBM Nuclear Silo
    const bearSilo = modelLoader.createBuilding('silo', 0xd93838);
    bearSilo.position.set(bearX - 20, this.getHeightAt(bearX - 20, bearZ), bearZ);
    this.group.add(bearSilo);

    // Forward Defense Towers with SAM Batteries
    const bearTower1 = modelLoader.createBuilding('tower', 0xd93838);
    bearTower1.position.set(bearX + 20, this.getHeightAt(bearX + 20, bearZ - 20), bearZ - 20);
    this.group.add(bearTower1);

    const bearTower2 = modelLoader.createBuilding('tower', 0xd93838);
    bearTower2.position.set(bearX + 20, this.getHeightAt(bearX + 20, bearZ + 20), bearZ + 20);
    this.group.add(bearTower2);

    const bearSAM = modelLoader.createArtillery('sam', 0xd93838);
    bearSAM.position.set(bearX + 22, this.getHeightAt(bearX + 22, bearZ), bearZ);
    this.group.add(bearSAM);

    // Bear Banner
    const bearBanner = this._createBaseBanner('🐻 BEAR CITADEL', 0xd93838);
    bearBanner.position.set(bearX, bearY + 11, bearZ);
    this.group.add(bearBanner);

    // =======================================================
    // 2. GREEN BULL CITADEL (East: x ~ +68)
    // =======================================================
    const bullX = 68;
    const bullZ = 0;
    const bullY = this.getHeightAt(bullX, bullZ);

    // Central Metropolis Capital HQ
    const bullHQ = modelLoader.createBuilding('city', 0x22a050);
    bullHQ.position.set(bullX, bullY, bullZ);
    bullHQ.rotation.y = -Math.PI / 4;
    this.group.add(bullHQ);

    // Heavy Bunker Fortress
    const bullFort = modelLoader.createBuilding('fort', 0x22a050);
    bullFort.position.set(bullX - 8, this.getHeightAt(bullX - 8, bullZ + 18), bullZ + 18);
    bullFort.rotation.y = -Math.PI / 6;
    this.group.add(bullFort);

    // Strategic Radar Defense Tracking Dish
    const bullRadar = modelLoader.createBuilding('radar', 0x22a050);
    bullRadar.position.set(bullX + 12, this.getHeightAt(bullX + 12, bullZ + 14), bullZ + 14);
    this.group.add(bullRadar);

    // Military Airbase & Hangar
    const bullAirbase = modelLoader.createBuilding('airbase', 0x22a050);
    bullAirbase.position.set(bullX + 14, this.getHeightAt(bullX + 14, bullZ - 18), bullZ - 18);
    bullAirbase.rotation.y = -Math.PI / 3;
    this.group.add(bullAirbase);

    // Heavy Armor Foundry / Smelter
    const bullSmelter = modelLoader.createBuilding('smelter', 0x22a050);
    bullSmelter.position.set(bullX - 10, this.getHeightAt(bullX - 10, bullZ - 16), bullZ - 16);
    this.group.add(bullSmelter);

    // ICBM Nuclear Silo
    const bullSilo = modelLoader.createBuilding('silo', 0x22a050);
    bullSilo.position.set(bullX + 20, this.getHeightAt(bullX + 20, bullZ), bullZ);
    this.group.add(bullSilo);

    // Forward Defense Towers with SAM Batteries
    const bullTower1 = modelLoader.createBuilding('tower', 0x22a050);
    bullTower1.position.set(bullX - 20, this.getHeightAt(bullX - 20, bullZ - 20), bullZ - 20);
    this.group.add(bullTower1);

    const bullTower2 = modelLoader.createBuilding('tower', 0x22a050);
    bullTower2.position.set(bullX - 20, this.getHeightAt(bullX - 20, bullZ + 20), bullZ + 20);
    this.group.add(bullTower2);

    const bullSAM = modelLoader.createArtillery('sam', 0x22a050);
    bullSAM.position.set(bullX - 22, this.getHeightAt(bullX - 22, bullZ), bullZ);
    this.group.add(bullSAM);

    // Bull Banner
    const bullBanner = this._createBaseBanner('🐂 BULL CITADEL', 0x22a050);
    bullBanner.position.set(bullX, bullY + 11, bullZ);
    this.group.add(bullBanner);
  }

  _createBaseBanner(text, color) {
    const group = new THREE.Group();

    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(10, 15, 30, 0.92)';
    ctx.roundRect(4, 4, 292, 72, 8);
    ctx.fill();

    ctx.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 150, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(18, 5, 1);
    group.add(sprite);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 7, 6),
      new THREE.MeshStandardMaterial({ color: 0x334155 })
    );
    pole.position.y = -3.5;
    group.add(pole);

    return group;
  }

  _buildFoliage() {
    // 1. Mountain Ridge Pine Forests (North & South Elevated Edges)
    const pinePositions = [
      [-95, -45], [-85, -48], [-75, -50], [-60, -46], [-45, -52], [-30, -48],
      [-15, -50], [0, -52], [15, -48], [30, -50], [50, -48], [70, -52], [85, -46],
      [-95, 45], [-80, 48], [-65, 52], [-50, 48], [-35, 50], [-10, 48],
      [10, 52], [30, 48], [55, 50], [75, 46], [90, 52]
    ];
    pinePositions.forEach(([x, z]) => {
      const type = Math.random() > 0.5 ? 'pine' : 'pine2';
      const tree = modelLoader.createTree(type);
      const y = this.getHeightAt(x, z);
      tree.position.set(x, y, z);
      tree.rotation.y = Math.random() * Math.PI * 2;
      this.group.add(tree);
    });

    // 2. Dead Battlefield Stumps on Flanks & Ridge Approaches
    const deadStumpPositions = [
      [-24, -32], [-28, -22], [-22, 28], [-26, -14], [-20, 36],
      [24, -32], [28, -22], [22, 28], [26, -14], [20, 36]
    ];
    deadStumpPositions.forEach(([x, z]) => {
      const type = Math.random() > 0.5 ? 'dead' : 'dead2';
      const tree = modelLoader.createTree(type);
      const y = this.getHeightAt(x, z);
      tree.position.set(x, y, z);
      tree.rotation.y = Math.random() * Math.PI * 2;
      this.group.add(tree);
    });

    // 3. Savannah & Tropical Groves on Citadel Flanks
    const grovePositions = [
      [-65, 25], [-72, 32], [-58, -28], [-68, -35],
      [65, -25], [72, -32], [58, 28], [68, 35]
    ];
    grovePositions.forEach(([x, z]) => {
      const type = Math.random() > 0.5 ? 'savannah' : 'banyan';
      const tree = modelLoader.createTree(type);
      const y = this.getHeightAt(x, z);
      tree.position.set(x, y, z);
      tree.rotation.y = Math.random() * Math.PI * 2;
      this.group.add(tree);
    });
  }

  /**
   * Dynamically add a bomb/artillery crater scorch mark to the terrain.
   */
  addCrater(x, z, radius = 3.5) {
    const type = Math.random() > 0.5 ? 1 : 2;
    const crater = modelLoader.createCraterDecal(radius, type);
    const y = this.getHeightAt(x, z) + 0.08;
    crater.position.set(x, y, z);
    this.group.add(crater);
    this.craters.push(crater);

    if (this.craters.length > this.maxCraters) {
      const old = this.craters.shift();
      this.group.remove(old);
    }
  }

  _buildPriceTicks() {
    const steps = [-90, -70, -50, -30, -10, 10, 30, 50, 70, 90];
    const tickMat = new THREE.LineDashedMaterial({
      color: 0xffffff,
      dashSize: 2.5,
      gapSize: 1.8,
      opacity: 0.35,
      transparent: true,
    });

    steps.forEach((x) => {
      const points = [];
      for (let z = -this.depth * 0.44; z <= this.depth * 0.44; z += 4) {
        const y = this.getHeightAt(x, z) + 0.12;
        points.push(new THREE.Vector3(x, y, z));
      }
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(lineGeo, tickMat);
      line.computeLineDistances();
      this.group.add(line);

      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 40;
      const ctx = canvas.getContext('2d');
      ctx.font = 'bold 22px monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`$${this.currentPrice}`, 64, 20);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(6, 2, 1);
      sprite.position.set(x, this.getHeightAt(x, -this.depth * 0.44) + 1.5, -this.depth * 0.44);
      this.group.add(sprite);

      this.priceTicks.push({ x, sprite, canvas, ctx, texture });
    });
  }

  _buildFrontLine() {
    this.frontLineGroup = new THREE.Group();

    // 1. Glowing neon laser ribbon
    this.frontLinePoints = [];
    const count = 40;
    for (let i = 0; i <= count; i++) {
      const z = -this.depth * 0.46 + (i / count) * (this.depth * 0.92);
      const y = this.getHeightAt(0, z) + 0.35;
      this.frontLinePoints.push(new THREE.Vector3(0, y, z));
    }

    const lineGeo = new THREE.BufferGeometry().setFromPoints(this.frontLinePoints);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 3,
      transparent: true,
      opacity: 0.95,
    });
    this.frontLine = new THREE.Line(lineGeo, lineMat);
    this.frontLineGroup.add(this.frontLine);

    // 2. Center price HUD badge
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 80;
    this.priceCanvas = canvas;
    this.priceCtx = canvas.getContext('2d');
    this._renderPriceBadge(this.currentPrice);

    this.priceBadgeTex = new THREE.CanvasTexture(canvas);
    const badgeMat = new THREE.SpriteMaterial({ map: this.priceBadgeTex });
    this.priceBadge = new THREE.Sprite(badgeMat);
    this.priceBadge.scale.set(16, 5, 1);
    this.priceBadge.position.set(0, 14, 0);
    this.frontLineGroup.add(this.priceBadge);

    this.group.add(this.frontLineGroup);
  }

  _renderPriceBadge(price) {
    const ctx = this.priceCtx;
    ctx.clearRect(0, 0, 256, 80);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.roundRect(4, 4, 248, 72, 10);
    ctx.fill();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`$${price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 128, 40);
  }

  setPrice(newPrice) {
    this.currentPrice = newPrice;
    this._renderPriceBadge(newPrice);
    if (this.priceBadgeTex) this.priceBadgeTex.needsUpdate = true;
  }

  setFrontLineTarget(targetX) {
    this.targetFrontLineX = THREE.MathUtils.clamp(targetX, -90, 90);
  }

  updatePrice(newPrice, midPrice = 63000) {
    this.currentPrice = newPrice;
    this._renderPriceBadge(newPrice);
    if (this.priceBadgeTex) this.priceBadgeTex.needsUpdate = true;

    const delta = newPrice - midPrice;
    this.targetFrontLineX = (delta / 100) * 20;
    this.targetFrontLineX = THREE.MathUtils.clamp(this.targetFrontLineX, -90, 90);
  }

  update(delta) {
    // Smooth frontline interpolation
    this.frontLineX = THREE.MathUtils.lerp(this.frontLineX, this.targetFrontLineX, delta * 3);

    const pos = this.frontLine.geometry.attributes.position;
    for (let i = 0; i < this.frontLinePoints.length; i++) {
      const z = this.frontLinePoints[i].z;
      const x = this.frontLineX + Math.sin(z * 0.08) * 2.5;
      const y = this.getHeightAt(x, z) + 0.35;
      pos.setXYZ(i, x, y, z);
    }
    this.frontLine.geometry.attributes.position.needsUpdate = true;

    if (this.priceBadge) {
      const centerY = this.getHeightAt(this.frontLineX, 0);
      this.priceBadge.position.set(this.frontLineX, centerY + 12, 0);
    }
  }
}
