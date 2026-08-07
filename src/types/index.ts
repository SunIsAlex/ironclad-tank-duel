// 核心数据类型定义

export interface Tank {
  id: string;
  playerIndex: number;
  name: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  bodyAngle: number;
  turretAngle: number;
  power: number;
  health: number;
  maxHealth: number;
  movementFuel: number;
  maxFuel: number;
  isGrounded: boolean;
  selectedWeaponId: string;
  ammo: Record<string, number>;
  // 受击闪烁计时
  hitFlash: number;
  // 用于统计
  damageDealt: number;
  hitCount: number;
  directHitCount: number;
  isAlive: boolean;
}

export interface Projectile {
  id: number;
  ownerId: string;
  weaponId: string;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  radius: number;
  alive: boolean;
  age: number;
  maxAge: number;
  // 行为参数
  bounceCount: number;
  splitTime: number;
  splitDone: boolean;
  damage: number;
  explosionRadius: number;
  terrainDamageMultiplier: number;
  gravityMultiplier: number;
  windMultiplier: number;
  speedMultiplier: number;
  isDirectHit: boolean;
  // 钻地
  drillDistance: number;
  drillRemaining: number;
  state: 'flying' | 'drilling' | 'rolling';
  rollRemaining: number;
  isPayload: boolean;
  // 弹跳
  maxBounce: number;
  // 标记是否为主弹（用于镜头跟随和分裂母弹）
  isPrimary: boolean;
  // 留下尾迹用
  trail: Array<{ x: number; y: number; life: number; maxLife: number }>;
}

export type TreasureReward = 'double_damage' | 'wide_blast' | 'split_shot';

export interface TreasureChest {
  x: number;
  y: number;
  radius: number;
  phase: number;
  active: boolean;
  reward: TreasureReward | null;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: 'spark' | 'smoke' | 'debris' | 'flash' | 'ring';
  gravity: number;
  rotation: number;
  vr: number;
}

export interface DamageNumber {
  x: number;
  y: number;
  value: number;
  life: number;
  maxLife: number;
  isHeal: boolean;
}

export interface WeaponDefinition {
  id: string;
  displayName: string;
  description: string;
  ammo: number;
  projectileCount: number;
  projectileSpeedMultiplier: number;
  gravityMultiplier: number;
  windMultiplier: number;
  explosionRadius: number;
  maxDamage: number;
  terrainDamageMultiplier: number;
  bounceCount?: number;
  splitTime?: number;
  spreadAngle?: number;
  childCount?: number;
  childSpeed?: number;
  drillDistance?: number;
  bounceRestitution?: number;
  projectileSpeedStep?: number;
  rollDistance?: number;
  rollSpeed?: number;
  airstrikeCount?: number;
  airstrikeSpread?: number;
  behavior: WeaponBehavior;
  color: string;
  trailColor?: string;
  trailDuration?: number;
  trailWidth?: number;
  trailGlow?: number;
}

export type WeaponBehavior =
  | 'standard'
  | 'split'
  | 'cluster'
  | 'bounce'
  | 'drill'
  | 'heavy'
  | 'roller'
  | 'airstrike';

export interface GameSettings {
  player1Name: string;
  player2Name: string;
  opponentMode: 'human' | 'ai';
  mapSeed: string;
  mapPreset: string;
  turnTime: number; // 0 表示无限
  initialHealth: number;
  windStrength: number; // 0~3
  movementFuel: number;
  screenShake: boolean;
  musicVolume: number;
  sfxVolume: number;
  showTrajectory: boolean;
  reducedMotion: boolean;
}

export type GamePhase =
  | 'GAME_START'
  | 'TURN_START'
  | 'PLAYER_CONTROL'
  | 'PROJECTILE_FLYING'
  | 'EXPLOSION'
  | 'DAMAGE_RESOLUTION'
  | 'TERRAIN_SETTLING'
  | 'TURN_END'
  | 'GAME_OVER'
  | 'PAUSED';

export interface WindState {
  value: number; // 可正可负
  displayStrength: number; // 0~3
}

export interface MissionStats {
  totalRounds: number;
  gamesPlayed: number;
  matchWins: [number, number];
  winnerIndex: number; // -1 表示平局
  isDraw: boolean;
  tanks: Array<{
    name: string;
    damageDealt: number;
    hitCount: number;
    directHitCount: number;
    isAlive: boolean;
  }>;
}
