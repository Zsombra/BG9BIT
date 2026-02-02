import { Assets } from 'pixi.js';
import {
  TANK_ASSETS, SOLDIER_ASSETS, AIRPLANE_ASSETS,
  EXPLOSION_ASSETS, BG_ASSETS, BULLET_ASSET,
  HYPERLIQUID_API_URL, COIN_ICON_CDN, FALLBACK_COINS,
} from '../constants.js';

/**
 * Load an array of image paths and return an array of Textures.
 */
async function loadFrames(paths) {
  const textures = [];
  for (const path of paths) {
    const tex = await Assets.load(path);
    textures.push(tex);
  }
  return textures;
}

/**
 * Load crypto coin icon textures from Hyperliquid-listed coins.
 * Falls back to hardcoded list if API fails.
 */
async function loadCoinTextures() {
  let symbols = [...FALLBACK_COINS];

  // Try fetching live coin list from Hyperliquid
  try {
    const res = await fetch(HYPERLIQUID_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'meta' }),
    });
    const data = await res.json();
    if (data?.universe?.length) {
      symbols = data.universe
        .filter((c) => !c.isDelisted)
        .map((c) => c.name.toLowerCase());
    }
  } catch (e) {
    console.warn('Hyperliquid API unavailable, using fallback coin list');
  }

  // Shuffle and take up to 30 coins
  const shuffled = symbols.sort(() => Math.random() - 0.5).slice(0, 30);

  // Load textures with allSettled (some may fail, that's OK)
  const results = await Promise.allSettled(
    shuffled.map((sym) => Assets.load(`${COIN_ICON_CDN}/${sym}.png`))
  );

  const textures = results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value);

  console.log(`Loaded ${textures.length} coin textures`);
  return textures;
}

/**
 * Load ALL game assets and return organized texture collections.
 */
export async function loadAllAssets() {
  console.log('Loading assets...');

  // Load all asset groups in parallel
  const [
    tankMoveForward,
    tankMoveBackward,
    tankAttack,
    tankDeath,
    tankIdle,
    soldierWalk,
    soldierShoot,
    soldierShootUp,
    soldierIdle,
    airplaneIdle,
    airplaneDeath,
    explosion1,
    explosion2,
    skyTexture,
    bulletTexture,
  ] = await Promise.all([
    loadFrames(TANK_ASSETS.moveForward),
    loadFrames(TANK_ASSETS.moveBackward),
    loadFrames(TANK_ASSETS.attack),
    loadFrames(TANK_ASSETS.death),
    loadFrames(TANK_ASSETS.idle),
    loadFrames(SOLDIER_ASSETS.walk),
    loadFrames(SOLDIER_ASSETS.shootFront),
    loadFrames(SOLDIER_ASSETS.shootUp),
    loadFrames(SOLDIER_ASSETS.idle),
    Assets.load(AIRPLANE_ASSETS.idle),
    loadFrames(AIRPLANE_ASSETS.death),
    loadFrames(EXPLOSION_ASSETS.explosion1),
    loadFrames(EXPLOSION_ASSETS.explosion2),
    Assets.load(BG_ASSETS.sky),
    Assets.load(BULLET_ASSET),
  ]);

  // Load coin textures in parallel with everything else
  const coinTextures = await loadCoinTextures();

  console.log('All assets loaded!');

  return {
    tank: {
      moveForward: tankMoveForward,
      moveBackward: tankMoveBackward,
      attack: tankAttack,
      death: tankDeath,
      idle: tankIdle,
    },
    soldier: {
      walk: soldierWalk,
      shoot: soldierShoot,
      shootUp: soldierShootUp,
      idle: soldierIdle,
    },
    airplane: {
      idle: airplaneIdle,
      death: airplaneDeath,
    },
    explosion: {
      explosion1,
      explosion2,
    },
    sky: skyTexture,
    bullet: bulletTexture,
    coinTextures,
  };
}
