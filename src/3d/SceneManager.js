import * as THREE from 'three';
import { Terrain } from './Terrain.js';
import { UnitSystem } from './UnitSystem.js';
import { AirStrikeSystem } from './AirStrikeSystem.js';
import { CameraController } from './CameraController.js';

/**
 * SceneManager — Master 3D WebGL Scene manager for the Crypto Battlefield.
 * Orchestrates Three.js rendering, lighting, terrain, armies, air strikes, and camera.
 */
export class SceneManager {
  constructor(containerElement) {
    this.container = containerElement;

    // 1. Scene & Renderer
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0f18);
    this.scene.fog = new THREE.FogExp2(0x0a0f18, 0.0035);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.container.appendChild(this.renderer.domElement);

    // 2. Camera
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(40, aspect, 1, 1000);

    // 3. Camera Controller
    this.cameraController = new CameraController(this.camera, this.renderer.domElement);

    // 4. Lighting
    this._setupLighting();

    // 5. 3D Subsystems
    this.terrain = new Terrain();
    this.scene.add(this.terrain.group);

    this.unitSystem = new UnitSystem(this.scene, this.terrain);
    this.airStrikeSystem = new AirStrikeSystem(this.scene, this.terrain, this.unitSystem);

    // 6. Clock & Loop
    this.clock = new THREE.Clock();
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);

    this._animate = this._animate.bind(this);
    this._animId = requestAnimationFrame(this._animate);
  }

  _setupLighting() {
    // Ambient / Hemisphere Sky Light
    const hemiLight = new THREE.HemisphereLight(0xfff6e5, 0x1a2636, 0.7);
    hemiLight.position.set(0, 100, 0);
    this.scene.add(hemiLight);

    // Primary Directional Sun Light
    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.4);
    sunLight.position.set(90, 140, 70);
    sunLight.castShadow = true;

    // Shadow configuration
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 400;

    const d = 130;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;

    this.scene.add(sunLight);

    // Secondary fill light for soft shadows
    const fillLight = new THREE.DirectionalLight(0x4a7c9f, 0.4);
    fillLight.position.set(-80, 60, -60);
    this.scene.add(fillLight);
  }

  // ========== LIVE MARKET DATA HANDLERS ==========

  onPriceUpdate({ price }) {
    this.terrain.setPrice(price);
  }

  onOrderBookUpdate({ buyWallTotal, sellWallTotal }) {
    if (!buyWallTotal || !sellWallTotal) return;
    const total = buyWallTotal + sellWallTotal;
    const bullRatio = buyWallTotal / total; // e.g. 0.5 is even, 0.7 means bulls dominate

    // High buy wall -> Bulls push toward Bear base (negative X, left)
    // High sell wall -> Bears push toward Bull base (positive X, right)
    const targetX = (0.5 - bullRatio) * 80;
    this.terrain.setFrontLineTarget(targetX);
  }

  onLiquidation({ side, totalUSD }) {
    this.airStrikeSystem.triggerStrike(side, totalUSD);
    const shakePower = Math.min(3.5, 0.8 + (totalUSD / 100000) * 0.8);
    this.cameraController.shake(shakePower);
  }

  recenterCamera() {
    this.cameraController.recenter();
  }

  // ========== LOOP & RESIZE ==========

  _animate() {
    this._animId = requestAnimationFrame(this._animate);

    const delta = Math.min(this.clock.getDelta(), 0.1);

    this.cameraController.update(delta);
    this.terrain.update(delta);
    this.unitSystem.update(delta, this.terrain.frontLineX);
    this.airStrikeSystem.update(delta);

    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  destroy() {
    cancelAnimationFrame(this._animId);
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
