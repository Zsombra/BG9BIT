import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT, GROUND_Y } from '../constants.js';

/**
 * Battlefield — Sci-Fi futuristic cyber arena scene.
 * Contains:
 *  - Background grid and atmospheric cyber grid with perspective
 *  - Laser contested line / energy front line at center
 *  - Glowing faction base beacons (BEARS / BULLS)
 *  - Units layer for armies
 *  - Effects layer for lasers, explosions, coins, and strikes
 */
export class Battlefield {
  constructor(skyTexture) {
    this.container = new Container();

    // Layer 1: Background & Cyber Grid
    this.bgLayer = new Container();
    this.container.addChild(this.bgLayer);

    // Layer 2: Contested Front Line & Base Markers
    this.markerLayer = new Container();
    this.container.addChild(this.markerLayer);

    // Layer 3: Units (armies added here)
    this.unitsLayer = new Container();
    this.container.addChild(this.unitsLayer);

    // Layer 4: Effects (explosions, lasers, coins, orbital strikes)
    this.effectsLayer = new Container();
    this.container.addChild(this.effectsLayer);

    // Animation state
    this.time = 0;
    this.frontLineX = CANVAS_WIDTH / 2;
    this.targetFrontLineX = CANVAS_WIDTH / 2;

    this._initBackground();
    this._initFrontLine();
    this._initBaseMarkers();
  }

  _initBackground() {
    this.bgGraphics = new Graphics();
    this.bgLayer.addChild(this.bgGraphics);
    this._drawBackground();
  }

  _drawBackground() {
    const g = this.bgGraphics;
    g.clear();

    const w = CANVAS_WIDTH;
    const h = CANVAS_HEIGHT;
    const groundY = GROUND_Y;

    // 1. Dark deep space / cyber sky
    g.rect(0, 0, w, groundY);
    g.fill({ color: 0x070913, alpha: 0.95 });

    // Cyber sky horizontal grid lines (subtle perspective)
    for (let y = 30; y < groundY; y += 35) {
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke({ width: 1, color: 0x1e293b, alpha: 0.25 });
    }

    // Sky vertical grid lines
    for (let x = 0; x <= w; x += 60) {
      g.moveTo(x, 0);
      g.lineTo(x, groundY);
      g.stroke({ width: 1, color: 0x1e293b, alpha: 0.15 });
    }

    // 2. Ground plane (dark metallic surface with neon grid)
    g.rect(0, groundY, w, h - groundY);
    g.fill({ color: 0x0b0f19 });

    // Ground top border neon line
    g.moveTo(0, groundY);
    g.lineTo(w, groundY);
    g.stroke({ width: 2, color: 0x334155, alpha: 0.8 });

    // Ground perspective grid lines
    const numGridLines = 16;
    for (let i = 0; i <= numGridLines; i++) {
      const topX = (w / numGridLines) * i;
      const bottomX = (w / 2) + ((topX - (w / 2)) * 1.3);
      g.moveTo(topX, groundY);
      g.lineTo(bottomX, h);
      g.stroke({ width: 1, color: 0x1e293b, alpha: 0.4 });
    }

    // Horizontal ground scanlines
    for (let y = groundY + 12; y < h; y += 16) {
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke({ width: 1, color: 0x1e293b, alpha: 0.3 });
    }
  }

  _initFrontLine() {
    this.frontLineGraphics = new Graphics();
    this.markerLayer.addChild(this.frontLineGraphics);
  }

  _initBaseMarkers() {
    this.baseMarkersGraphics = new Graphics();
    this.markerLayer.addChild(this.baseMarkersGraphics);

    // Left base banner: BEARS (Resistance)
    const bearStyle = new TextStyle({
      fontFamily: 'Orbitron, Rajdhani, monospace',
      fontSize: 14,
      fontWeight: 'bold',
      fill: 0xff4466,
      letterSpacing: 2,
    });
    this.bearLabel = new Text({ text: '◀ BEARS (SELL)', style: bearStyle });
    this.bearLabel.position.set(24, 75);
    this.markerLayer.addChild(this.bearLabel);

    // Right base banner: BULLS (Support)
    const bullStyle = new TextStyle({
      fontFamily: 'Orbitron, Rajdhani, monospace',
      fontSize: 14,
      fontWeight: 'bold',
      fill: 0x00ff88,
      letterSpacing: 2,
    });
    this.bullLabel = new Text({ text: 'BULLS (BUY) ▶', style: bullStyle });
    this.bullLabel.position.set(CANVAS_WIDTH - 210, 75);
    this.markerLayer.addChild(this.bullLabel);
  }

  /**
   * Set front line target position (based on buy/sell wall ratio or order book pressure).
   * @param {number} x - Target x coordinate across battlefield
   */
  setFrontLinePosition(x) {
    this.targetFrontLineX = Math.max(120, Math.min(CANVAS_WIDTH - 120, x));
  }

  update(deltaTime = 1) {
    this.time += deltaTime * 0.05;

    // Smooth lerp front line
    this.frontLineX += (this.targetFrontLineX - this.frontLineX) * 0.05 * deltaTime;

    // Redraw dynamic front line energy barrier
    const g = this.frontLineGraphics;
    g.clear();

    const x = this.frontLineX;
    const groundY = GROUND_Y;
    const pulseAlpha = 0.5 + Math.sin(this.time * 2) * 0.25;

    // Energy barrier beam from sky to ground
    // Outer glow
    g.moveTo(x, 0);
    g.lineTo(x, CANVAS_HEIGHT);
    g.stroke({ width: 8, color: 0x00f0ff, alpha: pulseAlpha * 0.2 });

    // Inner bright beam
    g.moveTo(x, 0);
    g.lineTo(x, CANVAS_HEIGHT);
    g.stroke({ width: 2, color: 0x00f0ff, alpha: pulseAlpha * 0.8 });

    // Ground impact node
    g.circle(x, groundY, 4 + Math.sin(this.time * 4) * 2);
    g.fill({ color: 0x00f0ff, alpha: 0.9 });

    // Base defense glow pads
    const bg = this.baseMarkersGraphics;
    bg.clear();

    // Bear base pad (Red)
    bg.roundRect(16, GROUND_Y - 2, 80, 4, 2);
    bg.fill({ color: 0xff4466, alpha: 0.6 + Math.sin(this.time * 1.5) * 0.2 });

    // Bull base pad (Green)
    bg.roundRect(CANVAS_WIDTH - 96, GROUND_Y - 2, 80, 4, 2);
    bg.fill({ color: 0x00ff88, alpha: 0.6 + Math.cos(this.time * 1.5) * 0.2 });
  }
}
