import { SceneManager } from './3d/SceneManager.js';
import { modelLoader } from './3d/ModelLoader.js';
import { AssetStudio } from './studio/AssetStudio.js';
import { PriceFeed } from './battle/PriceFeed.js';
import { HUD } from './hud/HUD.js';

async function main() {
  // 1. Initialize HUD overlay first
  const hud = new HUD();
  hud.init();
  hud.setLoadProgress(15, 'Initializing 3D WebGL Engine...');

  const appContainer = document.getElementById('app');
  appContainer.innerHTML = '';

  // 2. Load authentic Rise of Nations 3D models and textures
  hud.setLoadProgress(35, 'Loading Rise of Nations 3D Models & Units...');
  await modelLoader.loadAll();

  // 3. Initialize 3D Scene Manager & Asset Studio
  hud.setLoadProgress(65, 'Deploying Armies & 3D Battlefield...');
  const sceneManager = new SceneManager(appContainer);
  const assetStudio = new AssetStudio(appContainer);

  // Hook Studio toggle button
  const btnStudio = document.getElementById('btnStudio');
  if (btnStudio) {
    btnStudio.addEventListener('click', () => {
      if (assetStudio.active) {
        assetStudio.hide();
      } else {
        assetStudio.show();
      }
    });
  }

  // Hook recenter button to 3D Camera
  const btnRecenter = document.getElementById('btnRecenter');
  if (btnRecenter) {
    btnRecenter.addEventListener('click', () => {
      sceneManager.recenterCamera();
    });
  }

  hud.setLoadProgress(85, 'Connecting to Live Market Streams...');

  // 3. Price Feed — connect live WebSocket & wire to 3D Scene & HUD
  const feed = new PriceFeed();

  // Price updates -> 3D Terrain + HUD
  feed.subscribe((data) => {
    sceneManager.onPriceUpdate(data);
    hud.updatePrice(data);
  });

  // Order book updates -> 3D Front Line + HUD
  feed.onOrderBook((data) => {
    sceneManager.onOrderBookUpdate(data);
    hud.updateOrderBook(data);
  });

  // Liquidation events -> 3D Air Strikes + HUD
  feed.onLiquidation((data) => {
    sceneManager.onLiquidation(data);
    hud.addLiquidation(data);
  });

  // Depth chart updates -> HUD Canvas
  feed.onDepth((data) => {
    hud.updateDepthChart(data);
  });

  // Connect to live WebSocket relay server
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

  try {
    feed.connectLive(wsUrl);
    console.log('Connecting to backend WebSocket at', wsUrl);

    // If no live data arrives within 1.5 seconds, start mock feed as fallback
    const fallbackTimer = setTimeout(() => {
      if (feed.price === 0) {
        console.warn('Starting live simulation feed...');
        feed.stop();
        feed.startMock(1000);
      }
    }, 1500);

    feed.subscribe(() => {
      clearTimeout(fallbackTimer);
    });
  } catch {
    console.warn('Live connection failed, starting simulation feed...');
    feed.startMock(1000);
  }

  // 4. Reveal HUD & hide loading screen
  hud.setLoadProgress(100, '3D Battlefield Active!');
  setTimeout(() => {
    hud.show();
  }, 400);

  console.log('3D Crypto Battlefield active with Three.js engine!');
}

main().catch(console.error);
