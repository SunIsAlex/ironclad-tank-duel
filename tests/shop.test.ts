import { describe, expect, it } from 'vitest';
import {
  awardRoundCredits,
  chooseAIShopItem,
  createBasicLoadout,
  purchaseWeapon,
  ROUND_CREDIT_INCOME,
  WINNER_CREDIT_BONUS,
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
    expect(result.credits).toBe(200);
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

  it('AI 会按预算选择可购买武器', () => {
    expect(chooseAIShopItem(700, createBasicLoadout())).toBe('micro_cluster');
    expect(chooseAIShopItem(400, createBasicLoadout())).toBeNull();
  });
});
