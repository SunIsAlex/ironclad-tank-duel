import type { GameVariantId } from '../types';
import type { BattleThemeId } from './battleThemes';

// 玩法模式：在经典五局三胜规则上叠加修正项。所有随机效果都使用对局
// 种子随机数，联机双方按相同顺序推进即可保持一致。

export interface GameVariant {
  id: GameVariantId;
  displayName: string;
  englishName: string;
  tagline: string;
  rules: string[];
  /** 24×24 内联 SVG 路径（stroke 绘制） */
  icon: string;
  accent: string;
  theme: BattleThemeId;
  damageMultiplier: number;
  blastRadiusMultiplier: number;
  terrainDamageMultiplier: number;
  gravityMultiplier: number;
  fuelMultiplier: number;
  maxTurnsPerGame: number;
  /** 回合限时上限（秒）；0 表示沿用设置 */
  turnTimeCap: number;
  shopEnabled: boolean;
  /** 每回合开始向操作方空投一件随机特殊武器 */
  supplyDrops: boolean;
  risingLava: boolean;
  wormholeChance: number;
}

const CLASSIC: GameVariant = {
  id: 'classic',
  displayName: '经典对决',
  englishName: 'CLASSIC',
  tagline: '五局三胜 · 局间军械商店',
  rules: ['每局 10 回合，超时按血量裁决', '胜者继承剩余血量', '随机宝箱与双向黑洞'],
  icon: '<path d="M4 17h16M6 17l1.5-4h9L18 17M9 13V10h6v3M12 10l6-4"/><circle cx="8" cy="19" r="1.4"/><circle cx="16" cy="19" r="1.4"/>',
  accent: '#36ddff',
  theme: 'nebula',
  damageMultiplier: 1,
  blastRadiusMultiplier: 1,
  terrainDamageMultiplier: 1,
  gravityMultiplier: 1,
  fuelMultiplier: 1,
  maxTurnsPerGame: 10,
  turnTimeCap: 0,
  shopEnabled: true,
  supplyDrops: false,
  risingLava: false,
  wormholeChance: 0.3,
};

export const GAME_VARIANTS: GameVariant[] = [
  CLASSIC,
  {
    ...CLASSIC,
    id: 'blitz',
    displayName: '闪电战',
    englishName: 'BLITZ',
    tagline: '短局快打 · 伤害 ×1.5',
    rules: ['每局仅 6 回合', '每回合限时 20 秒', '所有伤害 ×1.5'],
    icon: '<path d="M13 2 5 13h6l-1 9 8-11h-6z"/>',
    accent: '#ffd35c',
    theme: 'storm',
    damageMultiplier: 1.5,
    maxTurnsPerGame: 6,
    turnTimeCap: 20,
  },
  {
    ...CLASSIC,
    id: 'arsenal',
    displayName: '军火狂欢',
    englishName: 'ARSENAL',
    tagline: '每回合空投随机武器',
    rules: ['关闭商店', '每回合获得一件随机特殊武器', '空投武器在本局内累积'],
    icon: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M4 13h16M12 9v11M8 9c-2-3 1-5 4 0 3-5 6-3 4 0"/>',
    accent: '#ff4fd8',
    theme: 'neon',
    shopEnabled: false,
    supplyDrops: true,
  },
  {
    ...CLASSIC,
    id: 'lava',
    displayName: '熔岩上涨',
    englishName: 'RISING LAVA',
    tagline: '岩浆逐回合上涨，抢占高地',
    rules: ['熔岩每回合上涨', '浸没时每回合 -14 生命', '移动燃料 ×1.6'],
    icon: '<path d="M3 17c2-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0M3 21c2-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0M8 13l4-9 4 9"/>',
    accent: '#ff6a1f',
    theme: 'volcano',
    fuelMultiplier: 1.6,
    risingLava: true,
  },
  {
    ...CLASSIC,
    id: 'moon',
    displayName: '月面重力',
    englishName: 'LOW GRAVITY',
    tagline: '重力 ×0.45 · 超远抛物线',
    rules: ['重力降为 45%', '风力影响相对更强', '坠落更轻柔'],
    icon: '<path d="M19 14.5A8 8 0 1 1 9.5 5a6.5 6.5 0 0 0 9.5 9.5z"/><circle cx="17" cy="5" r=".8"/><circle cx="20" cy="9" r=".6"/>',
    accent: '#a9c8ff',
    theme: 'lunar',
    gravityMultiplier: 0.45,
  },
  {
    ...CLASSIC,
    id: 'mayhem',
    displayName: '爆破狂欢',
    englishName: 'MAYHEM',
    tagline: '超大爆炸 · 地形崩塌',
    rules: ['爆炸范围 ×1.4', '地形破坏 ×1.8', '黑洞出现率 75%'],
    icon: '<path d="M12 2l2 5 5-2-2 5 5 2-5 2 2 5-5-2-2 5-2-5-5 2 2-5-5-2 5-2-2-5 5 2z"/>',
    accent: '#ffb05c',
    theme: 'dusk',
    blastRadiusMultiplier: 1.4,
    terrainDamageMultiplier: 1.8,
    wormholeChance: 0.75,
  },
];

export function getGameVariant(id: string | undefined): GameVariant {
  return GAME_VARIANTS.find((variant) => variant.id === id) ?? CLASSIC;
}

export function isGameVariantId(id: unknown): id is GameVariantId {
  return typeof id === 'string' && GAME_VARIANTS.some((variant) => variant.id === id);
}

/** 训练场始终使用经典物理，不受玩法修正影响。 */
export const TRAINING_VARIANT = CLASSIC;

export function variantIconSvg(variant: GameVariant, size = 24): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${variant.icon}</svg>`;
}
