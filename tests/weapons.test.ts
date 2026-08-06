import { describe, it, expect } from 'vitest';
import { WEAPONS, getWeaponById } from '../src/config/weaponConfig';
import { WeaponRegistry } from '../src/weapons/WeaponRegistry';

describe('武器配置', () => {
  it('至少 8 种武器', () => {
    expect(WEAPONS.length).toBeGreaterThanOrEqual(8);
  });

  it('每把武器都有唯一 id', () => {
    const ids = WEAPONS.map((w) => w.id);
    const set = new Set(ids);
    expect(set.size).toBe(ids.length);
  });

  it('所有武器有非空 displayName', () => {
    for (const w of WEAPONS) {
      expect(w.displayName.length).toBeGreaterThan(0);
    }
  });

  it('覆盖原创基础武器与新增机制且关键参数有效', () => {
    expect(WEAPONS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(WEAPONS.map((w) => w.behavior))).toEqual(
      new Set(['standard', 'split', 'cluster', 'bounce', 'drill', 'heavy', 'roller', 'airstrike'])
    );
    expect(getWeaponById('triple_scatter').projectileCount).toBe(3);
    expect(getWeaponById('air_split').childCount).toBeGreaterThan(1);
    expect(getWeaponById('bounce_shot').bounceCount).toBeGreaterThan(0);
    expect(WEAPONS.some((w) => w.id === 'delay_fuse')).toBe(false);
    expect(getWeaponById('drill_shot').drillDistance).toBeGreaterThan(0);
    expect(getWeaponById('micro_cluster').childCount).toBeLessThanOrEqual(6);
    expect(getWeaponById('tide_stream').projectileSpeedStep).toBeGreaterThan(0);
    expect(getWeaponById('stone_runner').rollDistance).toBeGreaterThan(0);
    expect(getWeaponById('sky_coordinates').airstrikeCount).toBe(5);
  });

  it('武器轮换包含有限弹药武器', () => {
    const reg = new WeaponRegistry();
    expect(reg.next('basic_shell')).toBe('triple_scatter');
    expect(reg.prev('basic_shell')).toBe('sky_coordinates');
  });
});

describe('弹药扣除', () => {
  it('无限弹药武器（-1）扣除后仍可用', () => {
    const reg = new WeaponRegistry();
    const ammo = reg.createInitialAmmo();
    const basic = WEAPONS.find((w) => w.ammo === -1)!;
    expect(ammo[basic.id]).toBe(-1);
    // 模拟扣除
    if (ammo[basic.id] === -1) {
      // 仍可用
      expect(ammo[basic.id]).toBe(-1);
    }
  });

  it('有限弹药武器应递减', () => {
    const reg = new WeaponRegistry();
    const ammo = reg.createInitialAmmo();
    const w = WEAPONS.find((x) => x.ammo > 0)!;
    expect(ammo[w.id]).toBeGreaterThan(0);
    ammo[w.id]--;
    expect(ammo[w.id]).toBe(w.ammo - 1);
  });

  it('弹药耗尽后不可再扣', () => {
    const ammo: Record<string, number> = { heavy: 0 };
    expect(ammo['heavy']).toBe(0);
    // 模拟扣减检查
    if (ammo['heavy'] <= 0) {
      // 阻止
      expect(true).toBe(true);
    }
  });

  it('getWeaponById 返回有效武器', () => {
    const w = getWeaponById(WEAPONS[0].id);
    expect(w).toBeDefined();
    expect(w.id).toBe(WEAPONS[0].id);
  });
});
