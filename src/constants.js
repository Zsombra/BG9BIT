// Canvas dimensions (matches the trading chart canvas size)
export const CANVAS_WIDTH = 870;
export const CANVAS_HEIGHT = 239;

// ============ TANK ASSETS (War Game Kit HD Sherman) ============
export const TANK_ASSETS = {
  moveForward: Array.from({ length: 8 }, (_, i) => `tank/American_sherman_move_forward_${i + 1}.png`),
  moveBackward: Array.from({ length: 8 }, (_, i) => `tank/American_sherman_move_backward_${i + 1}.png`),
  attack: Array.from({ length: 8 }, (_, i) => `tank/American_sherman_attack_${i + 1}.png`),
  death: [
    ...Array.from({ length: 9 }, (_, i) => `tank/American_sherman_death_${i + 1}.png`),
    'tank/American_sherman_death_10.png',
    'tank/American_sherman_death_11.png',
  ],
  idle: ['tank/American_sherman_default.png'],
};

// ============ SOLDIER ASSETS (War Game Kit) ============
export const SOLDIER_ASSETS = {
  walk: Array.from({ length: 8 }, (_, i) => `soldier/Soldier_2_walk_${i + 1}.png`),
  shootFront: Array.from({ length: 8 }, (_, i) => `soldier/Soldier_2_shot_front_${i + 1}.png`),
  shootUp: Array.from({ length: 11 }, (_, i) => `soldier/Soldier_2_shot_up_${i + 1}.png`),
  idle: ['soldier/Soldier_2_default.png'],
};

// ============ AIRPLANE ASSETS (WW2 P-51 Mustang) ============
export const AIRPLANE_ASSETS = {
  idle: 'airplane/WW2_fighter_default.png',
  death: ['airplane/AEG_CIV_death_1.png', 'airplane/AEG_CIV_death_2.png', 'airplane/AEG_CIV_death_3.png', 'airplane/AEG_CIV_death_4.png'],
};

// ============ EXPLOSION ASSETS ============
export const EXPLOSION_ASSETS = {
  explosion1: Array.from({ length: 7 }, (_, i) => `explosion/${String(i).padStart(3, '0')}.png`),
  explosion2: Array.from({ length: 7 }, (_, i) => `explosion/exp2_${String(i).padStart(3, '0')}.png`),
};

// ============ BACKGROUND ============
export const BG_ASSETS = {
  sky: 'bg/sky.png',
};

// ============ BULLET ============
export const BULLET_ASSET = 'bullet/bullet.png';

// Army colors
export const RED_TINT = 0xff4444;
export const GREEN_TINT = 0x44ff44;

// Ground level (y position where units' feet sit)
export const GROUND_Y = 205;

// Battle tuning
export const TANK_SPEED = 0.5;
export const SHOOT_FRAME_RATE = 0.08;  // seconds per frame
export const WALK_FRAME_RATE = 0.1;    // seconds per frame
export const TANKS_PER_ARMY = 3;
export const SOLDIERS_PER_ARMY = 4;
export const PLANES_PER_ARMY = 2;

// Sky / ground split
export const SKY_HEIGHT = 180;
export const GROUND_HEIGHT = 59; // CANVAS_HEIGHT - SKY_HEIGHT

// ============ AIRPLANE DAMAGED ASSET (unused — keeping for reference) ============
// export const AIRPLANE_DAMAGED_ASSETS = {
//   idle: 'airplane/WW2_fighter_default_damaged.png',
// };

// ============ AIR COMBAT TUNING ============
export const PLANE_MAX_HP = 3;
export const PLANE_DAMAGED_THRESHOLD = 1;
export const PLANE_RESPAWN_DELAY = 5;          // seconds
export const PLANE_SHOOT_COOLDOWN = 1.8;       // seconds (losing side)
export const PLANE_SHOOT_COOLDOWN_WINNING = 1.0; // seconds (winning side)
export const PLANE_BULLET_SPEED = 4;
export const PLANE_HIT_RADIUS = 15;
export const AIR_EXPLOSION_SCALE = 0.3;

// ============ TANK COMBAT TUNING ============
export const TANK_MAX_HP = 3;
export const TANK_RESPAWN_DELAY = 6;            // seconds
export const TANK_SHOOT_COOLDOWN = 2.5;         // seconds (losing side)
export const TANK_SHOOT_COOLDOWN_WINNING = 1.5; // seconds (winning side)
export const TANK_SHELL_SPEED = 3;              // pixels per deltaTime
export const TANK_HIT_RADIUS = 20;              // collision radius
export const TANK_EXPLOSION_SCALE = 0.5;        // explosion on hit
export const TANK_SHELL_SCALE = 0.12;           // shell sprite size

// ============ SOLDIER COMBAT TUNING ============
export const SOLDIER_MAX_HP = 2;
export const SOLDIER_RESPAWN_DELAY = 4;            // seconds
export const SOLDIER_SHOOT_COOLDOWN = 2.0;         // seconds (losing side)
export const SOLDIER_SHOOT_COOLDOWN_WINNING = 1.2; // seconds (winning side)
export const SOLDIER_HIT_CHANCE = 0.15;            // losing side
export const SOLDIER_HIT_CHANCE_WINNING = 0.30;    // winning side
export const SOLDIER_EXPLOSION_SCALE = 0.35;       // death explosion

// ============ FALLING COIN TUNING ============
export const COIN_DROP_MIN = 3;
export const COIN_DROP_MAX = 5;
export const COIN_SCALE = 0.25;
export const COIN_GRAVITY = 0.06;
export const HYPERLIQUID_API_URL = 'https://api.hyperliquid.xyz/info';
export const COIN_ICON_CDN = 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color';
export const FALLBACK_COINS = [
  'btc','eth','sol','doge','bnb','avax','arb','op','sui','apt',
  'inj','matic','ltc','atom','link','xrp','ada','dot','near','ftm',
  'sei','blur','jup','wif','pepe','bonk','meme','tia','pyth','strk',
];
