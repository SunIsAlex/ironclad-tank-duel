import { WEAPONS } from '../config/weaponConfig';

export const ROUND_CREDIT_INCOME = 700;
export const WINNER_CREDIT_BONUS = 350;

export interface ShopItem {
  weaponId: string;
  price: number;
}

export const SHOP_ITEMS: ShopItem[] = [
  { weaponId: 'bounce_shot', price: 450 },
  { weaponId: 'triple_scatter', price: 500 },
  { weaponId: 'air_split', price: 550 },
  { weaponId: 'stone_runner', price: 600 },
  { weaponId: 'drill_shot', price: 650 },
  { weaponId: 'micro_cluster', price: 700 },
  { weaponId: 'tide_stream', price: 750 },
  { weaponId: 'sky_coordinates', price: 800 },
  { weaponId: 'aurora_needle', price: 850 },
  { weaponId: 'heavy_impact', price: 900 },
];

export interface PurchaseResult {
  success: boolean;
  credits: number;
  ammo: Record<string, number>;
  reason?: 'unknown' | 'insufficient_credits' | 'ammo_full';
}

export function createBasicLoadout(): Record<string, number> {
  return Object.fromEntries(WEAPONS.map((weapon) => [weapon.id, weapon.id === 'basic_shell' ? -1 : 0]));
}

export function awardRoundCredits(credits: number, wonPreviousGame: boolean): number {
  return credits + ROUND_CREDIT_INCOME + (wonPreviousGame ? WINNER_CREDIT_BONUS : 0);
}

export function purchaseWeapon(
  credits: number,
  ammo: Record<string, number>,
  weaponId: string
): PurchaseResult {
  const item = SHOP_ITEMS.find((candidate) => candidate.weaponId === weaponId);
  const weapon = WEAPONS.find((candidate) => candidate.id === weaponId);
  if (!item || !weapon || weapon.ammo <= 0) {
    return { success: false, credits, ammo, reason: 'unknown' };
  }
  if (credits < item.price) {
    return { success: false, credits, ammo, reason: 'insufficient_credits' };
  }
  const currentAmmo = Math.max(0, ammo[weaponId] ?? 0);
  if (currentAmmo >= weapon.ammo * 3) {
    return { success: false, credits, ammo, reason: 'ammo_full' };
  }
  return {
    success: true,
    credits: credits - item.price,
    ammo: { ...ammo, [weaponId]: currentAmmo + weapon.ammo },
  };
}

// AI 每局只购买一组：优先考虑高伤害装备，同时保留预算不足时的廉价选择。
export function chooseAIShopItem(credits: number, ammo: Record<string, number>): string | null {
  const preference = [
    'heavy_impact',
    'aurora_needle',
    'micro_cluster',
    'triple_scatter',
    'drill_shot',
    'bounce_shot',
  ];
  return preference.find((weaponId) => {
    const item = SHOP_ITEMS.find((candidate) => candidate.weaponId === weaponId)!;
    const weapon = WEAPONS.find((candidate) => candidate.id === weaponId)!;
    return credits >= item.price && (ammo[weaponId] ?? 0) < weapon.ammo * 3;
  }) ?? null;
}

