import * as THREE from 'three';
import { modelLoader } from '../3d/ModelLoader.js';

/**
 * AssetStudio — Isolated 3D inspection studio for individual vehicles, armor, artillery,
 * aircraft, and infantry models. Features 360 turntable pedestal, 3-point studio lighting,
 * liveries, state toggles (Pristine, Damaged, Wreck), and part inspection.
 */
export class AssetStudio {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e17);

    // Camera
    this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(0, 3.5, 9);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Canvas Element styling
    this.renderer.domElement.id = 'studio-canvas';
    this.renderer.domElement.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 150;
      display: none;
      width: 100vw;
      height: 100vh;
    `;
    document.body.appendChild(this.renderer.domElement);

    // Interaction state
    this.currentModelKey = 'hvytank';
    this.currentType = 'heavy';
    this.currentCategory = 'tank';
    this.currentColor = 0xd93838;
    this.currentState = 'healthy';
    this.isAutoRotate = true;
    this.isWireframe = false;
    this.currentMeshGroup = null;

    // Orbit controls state
    this.isDragging = false;
    this.prevMouse = { x: 0, y: 0 };
    this.spherical = { radius: 9, phi: Math.PI * 0.35, theta: 0 };

    this._setupStudioEnvironment();
    this._setupLights();
    this._setupControls();
    this._createStudioUI();

    this.active = false;
  }

  _setupStudioEnvironment() {
    // 1. Studio Turntable Pedestal
    const pedestalGeo = new THREE.CylinderGeometry(4.0, 4.5, 0.4, 48);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x131a28,
      roughness: 0.35,
      metalness: 0.65,
    });
    this.pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    this.pedestal.position.y = -0.2;
    this.pedestal.receiveShadow = true;
    this.scene.add(this.pedestal);

    // Glowing rim ring
    const ringGeo = new THREE.TorusGeometry(4.0, 0.04, 16, 64);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.01;
    this.scene.add(ring);

    // Subtle floor grid
    const grid = new THREE.GridHelper(30, 30, 0x38bdf8, 0x172133);
    grid.position.y = -0.21;
    this.scene.add(grid);
  }

  _setupLights() {
    // Ambient fill
    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambient);

    // Key Light (warm directional with shadows)
    const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.8);
    keyLight.position.set(8, 12, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.bias = -0.0001;
    this.scene.add(keyLight);

    // Fill Light (cool blue tint)
    const fillLight = new THREE.DirectionalLight(0x88ccff, 1.0);
    fillLight.position.set(-10, 6, -8);
    this.scene.add(fillLight);

    // Rim Light (back-highlight for silhouette definition)
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
    rimLight.position.set(0, 10, -12);
    this.scene.add(rimLight);
  }

  _setupControls() {
    const el = this.renderer.domElement;

    el.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.prevMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging || !this.active) return;
      const dx = e.clientX - this.prevMouse.x;
      const dy = e.clientY - this.prevMouse.y;
      this.prevMouse = { x: e.clientX, y: e.clientY };

      this.spherical.theta -= dx * 0.008;
      this.spherical.phi = Math.max(0.1, Math.min(Math.PI * 0.48, this.spherical.phi - dy * 0.008));
      this._updateCamera();
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.spherical.radius = Math.max(3, Math.min(22, this.spherical.radius + e.deltaY * 0.01));
      this._updateCamera();
    }, { passive: false });

    window.addEventListener('resize', () => {
      if (!this.active) return;
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  _updateCamera() {
    const { radius, phi, theta } = this.spherical;
    this.camera.position.x = radius * Math.sin(phi) * Math.sin(theta);
    this.camera.position.y = radius * Math.cos(phi) + 1.0;
    this.camera.position.z = radius * Math.sin(phi) * Math.cos(theta);
    this.camera.lookAt(0, 1.0, 0);
  }

  _createStudioUI() {
    this.uiContainer = document.createElement('div');
    this.uiContainer.id = 'studio-ui';
    this.uiContainer.style.cssText = `
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 200;
      display: none;
      font-family: 'Rajdhani', sans-serif;
    `;

    // Left Panel: Model Catalog Selector
    const leftPanel = document.createElement('div');
    leftPanel.style.cssText = `
      position: absolute;
      left: 20px;
      top: 70px;
      bottom: 20px;
      width: 320px;
      background: rgba(15, 23, 42, 0.94);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 12px;
      backdrop-filter: blur(12px);
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      pointer-events: auto;
      overflow-y: auto;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    `;

    leftPanel.innerHTML = `
      <div style="font-family: 'Orbitron', monospace; font-size: 16px; font-weight: 700; color: #38bdf8; letter-spacing: 2px; border-bottom: 1px solid rgba(56,189,248,0.2); padding-bottom: 8px;">
        🔬 3D ASSET INSPECTOR
      </div>

      <div style="font-size: 12px; color: #94a3b8; line-height: 1.4;">
        Select an asset below to inspect authentic 3D geometry, textures, liveries, and destruction stages.
      </div>

      <div style="display: flex; gap: 4px; flex-wrap: wrap;" id="studio-category-tabs">
        <button data-cat="tanks" style="flex: 1 1 30%; padding: 6px 4px; font-size: 11px; font-weight: 700; border-radius: 6px; border: 1px solid #38bdf8; background: rgba(56,189,248,0.2); color: #fff; cursor: pointer;">TANKS</button>
        <button data-cat="vehicles" style="flex: 1 1 30%; padding: 6px 4px; font-size: 11px; font-weight: 700; border-radius: 6px; border: 1px solid rgba(56,189,248,0.3); background: rgba(15,23,42,0.6); color: #94a3b8; cursor: pointer;">VEHICLES</button>
        <button data-cat="artillery" style="flex: 1 1 30%; padding: 6px 4px; font-size: 11px; font-weight: 700; border-radius: 6px; border: 1px solid rgba(56,189,248,0.3); background: rgba(15,23,42,0.6); color: #94a3b8; cursor: pointer;">ARTILLERY</button>
        <button data-cat="aircraft" style="flex: 1 1 45%; padding: 6px 4px; font-size: 11px; font-weight: 700; border-radius: 6px; border: 1px solid rgba(56,189,248,0.3); background: rgba(15,23,42,0.6); color: #94a3b8; cursor: pointer;">AIRCRAFT</button>
        <button data-cat="soldiers" style="flex: 1 1 45%; padding: 6px 4px; font-size: 11px; font-weight: 700; border-radius: 6px; border: 1px solid rgba(56,189,248,0.3); background: rgba(15,23,42,0.6); color: #94a3b8; cursor: pointer;">SOLDIERS</button>
      </div>

      <div id="studio-model-list" style="display: flex; flex-direction: column; gap: 6px; overflow-y: auto; max-height: calc(100vh - 280px); padding-right: 4px;">
      </div>
    `;

    // Right Panel: Inspection Controls & Stats
    const rightPanel = document.createElement('div');
    rightPanel.style.cssText = `
      position: absolute;
      right: 20px;
      top: 70px;
      width: 290px;
      background: rgba(15, 23, 42, 0.94);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 12px;
      backdrop-filter: blur(12px);
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      pointer-events: auto;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    `;

    rightPanel.innerHTML = `
      <div style="font-family: 'Orbitron', monospace; font-size: 14px; font-weight: 700; color: #38bdf8; letter-spacing: 1px; border-bottom: 1px solid rgba(56,189,248,0.2); padding-bottom: 6px;">
        ⚙️ INSPECTION CONTROLS
      </div>

      <div>
        <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 4px;">FACTION LIVERY</label>
        <div style="display: flex; gap: 6px;">
          <button id="btn-color-red" style="flex: 1; padding: 6px; font-size: 12px; font-weight: 700; background: #d93838; color: #fff; border: 1px solid #ff6666; border-radius: 6px; cursor: pointer;">BEAR (RED)</button>
          <button id="btn-color-green" style="flex: 1; padding: 6px; font-size: 12px; font-weight: 700; background: #22a050; color: #fff; border: 1px solid #44ff88; border-radius: 6px; cursor: pointer;">BULL (GREEN)</button>
          <button id="btn-color-desert" style="flex: 1; padding: 6px; font-size: 12px; font-weight: 700; background: #8c7355; color: #fff; border: 1px solid #baa48e; border-radius: 6px; cursor: pointer;">DESERT</button>
        </div>
      </div>

      <div>
        <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 4px;">DAMAGE STAGE</label>
        <div style="display: flex; gap: 4px;">
          <button id="btn-state-healthy" style="flex: 1; padding: 6px 2px; font-size: 11px; font-weight: 600; background: rgba(56,189,248,0.2); color: #38bdf8; border: 1px solid #38bdf8; border-radius: 4px; cursor: pointer;">PRISTINE</button>
          <button id="btn-state-damaged" style="flex: 1; padding: 6px 2px; font-size: 11px; font-weight: 600; background: rgba(15,23,42,0.6); color: #94a3b8; border: 1px solid rgba(56,189,248,0.2); border-radius: 4px; cursor: pointer;">DAMAGED</button>
          <button id="btn-state-critical" style="flex: 1; padding: 6px 2px; font-size: 11px; font-weight: 600; background: rgba(15,23,42,0.6); color: #94a3b8; border: 1px solid rgba(56,189,248,0.2); border-radius: 4px; cursor: pointer;">BURNING</button>
          <button id="btn-state-wreck" style="flex: 1; padding: 6px 2px; font-size: 11px; font-weight: 600; background: rgba(15,23,42,0.6); color: #94a3b8; border: 1px solid rgba(56,189,248,0.2); border-radius: 4px; cursor: pointer;">WRECK</button>
        </div>
      </div>

      <div>
        <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 4px;">VIEW OPTIONS</label>
        <div style="display: flex; gap: 8px;">
          <button id="btn-toggle-rotate" style="flex: 1; padding: 6px; font-size: 12px; background: rgba(56,189,248,0.15); color: #fff; border: 1px solid rgba(56,189,248,0.3); border-radius: 6px; cursor: pointer;">🔄 ROTATE: ON</button>
          <button id="btn-toggle-wireframe" style="flex: 1; padding: 6px; font-size: 12px; background: rgba(15,23,42,0.6); color: #94a3b8; border: 1px solid rgba(56,189,248,0.2); border-radius: 6px; cursor: pointer;">📐 WIREFRAME</button>
        </div>
      </div>

      <div style="font-family: 'Share Tech Mono', monospace; font-size: 12px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 12px;" id="studio-model-stats">
        <div style="color: #38bdf8; font-weight: 700; margin-bottom: 6px; font-size: 13px;" id="stat-name">HEAVY TANK</div>
        <div style="color: #cbd5e1; margin-bottom: 2px;">Vertices: <span id="stat-verts" style="color: #fff; font-weight: 600;">406</span></div>
        <div style="color: #cbd5e1; margin-bottom: 2px;">Triangles: <span id="stat-tris" style="color: #fff; font-weight: 600;">263</span></div>
        <div style="color: #cbd5e1; margin-bottom: 2px;">Texture: <span id="stat-tex" style="color: #38bdf8;">hvytank.png</span></div>
        <div style="color: #cbd5e1;">Mesh Format: <span id="stat-src" style="color: #a855f7;">BigHuge3D (.bh3)</span></div>
      </div>

      <div style="font-family: 'Share Tech Mono', monospace; font-size: 11px; color: #64748b; line-height: 1.4;">
        💡 Drag to orbit 360° · Scroll to zoom
      </div>
    `;

    // Top Navigation Toggle Button
    const topBar = document.createElement('div');
    topBar.style.cssText = `
      position: absolute;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      pointer-events: auto;
      display: flex;
      gap: 12px;
    `;

    topBar.innerHTML = `
      <button id="btn-mode-battlefield" style="padding: 8px 18px; font-family: 'Orbitron', monospace; font-size: 13px; font-weight: 700; background: rgba(15,23,42,0.85); color: #94a3b8; border: 1px solid rgba(56,189,248,0.3); border-radius: 8px; cursor: pointer; letter-spacing: 1px;">⚔️ 3D BATTLEFIELD</button>
      <button id="btn-mode-studio" style="padding: 8px 18px; font-family: 'Orbitron', monospace; font-size: 13px; font-weight: 700; background: linear-gradient(135deg, rgba(56,189,248,0.3), rgba(139,92,246,0.3)); color: #fff; border: 1px solid #38bdf8; border-radius: 8px; cursor: pointer; letter-spacing: 1px;">🔬 ASSET STUDIO</button>
    `;

    this.uiContainer.appendChild(leftPanel);
    this.uiContainer.appendChild(rightPanel);
    this.uiContainer.appendChild(topBar);
    document.body.appendChild(this.uiContainer);

    this._bindUIEvents();
    this._populateModelList('tanks');
  }

  _bindUIEvents() {
    // Mode Switcher
    document.getElementById('btn-mode-battlefield').addEventListener('click', () => {
      this.hide();
    });

    // Category Tabs
    const tabs = document.querySelectorAll('#studio-category-tabs button');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => {
          t.style.background = 'rgba(15,23,42,0.6)';
          t.style.color = '#94a3b8';
          t.style.borderColor = 'rgba(56,189,248,0.3)';
        });
        tab.style.background = 'rgba(56,189,248,0.2)';
        tab.style.color = '#fff';
        tab.style.borderColor = '#38bdf8';
        this._populateModelList(tab.dataset.cat);
      });
    });

    // Livery Colors
    document.getElementById('btn-color-red').addEventListener('click', () => {
      this.currentColor = 0xd93838;
      this.loadAsset(this.currentCategory, this.currentType);
    });
    document.getElementById('btn-color-green').addEventListener('click', () => {
      this.currentColor = 0x22a050;
      this.loadAsset(this.currentCategory, this.currentType);
    });
    document.getElementById('btn-color-desert').addEventListener('click', () => {
      this.currentColor = 0x8c7355;
      this.loadAsset(this.currentCategory, this.currentType);
    });

    // States
    const stateBtns = {
      healthy: document.getElementById('btn-state-healthy'),
      damaged: document.getElementById('btn-state-damaged'),
      critical: document.getElementById('btn-state-critical'),
      wreck: document.getElementById('btn-state-wreck'),
    };

    Object.entries(stateBtns).forEach(([st, btn]) => {
      btn.addEventListener('click', () => {
        Object.values(stateBtns).forEach((b) => {
          b.style.background = 'rgba(15,23,42,0.6)';
          b.style.color = '#94a3b8';
          b.style.borderColor = 'rgba(56,189,248,0.2)';
        });
        btn.style.background = 'rgba(56,189,248,0.2)';
        btn.style.color = '#38bdf8';
        btn.style.borderColor = '#38bdf8';
        this.currentState = st;
        this.loadAsset(this.currentCategory, this.currentType);
      });
    });

    // Auto Rotate
    const btnRotate = document.getElementById('btn-toggle-rotate');
    btnRotate.addEventListener('click', () => {
      this.isAutoRotate = !this.isAutoRotate;
      btnRotate.innerText = this.isAutoRotate ? '🔄 ROTATE: ON' : '⏸️ ROTATE: OFF';
      btnRotate.style.color = this.isAutoRotate ? '#fff' : '#94a3b8';
    });

    // Wireframe
    const btnWireframe = document.getElementById('btn-toggle-wireframe');
    btnWireframe.addEventListener('click', () => {
      this.isWireframe = !this.isWireframe;
      btnWireframe.style.background = this.isWireframe ? 'rgba(56,189,248,0.2)' : 'rgba(15,23,42,0.6)';
      btnWireframe.style.color = this.isWireframe ? '#38bdf8' : '#94a3b8';
      this._applyWireframe();
    });
  }

  _populateModelList(category) {
    const listContainer = document.getElementById('studio-model-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const models = {
      tanks: [
        { id: 'heavy', label: 'Heavy Battle Tank', geoKey: 'hvytank', tex: 'hvytank.png' },
        { id: 'euro', label: 'Euro Leopard MBT', geoKey: 'euro_mtank', tex: 'euro_mtank.png' },
        { id: 'medium', label: 'Medium Tank (T-72)', geoKey: 'mediumtank', tex: 'mediumtank.png' },
        { id: 'russian', label: 'Russian MBT (T-80)', geoKey: 'mediumtank_russian', tex: 'mediumtank_russian.png' },
        { id: 'asian', label: 'Asian Modern MBT', geoKey: 'mediumtank_asian', tex: 'mediumtank_asian.png' },
        { id: 'destroyer', label: 'Tank Destroyer', geoKey: 'tankdestroyer', tex: 'tankdestroyer.png' },
        { id: 'light', label: 'Light Scout Tank', geoKey: 'lighttank', tex: 'lighttank.png' },
        { id: 'light_mkiv', label: 'Light Tank Mk-IV', geoKey: 'lighttank_mkiv', tex: 'lighttank_mkiv.png' },
        { id: 'missile', label: 'ATGM Missile Carrier', geoKey: 'antitankmissile', tex: 'hvytank.png' },
      ],
      vehicles: [
        { id: 'scout', label: 'Armored Scout Car', geoKey: 'armoredscoutcar', tex: 'armoredscoutcar.png' },
        { id: 'armcar', label: 'Heavy Armored Car', geoKey: 'armcar', tex: 'armcar.png' },
        { id: 'truck', label: 'Military Transport Truck', geoKey: 'truck', tex: 'truck.png' },
        { id: 'artillery_truck', label: 'Artillery Truck', geoKey: 'artillery_truck', tex: 'truck.png' },
        { id: 'supply', label: 'Ammo Supply Truck', geoKey: 'supplytruck', tex: 'truck.png' },
      ],
      artillery: [
        { id: 'cannon', label: 'Heavy Howitzer Cannon', geoKey: 'artillery_cannon', tex: 'artillery_cannon.png' },
        { id: 'flak', label: 'Heavy Flak 88 Battery', geoKey: 'flakgun', tex: 'flakgun.png' },
        { id: 'aa', label: 'Quad AA Defense Cannon', geoKey: 'aagun', tex: 'aagun.png' },
        { id: 'airdefense', label: 'Mobile Air Defense Gun', geoKey: 'airdefensegun', tex: 'airdefensegun.png' },
        { id: 'sam', label: 'SAM Missile Battery', geoKey: 'sam', tex: 'sam.png' },
      ],
      aircraft: [
        { id: 'f16', label: 'F-16 Fighting Falcon', geoKey: 'jetfighter_f16', tex: 'jetfighter_f16.png' },
        { id: 'mig', label: 'MiG-29 Fighter', geoKey: 'jetfighter_mig', tex: 'jetfighter_mig.png' },
        { id: 'mirage', label: 'Mirage 2000 Fighter', geoKey: 'jetfighter_mirage', tex: 'jetfighter_mig.png' },
        { id: 'a10', label: 'A-10 Thunderbolt (Warthog)', geoKey: 'a10', tex: 'a10.png' },
        { id: 'stealth', label: 'B-2 Stealth Bomber', geoKey: 'stealthbomber', tex: 'jetfighterbomber.png' },
        { id: 'bomber', label: 'Strategic Tu-22M Bomber', geoKey: 'stratbomber_backfire', tex: 'stratbomber_backfire.png' },
        { id: 'advfighter', label: 'Advanced 5th-Gen Fighter', geoKey: 'advfighter', tex: 'advfighter.png' },
        { id: 'helicopter', label: 'Transport / Attack Heli', geoKey: 'helicopter', tex: 'helicopter_blade.png' },
      ],
      soldiers: [
        { id: 'assault', label: 'Assault Rifle Infantry', geoKey: 'assault_infantry', tex: 'assault_infantry.png' },
        { id: 'infantry', label: 'Combat Field Infantry', geoKey: 'infantry', tex: 'infantry.png' },
        { id: 'commando', label: 'Special Forces Commando', geoKey: 'commando', tex: 'commando.png' },
        { id: 'marine', label: 'Assault Marine Trooper', geoKey: 'assaultmarine1', tex: 'infantry.png' },
        { id: 'shock', label: 'Heavy Shock Trooper', geoKey: 'shockinfantry', tex: 'shockinfantry.png' },
      ],
    };

    const items = models[category] || models.tanks;
    items.forEach((item, index) => {
      const btn = document.createElement('button');
      btn.style.cssText = `
        padding: 8px 12px;
        text-align: left;
        font-size: 13px;
        font-weight: 600;
        background: ${index === 0 ? 'rgba(56, 189, 248, 0.18)' : 'rgba(15, 23, 42, 0.7)'};
        color: #cbd5e1;
        border: 1px solid ${index === 0 ? '#38bdf8' : 'rgba(56, 189, 248, 0.15)'};
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
      `;
      btn.innerHTML = `
        <div style="color: #fff; font-weight: 600;">${item.label}</div>
        <div style="font-size: 11px; color: #64748b; font-family: monospace;">${item.geoKey}.bh3</div>
      `;

      btn.addEventListener('click', () => {
        Array.from(listContainer.children).forEach((c) => {
          c.style.borderColor = 'rgba(56, 189, 248, 0.15)';
          c.style.background = 'rgba(15, 23, 42, 0.7)';
        });
        btn.style.borderColor = '#38bdf8';
        btn.style.background = 'rgba(56, 189, 248, 0.18)';

        const catSingular = category === 'tanks' ? 'tank' : (category === 'vehicles' ? 'vehicle' : (category === 'artillery' ? 'artillery' : (category === 'aircraft' ? 'aircraft' : 'soldier')));
        this.loadAsset(catSingular, item.id);
      });

      listContainer.appendChild(btn);
    });

    const initialCat = category === 'tanks' ? 'tank' : (category === 'vehicles' ? 'vehicle' : (category === 'artillery' ? 'artillery' : (category === 'aircraft' ? 'aircraft' : 'soldier')));
    if (items.length > 0) {
      this.loadAsset(initialCat, items[0].id);
    }
  }

  async loadAsset(category, type) {
    this.currentCategory = category;
    this.currentType = type;

    // Remove existing model
    if (this.currentMeshGroup) {
      this.scene.remove(this.currentMeshGroup);
      this.currentMeshGroup = null;
    }

    const geoMap = {
      heavy: 'hvytank', euro: 'euro_mtank', medium: 'mediumtank', russian: 'mediumtank_russian',
      asian: 'mediumtank_asian', destroyer: 'tankdestroyer', light: 'lighttank', light_mkiv: 'lighttank_mkiv',
      missile: 'antitankmissile', scout: 'armoredscoutcar', armcar: 'armcar', truck: 'truck',
      artillery_truck: 'artillery_truck', supply: 'supplytruck', cannon: 'artillery_cannon',
      flak: 'flakgun', aa: 'aagun', airdefense: 'airdefensegun', sam: 'sam',
      f16: 'jetfighter_f16', mig: 'jetfighter_mig', mirage: 'jetfighter_mirage', a10: 'a10',
      stealth: 'stealthbomber', bomber: 'stratbomber_backfire', advfighter: 'advfighter', helicopter: 'helicopter',
      assault: 'assault_infantry', infantry: 'infantry', commando: 'commando', marine: 'assaultmarine1', shock: 'shockinfantry'
    };
    const geoKey = geoMap[type] || type;
    if (modelLoader.reloadGeometry) {
      await modelLoader.reloadGeometry(geoKey);
    }

    let group;
    if (category === 'tank') {
      group = modelLoader.createTank(type, this.currentColor, this.currentState);

    } else if (category === 'vehicle') {
      group = modelLoader.createVehicle(type, this.currentColor, this.currentState);
    } else if (category === 'artillery') {
      group = modelLoader.createArtillery(type, this.currentColor, this.currentState);
    } else if (category === 'aircraft') {
      if (type === 'helicopter') {
        group = modelLoader.createHelicopter(this.currentColor);
      } else {
        group = modelLoader.createAircraft(type, this.currentColor);
      }
    } else {
      group = modelLoader.createSoldier(type, this.currentColor, this.currentState);
    }

    if (!group) return;

    // Normalize size and center on pedestal
    group.position.set(0, 0, 0);
    group.rotation.set(0, Math.PI * 0.8, 0);
    group.scale.set(1, 1, 1);
    group.updateMatrixWorld(true);

    const bbox = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);

    if (maxDim > 0) {
      const targetSize = (category === 'soldier') ? 2.6 : 3.8;
      const fitScale = targetSize / maxDim;
      group.scale.set(fitScale, fitScale, fitScale);
      group.updateMatrixWorld(true);
    }

    const bboxAfter = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    bboxAfter.getCenter(center);
    group.position.x = -center.x;
    group.position.z = -center.z;
    group.position.y = -bboxAfter.min.y; // Sit precisely on top of pedestal (y=0)

    if (category === 'aircraft') {
      group.position.y += 0.5; // Hover aircraft above pedestal
    }

    this.currentMeshGroup = group;
    this.scene.add(group);

    this._applyWireframe();
    this._updateStatsUI();
  }

  _applyWireframe() {
    if (!this.currentMeshGroup) return;
    this.currentMeshGroup.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.wireframe = this.isWireframe;
      }
    });
  }

  _updateStatsUI() {
    if (!this.currentMeshGroup) return;
    let totalVerts = 0;
    let totalTris = 0;

    this.currentMeshGroup.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const pos = child.geometry.attributes.position;
        if (pos) totalVerts += pos.count;
        if (child.geometry.index) {
          totalTris += child.geometry.index.count / 3;
        } else if (pos) {
          totalTris += pos.count / 3;
        }
      }
    });

    const statName = document.getElementById('stat-name');
    const statVerts = document.getElementById('stat-verts');
    const statTris = document.getElementById('stat-tris');
    const statTex = document.getElementById('stat-tex');
    const statSrc = document.getElementById('stat-src');

    if (statName) statName.innerText = `${this.currentType.toUpperCase()} (${this.currentCategory.toUpperCase()})`;
    if (statVerts) statVerts.innerText = totalVerts.toLocaleString();
    if (statTris) statTris.innerText = Math.floor(totalTris).toLocaleString();
    if (statTex) statTex.innerText = `${this.currentType}.png`;
    if (statSrc) statSrc.innerText = `${this.currentType}.bh3`;
  }

  show() {
    this.active = true;
    this.renderer.domElement.style.display = 'block';
    this.uiContainer.style.display = 'block';

    const hud = document.getElementById('hud');
    if (hud) hud.style.display = 'none';

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this._updateCamera();

    if (!this.currentMeshGroup) {
      this.loadAsset(this.currentCategory, this.currentType);
    }

    this._animate();
  }

  hide() {
    this.active = false;
    this.renderer.domElement.style.display = 'none';
    this.uiContainer.style.display = 'none';

    const hud = document.getElementById('hud');
    if (hud) hud.style.display = 'block';

    window.dispatchEvent(new Event('resize'));
  }

  _animate = () => {
    if (!this.active) return;
    requestAnimationFrame(this._animate);

    if (this.isAutoRotate && this.currentMeshGroup) {
      this.currentMeshGroup.rotation.y += 0.012;
      // Spin helicopter rotor in studio
      if (this.currentMeshGroup.userData.rotor) {
        this.currentMeshGroup.userData.rotor.rotation.y += 0.25;
      }
    }

    this.renderer.render(this.scene, this.camera);
  };
}
