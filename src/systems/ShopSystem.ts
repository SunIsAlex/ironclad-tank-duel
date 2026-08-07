import { WEAPONS } from '../config/weaponConfig';
import weaponPolicyData from '../models/weapon-policy.json';

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

export interface AIWeaponContext {
  distance: number;
  windStrength: number;
  difficulty: 'normal' | 'elite';
}

interface WeaponPolicyData {
  version: number;
  weaponProfiles: number;
  contexts: string[];
  simulations: number;
  policies: Record<'normal' | 'elite', Record<string, Record<string, number>>>;
}

export const weaponPolicy = weaponPolicyData as WeaponPolicyData;

export function isWeaponPolicyValid(policy: WeaponPolicyData = weaponPolicy): boolean {
  return policy.version === 1 && policy.weaponProfiles === WEAPONS.length &&
    policy.simulations > 100000 && policy.contexts.length === 6;
}

function contextKey(context: AIWeaponContext): string {
  const range = context.distance < 500 ? 'near' : context.distance < 780 ? 'mid' : 'far';
  const wind = Math.abs(context.windStrength) >= 1.5 ? 'windy' : 'calm';
  return `${range}_${wind}`;
}

export function getWeaponWinRate(weaponId: string, context: AIWeaponContext): number {
  if (!isWeaponPolicyValid()) return 0.5;
  return weaponPolicy.policies[context.difficulty][contextKey(context)]?.[weaponId] ?? 0;
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

// 从自对战胜率中选择当前局势下收益最高的可购武器，而不是按价格排序。
export function chooseAIShopItem(
  credits: number,
  ammo: Record<string, number>,
  context: AIWeaponContext = { distance: 650, windStrength: 0, difficulty: 'normal' }
): string | null {
  const candidates = SHOP_ITEMS.filter((item) => {
    const weapon = WEAPONS.find((candidate) => candidate.id === item.weaponId)!;
    return credits >= item.price && (ammo[item.weaponId] ?? 0) < weapon.ammo * 3;
  });
  if (candidates.length === 0) return null;
  return candidates.reduce((best, item) => {
    const stockPenalty = (ammo[item.weaponId] ?? 0) > 0 ? 0.08 : 0;
    const score = getWeaponWinRate(item.weaponId, context) - stockPenalty;
    const bestPenalty = (ammo[best.weaponId] ?? 0) > 0 ? 0.08 : 0;
    const bestScore = getWeaponWinRate(best.weaponId, context) - bestPenalty;
    return score > bestScore ? item : best;
  }).weaponId;
}

export function chooseAICombatWeapon(
  ammo: Record<string, number>,
  context: AIWeaponContext
): string {
  const available = WEAPONS.filter((weapon) => ammo[weapon.id] === -1 || (ammo[weapon.id] ?? 0) > 0);
  return available.reduce((best, weapon) =>
    getWeaponWinRate(weapon.id, context) > getWeaponWinRate(best.id, context) ? weapon : best
  ).id;
}
