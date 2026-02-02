import { Application } from 'pixi.js';
import { loadAllAssets } from './assets/loader.js';
import { Battlefield } from './scene/Battlefield.js';
import { Army } from './army/Army.js';
import { BattleDirector } from './battle/BattleDirector.js';
import { PriceFeed } from './battle/PriceFeed.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants.js';

async function main() {
  // 1. Initialize PixiJS app (v8 async required)
  const app = new Application();
  await app.init({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundAlpha: 0,
    antialias: true,
  });

  document.getElementById('app').appendChild(app.canvas);
  console.log('PixiJS app initialized:', CANVAS_WIDTH, 'x', CANVAS_HEIGHT);

  // 2. Load ALL assets (HD tanks, soldiers, planes, explosions, background)
  const assets = await loadAllAssets();

  // 3. Build the battlefield scene with painted sky
  const battlefield = new Battlefield(assets.sky);
  app.stage.addChild(battlefield.container);

  // 4. Create both armies with all unit types
  const redArmy = new Army('red', assets);
  const greenArmy = new Army('green', assets);

  redArmy.setFormation();
  greenArmy.setFormation();

  battlefield.unitsLayer.addChild(redArmy.container);
  battlefield.unitsLayer.addChild(greenArmy.container);

  // Falling coins render on top of all units
  redArmy.effectsLayer = battlefield.effectsLayer;
  greenArmy.effectsLayer = battlefield.effectsLayer;

  // 5. Battle director with screen shake support
  const director = new BattleDirector(redArmy, greenArmy, {
    baseSpeed: 0.4,
    bulletTexture: assets.bullet,
    stage: battlefield.container, // for screen shake
  });

  // 6. Mock price feed
  const feed = new PriceFeed();
  feed.subscribe((data) => {
    director.onPriceUpdate(data);
  });
  feed.startMock(1200);

  // 7. Main animation loop
  app.ticker.add((ticker) => {
    director.update(ticker.deltaTime);
  });

  console.log('Battle scene ready! HD assets loaded. Mock price feed running.');
}

main().catch(console.error);
