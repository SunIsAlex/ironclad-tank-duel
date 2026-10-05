import { describe, expect, it } from 'vitest';
import { GAME_VARIANTS, getGameVariant, isGameVariantId } from '../src/config/gameVariants';
import { BATTLE_THEMES } from '../src/config/battleThemes';
import { SHOP_ITEMS } from '../src/systems/ShopSystem';
import {
  capTurnTime,
  isSubmergedInLava,
  lavaLevelForRound,
  pickSupplyDrop,
  planLava,
} from '../src/systems/VariantRules';
import { createRng } from '../src/utils/random';

describe('玩法模式配置', () => {
  it('每种模式都有唯一 id 与已定义的视觉主题', () => {
    const ids = GAME_VARIANTS.map((variant) => variant.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const variant of GAME_VARIANTS) {
      expect(BATTLE_THEMES[variant.theme]).toBeDefined();
      expect(variant.maxTurnsPerGame).toBeGreaterThan(0);
      expect(variant.rules.length).toBeGreaterThan(0);
    }
  });

  it('未知或缺失的模式回退为经典对决', () => {
    expect(getGameVariant('nope').id).toBe('classic');
    expect(getGameVariant(undefined).id).toBe('classic');
    expect(isGameVariantId('lava')).toBe(true);
    expect(isGameVariantId('nope')).toBe(false);
  });
});

describe('熔岩上涨', () => {
  const heightMap = Int32Array.from({ length: 200 }, (_, x) => 500 + Math.round(Math.sin(x / 20) * 100));

  it('第 1 回合熔岩低于最深谷底，不会立即灼烧任何坦克', () => {
    const plan = planLava(heightMap, 10);
    const level = lavaLevelForRound(plan, 1);
    for (const y of heightMap) expect(isSubmergedInLava(y, level)).toBe(false);
  });

  it('熔岩逐回合单调上涨，最高山脊始终安全', () => {
    const plan = planLava(heightMap, 10);
    let previous = Number.POSITIVE_INFINITY;
    for (let round = 1; round <= 12; round++) {
      const level = lavaLevelForRound(plan, round);
      expect(level).toBeLessThanOrEqual(previous);
      previous = level;
    }
    const highest = Math.min(...heightMap);
    expect(isSubmergedInLava(highest, lavaLevelForRound(plan, 10))).toBe(false);
    const lowest = Math.max(...heightMap);
    expect(isSubmergedInLava(lowest, lavaLevelForRound(plan, 10))).toBe(true);
  });
});

describe('军火狂欢空投', () => {
  it('只投放商店中的特殊武器，且同种子结果一致', () => {
    const shopIds = new Set(SHOP_ITEMS.map((item) => item.weaponId));
    const a = createRng('drop-seed');
    const b = createRng('drop-seed');
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const id = pickSupplyDrop(a.next);
      expect(shopIds.has(id)).toBe(true);
      expect(pickSupplyDrop(b.next)).toBe(id);
      seen.add(id);
    }
    // 加权随机仍应覆盖大部分武器
    expect(seen.size).toBeGreaterThan(SHOP_ITEMS.length - 3);
  });
});

describe('回合限时', () => {
  it('模式上限只收紧不放宽', () => {
    expect(capTurnTime(0, 20)).toBe(20);
    expect(capTurnTime(45, 20)).toBe(20);
    expect(capTurnTime(15, 20)).toBe(15);
    expect(capTurnTime(30, 0)).toBe(30);
    expect(capTurnTime(0, 0)).toBe(0);
  });
});
