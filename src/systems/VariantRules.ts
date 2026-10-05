import { SHOP_ITEMS, type ShopTier } from './ShopSystem';

// 玩法模式中与渲染无关的纯规则，便于单元测试与联机确定性推演。

export const LAVA_DAMAGE_PER_TURN = 14;
/** 坦克履带底部低于熔岩面超过该深度才算浸没，避免贴边时被误伤。 */
export const LAVA_SUBMERGE_DEPTH = 4;

export interface LavaPlan {
  /** 第 1 回合的熔岩面（世界 Y，越大越低） */
  startLevel: number;
  /** 最后一回合的熔岩面 */
  endLevel: number;
  maxTurns: number;
}

/**
 * 从开局地形规划熔岩上涨：起点恰在最深谷底之下，终点淹没约 55% 的高差，
 * 最高的山脊始终安全，玩家只要及时转移就能存活。
 */
export function planLava(heightMap: ArrayLike<number>, maxTurns: number): LavaPlan {
  let highest = Number.POSITIVE_INFINITY;
  let lowest = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < heightMap.length; i++) {
    const y = heightMap[i];
    if (y < highest) highest = y;
    if (y > lowest) lowest = y;
  }
  if (!Number.isFinite(highest) || !Number.isFinite(lowest)) {
    return { startLevel: 0, endLevel: 0, maxTurns: Math.max(1, maxTurns) };
  }
  const range = Math.max(40, lowest - highest);
  return {
    startLevel: lowest + 2,
    endLevel: highest + range * 0.45,
    maxTurns: Math.max(1, maxTurns),
  };
}

export function lavaLevelForRound(plan: LavaPlan, round: number): number {
  const steps = Math.max(1, plan.maxTurns - 1);
  const t = Math.max(0, Math.min(1, (round - 1) / steps));
  return plan.startLevel + (plan.endLevel - plan.startLevel) * t;
}

export function isSubmergedInLava(tankY: number, lavaLevel: number): boolean {
  return tankY - lavaLevel > LAVA_SUBMERGE_DEPTH;
}

const SUPPLY_TIER_WEIGHTS: Record<ShopTier, number> = {
  field: 40,
  advanced: 32,
  elite: 20,
  prototype: 8,
};

/** 军火狂欢空投：按商店档位加权，原型武器稀有但可能出现。 */
export function pickSupplyDrop(random: () => number): string {
  const weighted = SHOP_ITEMS.map((item) => ({
    id: item.weaponId,
    weight: SUPPLY_TIER_WEIGHTS[item.tier] / SHOP_ITEMS.filter((other) => other.tier === item.tier).length,
  }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = random() * total;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll < 0) return item.id;
  }
  return weighted[weighted.length - 1].id;
}

/** 将设置中的回合限时与模式上限合并；0 代表无限。 */
export function capTurnTime(settingTime: number, cap: number): number {
  if (cap <= 0) return settingTime;
  return settingTime > 0 ? Math.min(settingTime, cap) : cap;
}
