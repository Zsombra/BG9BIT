/**
 * Public API for embedding the battle animation in other apps (React, etc.)
 *
 * Usage in React:
 *   import { createBattleScene } from './path-to/index.js';
 *
 *   useEffect(() => {
 *     let scene;
 *     (async () => {
 *       scene = await createBattleScene(containerRef.current);
 *     })();
 *     return () => scene?.destroy();
 *   }, []);
 *
 *   // Push real price updates:
 *   scene.pushPriceUpdate(51234.56);
 */

import { Application } from 'pixi.js';
import { loadAllAssets } from './assets/loader.js';
import { Battlefield } from './scene/Battlefield.js';
import { Army } from './army/Army.js';
import { BattleDirector } from './battle/BattleDirector.js';
import { PriceFeed } from './battle/PriceFeed.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants.js';

/**
 * Create and mount the battle animation scene.
 * @param {HTMLElement} containerElement - DOM element to mount canvas into
 * @param {Object} options
 * @param {number} options.baseSpeed - Base movement speed (default 0.4)
 * @param {boolean} options.useMockFeed - Start mock price feed (default false)
 * @param {number} options.mockInterval - Mock feed interval in ms (default 1200)
 * @returns {Promise<Object>} Control interface
 */
export async function createBattleScene(containerElement, options = {}) {
  const app = new Application();
  await app.init({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: 0x87ceeb,
    antialias: true,
  });

  containerElement.appendChild(app.canvas);

  const assets = await loadAllAssets();
  const battlefield = new Battlefield(assets.sky);
  app.stage.addChild(battlefield.container);

  const redArmy = new Army('red', assets);
  const greenArmy = new Army('green', assets);
  redArmy.setFormation();
  greenArmy.setFormation();
  battlefield.unitsLayer.addChild(redArmy.container);
  battlefield.unitsLayer.addChild(greenArmy.container);

  const director = new BattleDirector(redArmy, greenArmy, {
    baseSpeed: options.baseSpeed || 0.4,
  });

  const feed = new PriceFeed();
  feed.subscribe((data) => director.onPriceUpdate(data));

  if (options.useMockFeed) {
    feed.startMock(options.mockInterval || 1200);
  }

  app.ticker.add((ticker) => {
    director.update(ticker.deltaTime);
  });

  return {
    pushPriceUpdate: (price) => feed.pushUpdate(price),
    destroy: () => {
      feed.stop();
      app.ticker.stop();
      app.destroy(true);
    },
    app,
  };
}
