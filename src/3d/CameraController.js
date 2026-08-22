import * as THREE from 'three';

/**
 * CameraController — Isometric 3D camera controller for the battlefield.
 * Supports:
 *   - Mouse drag panning
 *   - Scroll wheel zoom
 *   - WASD / Arrow key panning
 *   - Screen shake for explosions / heavy artillery
 *   - Smooth recenter glide
 */
export class CameraController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    // Target look-at center
    this.target = new THREE.Vector3(0, 4, 0);
    this.targetPan = new THREE.Vector3(0, 4, 0);

    // Isometric spherical offset - tuned so both Citadels fit nicely in view
    this.zoom = 155;
    this.targetZoom = 155;
    this.minZoom = 50;
    this.maxZoom = 260;

    this.elevation = Math.PI * 0.28; // ~50 degrees tilt
    this.azimuth = Math.PI * 0.25;   // ~45 degrees isometric angle

    // Interaction state
    this.isDragging = false;
    this.prevMouse = { x: 0, y: 0 };
    this.keys = {};

    // Screen shake
    this.shakeIntensity = 0;

    this._initEvents();
    this._updateCameraPosition(true);
  }

  _initEvents() {
    // Mouse drag on window
    window.addEventListener('mousedown', (e) => {
      if (e.target && (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.closest('.hud-feed') || e.target.closest('.hud-depth'))) {
        return;
      }
      this.isDragging = true;
      this.dragButton = e.button;
      this.prevMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.prevMouse.x;
      const dy = e.clientY - this.prevMouse.y;
      this.prevMouse = { x: e.clientX, y: e.clientY };

      if (this.dragButton === 2) {
        // Orbit on right-click drag
        this.azimuth -= dx * 0.006;
        this.elevation = Math.max(0.18, Math.min(Math.PI * 0.44, this.elevation + dy * 0.005));
      } else {
        // Pan on left-click drag
        const panSpeed = (this.zoom / 135) * 0.28;
        const forward = new THREE.Vector3(-Math.sin(this.azimuth), 0, -Math.cos(this.azimuth));
        const right = new THREE.Vector3(Math.cos(this.azimuth), 0, -Math.sin(this.azimuth));

        this.targetPan.addScaledVector(right, -dx * panSpeed);
        this.targetPan.addScaledVector(forward, dy * panSpeed);

        this.targetPan.x = Math.max(-100, Math.min(100, this.targetPan.x));
        this.targetPan.z = Math.max(-60, Math.min(60, this.targetPan.z));
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // Prevent context menu
    window.addEventListener('contextmenu', (e) => {
      if (!e.target || !e.target.closest('button')) e.preventDefault();
    });

    // Scroll zoom
    window.addEventListener('wheel', (e) => {
      if (e.target && e.target.closest('.hud-feed')) return; // let feed scroll
      const zoomFactor = e.deltaY * 0.08;
      this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom + zoomFactor));
    }, { passive: true });

    // Keyboard keys (WASD / Arrows / KeyCodes)
    window.addEventListener('keydown', (e) => {
      if (e.key) this.keys[e.key.toLowerCase()] = true;
      if (e.code) this.keys[e.code.toLowerCase()] = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.key) this.keys[e.key.toLowerCase()] = false;
      if (e.code) this.keys[e.code.toLowerCase()] = false;
    });
  }

  shake(intensity = 1.0) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  recenter() {
    this.targetPan.set(0, 4, 0);
    this.targetZoom = 135;
    this.azimuth = Math.PI * 0.25;
    this.elevation = Math.PI * 0.28;
  }

  update(delta) {
    // 1. Process Keyboard Panning
    const keySpeed = (this.zoom / 150) * 45 * delta;
    const forward = new THREE.Vector3(-Math.sin(this.azimuth), 0, -Math.cos(this.azimuth));
    const right = new THREE.Vector3(Math.cos(this.azimuth), 0, -Math.sin(this.azimuth));

    if (this.keys['w'] || this.keys['arrowup']) this.targetPan.addScaledVector(forward, keySpeed);
    if (this.keys['s'] || this.keys['arrowdown']) this.targetPan.addScaledVector(forward, -keySpeed);
    if (this.keys['d'] || this.keys['arrowright']) this.targetPan.addScaledVector(right, keySpeed);
    if (this.keys['a'] || this.keys['arrowleft']) this.targetPan.addScaledVector(right, -keySpeed);

    this.targetPan.x = Math.max(-100, Math.min(100, this.targetPan.x));
    this.targetPan.z = Math.max(-60, Math.min(60, this.targetPan.z));

    // 2. Smooth Interpolation (Lerp)
    this.target.lerp(this.targetPan, 6.0 * delta);
    this.zoom += (this.targetZoom - this.zoom) * 8.0 * delta;

    this._updateCameraPosition();

    // 3. Screen shake decay
    if (this.shakeIntensity > 0.05) {
      const sx = (Math.random() - 0.5) * this.shakeIntensity * 0.8;
      const sy = (Math.random() - 0.5) * this.shakeIntensity * 0.8;
      const sz = (Math.random() - 0.5) * this.shakeIntensity * 0.8;
      this.camera.position.add(new THREE.Vector3(sx, sy, sz));
      this.shakeIntensity -= 6.0 * delta;
      if (this.shakeIntensity < 0.05) this.shakeIntensity = 0;
    }
  }

  _updateCameraPosition(instant = false) {
    const r = this.zoom;
    const phi = this.elevation;
    const theta = this.azimuth;

    const x = this.target.x + r * Math.cos(phi) * Math.sin(theta);
    const y = this.target.y + r * Math.sin(phi);
    const z = this.target.z + r * Math.cos(phi) * Math.cos(theta);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }
}
