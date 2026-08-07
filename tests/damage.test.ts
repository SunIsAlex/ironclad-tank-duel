import { describe, it, expect } from 'vitest';
import { DamageSystem } from '../src/systems/DamageSystem';
import { createTank } from '../src/entities/Tank';

describe('爆炸伤害衰减', () => {
  it('距离 0 应获得最大伤害 + 直接命中奖励', () => {
    const ds = new DamageSystem();
    const tank = createTank('t1', 0, 'P1', 100, 100, 100, 200, 'basic_shell');
    const result = ds.applyExplosion({ x: 100, y: 94 }, 50, 40, [tank], 't1', new Set());
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0].damage).toBeGreaterThan(40);
    expect(tank.health).toBeLessThan(100);
  });

  it('距离超过半径不造成伤害', () => {
    const ds = new DamageSystem();
    // 中心点距离坦克中心 (x, y-6) > 半径
    const tank = createTank('t1', 0, 'P1', 1000, 1000, 100, 200, 'basic_shell');
    const result = ds.applyExplosion({ x: 0, y: 0 }, 50, 40, [tank], null, new Set());
    expect(result.targets).toHaveLength(0);
    expect(tank.health).toBe(100);
  });

  it('小爆炸半径的直接命中不会因接触点在坦克外缘而丢失伤害', () => {
    const ds = new DamageSystem();
    const tank = createTank('t1', 0, 'P1', 100, 100, 100, 200, 'aurora_needle');
    // 模拟精确弹在坦克外缘接触：中心距 24.2px，略大于 24px 爆炸半径。
    const result = ds.applyExplosion({ x: 75.8, y: 94 }, 24, 70, [tank], 't1', new Set());
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0].isDirect).toBe(true);
    expect(result.targets[0].damage).toBe(81);
    expect(tank.health).toBe(19);
  });

  it('伤害不可为负', () => {
    const ds = new DamageSystem();
    const tank = createTank('t1', 0, 'P1', 0, 0, 100, 200, 'basic_shell');
    // 爆炸中心远到刚好不命中
    const result = ds.applyExplosion({ x: 1000, y: 1000 }, 50, 40, [tank], null, new Set());
    expect(result.targets).toHaveLength(0);
    expect(tank.health).toBeGreaterThanOrEqual(0);
  });

  it('生命值归零标记为死亡', () => {
    const ds = new DamageSystem();
    const tank = createTank('t1', 0, 'P1', 100, 94, 50, 200, 'basic_shell');
    // 中心命中，足以击杀
    const result = ds.applyExplosion({ x: 100, y: 94 }, 50, 80, [tank], 't1', new Set());
    expect(result.targets[0].killed).toBe(true);
    expect(tank.isAlive).toBe(false);
    expect(tank.health).toBe(0);
  });

  it('同一爆炸不重复对同一坦克结算', () => {
    const ds = new DamageSystem();
    const tank = createTank('t1', 0, 'P1', 100, 94, 100, 200, 'basic_shell');
    const hit = new Set<string>();
    const r1 = ds.applyExplosion({ x: 100, y: 94 }, 50, 30, [tank], null, hit);
    const r2 = ds.applyExplosion({ x: 100, y: 94 }, 50, 30, [tank], null, hit);
    expect(r1.targets).toHaveLength(1);
    expect(r2.targets).toHaveLength(0);
  });
});
