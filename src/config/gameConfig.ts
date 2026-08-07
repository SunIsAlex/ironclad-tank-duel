import type { GameSettings } from '../types';

export const DEFAULT_SETTINGS: GameSettings = {
  player1Name: '玩家 1',
  player2Name: '玩家 2',
  opponentMode: 'ai',
  mapSeed: '',
  mapPreset: 'open_arena',
  turnTime: 0,
  initialHealth: 100,
  windStrength: 2,
  movementFuel: 220,
  screenShake: true,
  musicVolume: 0.6,
  sfxVolume: 0.8,
  showTrajectory: true,
  reducedMotion: false,
};

export interface GameWorldConfig {
  worldWidth: number;
  worldHeight: number;
  gravity: number; // 像素/秒²
  windScale: number; // 风力强度等级对应的加速度
}

export const WORLD_CONFIG: GameWorldConfig = {
  // 内部世界像素尺寸（不随屏幕变化）
  worldWidth: 1600,
  worldHeight: 720,
  gravity: 520,
  windScale: 55,
};

// 土壤层厚度（用于绘制渐变和判断地图底部）
export const GROUND_THICKNESS = 240;

// 坦克外观参数
export const TANK_CONFIG = {
  bodyWidth: 38,
  bodyHeight: 14,
  turretRadius: 9,
  barrelLength: 24,
  barrelWidth: 6,
  wheelRadius: 6,
  maxClimbSlope: 1.0, // ≈45°，超过此斜率不可继续上坡
  moveSpeed: 70, // 像素/秒
  fallDamageThreshold: 280, // 速度阈值
  fallDamageFactor: 0.06,
  knockbackFactor: 0.35,
  pixelToHealthKnockback: 0.04,
};

// 武器解锁的默认颜色（便于 UI 显示）
// 最大功率 820：在重力 520 下 45° 射程约 1290px，足以覆盖 1600 世界两端
export const POWER_RANGE = { min: 150, max: 820 };
export const ANGLE_RANGE = { min: 0, max: 180 };

export const PROJECTILE_LIFETIME = 12; // 秒
export const PROJECTILE_MAX_SPEED = 1400; // 用于分段检测步进
