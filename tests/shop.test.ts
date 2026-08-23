import { describe, expect, it } from 'vitest';
import {
  awardRoundCredits,
  chooseAICombatWeapon,
  chooseAIShopItem,
  createBasicLoadout,
  purchaseWeapon,
  ROUND_CREDIT_INCOME,
  WINNER_CREDIT_BONUS,
  isWeaponPolicyValid,
  weaponPolicy,
  SHOP_ITEMS,
} from '../src/systems/ShopSystem';

describe('局间武器商店', () => {
  it('开局只有无限基础弹药', () => {
    const ammo = createBasicLoadout();
    expect(ammo.basic_shell).toBe(-1);
    expect(Object.entries(ammo).filter(([id, value]) => id !== 'basic_shell' && value !== 0)).toEqual([]);
  });

  it('双方获得基础点数，上一局胜者额外获得奖励', () => {
    expect(awardRoundCredits(100, false)).toBe(100 + ROUND_CREDIT_INCOME);
    expect(awardRoundCredits(100, true)).toBe(100 + ROUND_CREDIT_INCOME + WINNER_CREDIT_BONUS);
  });

  it('购买武器扣除点数并增加一组弹药', () => {
    const result = purchaseWeapon(700, createBasicLoadout(), 'triple_scatter');
    expect(result.success).toBe(true);
    expect(result.credits).toBe(250);
    expect(result.ammo.triple_scatter).toBe(6);
  });

  it('点数不足时拒绝购买且不修改库存', () => {
    const ammo = createBasicLoadout();
    const result = purchaseWeapon(100, ammo, 'heavy_impact');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('insufficient_credits');
    expect(result.ammo).toBe(ammo);
  });

  it('同类武器达到三组弹药后不能继续囤积', () => {
    const ammo = createBasicLoadout();
    ammo.triple_scatter = 18;
    const result = purchaseWeapon(5000, ammo, 'triple_scatter');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('ammo_full');
    expect(result.credits).toBe(5000);
  });

  it('价格按四档拉开，并允许玩家在即时补给与储蓄重火力之间选择', () => {
    const prices = SHOP_ITEMS.map((item) => item.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(Math.min(...prices)).toBe(300);
    expect(Math.max(...prices)).toBe(4200);
    expect(Math.max(...prices) / Math.min(...prices)).toBeGreaterThanOrEqual(14);
    expect(new Set(SHOP_ITEMS.map((item) => item.tier))).toEqual(
      new Set(['field', 'advanced', 'elite', 'prototype'])
    );
  });

  it('AI 武器策略来自普通与精英 AI 的大量模拟对战', () => {
    expect(isWeaponPolicyValid()).toBe(true);
    expect(weaponPolicy.weaponProfiles).toBe(16);
    expect(weaponPolicy.simulations).toBeGreaterThan(500000);
  });

  it('AI 会按距离和风况选择武器，而不是默认购买最贵武器', () => {
    const ammo = createBasicLoadout();
    expect(chooseAIShopItem(700, ammo, { distance: 380, windStrength: 0, difficulty: 'normal' })).toBe('bounce_shot');
    expect(chooseAIShopItem(1750, ammo, { distance: 380, windStrength: 0, difficulty: 'normal' })).toBe('stone_runner');
    expect(chooseAIShopItem(3000, ammo, { distance: 900, windStrength: 2.5, difficulty: 'elite' })).toBe('aurora_needle');
    expect(chooseAIShopItem(250, createBasicLoadout())).toBeNull();
  });

  it('AI 有低阶弹药时会为明显更强的高阶武器保留点数', () => {
    const ammo = createBasicLoadout();
    ammo.bounce_shot = 4;
    expect(chooseAIShopItem(1750, ammo, {
      distance: 380,
      windStrength: 0,
      difficulty: 'normal',
    })).toBeNull();
    expect(chooseAIShopItem(4200, ammo, {
      distance: 380,
      windStrength: 0,
      difficulty: 'normal',
    })).toBe('singularity_bomb');
  });

  it('AI 开火时也从已有库存中选择条件胜率最高的武器', () => {
    const ammo = createBasicLoadout();
    ammo.heavy_impact = 3;
    ammo.aurora_needle = 4;
    expect(chooseAICombatWeapon(ammo, { distance: 380, windStrength: 0.5, difficulty: 'elite' })).toBe('heavy_impact');
    expect(chooseAICombatWeapon(ammo, { distance: 900, windStrength: 2.5, difficulty: 'elite' })).toBe('aurora_needle');
  });
});
