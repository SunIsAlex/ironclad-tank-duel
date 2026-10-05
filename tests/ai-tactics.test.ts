import { describe, expect, it } from 'vitest';
import { createTank } from '../src/entities/Tank';
import { chooseAIMove, chooseAITacticalWeapon, reachableX, type AITacticsTerrain } from '../src/systems/AITactics';
import { createBasicLoadout } from '../src/systems/ShopSystem';

function terrainFrom(surface: (x: number) => number, worldWidth = 1600): AITacticsTerrain {
  return {
    worldWidth,
    worldHeight: 900,
    surfaceY: surface,
    isSolid: (x, y) => y >= surface(x),
  };
}

const flat = terrainFrom(() => 600);
// 左侧低谷，右侧以缓坡（斜率 0.5）连到高台
const valley = terrainFrom((x) => (x < 600 ? 600 : x < 900 ? 600 - (x - 600) * 0.5 : 450));
// 坦克正前方的一堵高墙
const wall = terrainFrom((x) => (x >= 640 && x <= 680 ? 150 : 600));

function tankAt(id: string, index: number, x: number, terrain: AITacticsTerrain, fuel = 220) {
  const tank = createTank(id, index, id, x, terrain.surfaceY(x), 100, fuel, 'basic_shell');
  tank.ammo = createBasicLoadout();
  return tank;
}

const still = { value: 0, displayStrength: 0 };

describe('AI 移动', () => {
  it('可达范围与玩家移动规则一致：缓坡可上，陡墙挡路', () => {
    expect(reachableX(valley, 500, 1, 300)).toBe(800);
    expect(reachableX(wall, 600, 1, 300)).toBeLessThan(645);
  });

  it('熔岩即将淹没时向高处撤离', () => {
    const self = tankAt('ai', 1, 500, valley, 352);
    const target = tankAt('p1', 0, 1300, valley);
    for (const difficulty of ['normal', 'elite'] as const) {
      const plan = chooseAIMove({
        self, target, wind: still, terrain: valley, difficulty,
        lavaLevel: 640, nextLavaLevel: 590, random: () => 0.5,
      });
      expect(plan.reason).toBe('lava');
      expect(valley.surfaceY(plan.targetX!)).toBeLessThan(586);
    }
  });

  it('射界通畅且没有威胁时普通 AI 留在原地', () => {
    const self = tankAt('ai', 1, 1200, flat);
    const target = tankAt('p1', 0, 500, flat);
    const plan = chooseAIMove({ self, target, wind: still, terrain: flat, difficulty: 'normal', random: () => 0.5 });
    expect(plan.targetX).toBeNull();
  });

  it('精英 AI 会躲开对手上一发的落点', () => {
    const self = tankAt('ai', 1, 1200, flat);
    const target = tankAt('p1', 0, 500, flat);
    const plan = chooseAIMove({
      self, target, wind: still, terrain: flat, difficulty: 'elite',
      threat: { x: 1210, y: 600 }, random: () => 0.5,
    });
    expect(plan.reason).toBe('dodge');
    expect(Math.abs(plan.targetX! - 1210)).toBeGreaterThan(60);
  });

  it('离对手过近时拉开距离', () => {
    const self = tankAt('ai', 1, 800, flat);
    const target = tankAt('p1', 0, 720, flat);
    const plan = chooseAIMove({ self, target, wind: still, terrain: flat, difficulty: 'normal', random: () => 0.5 });
    expect(plan.reason).toBe('spacing');
    expect(plan.targetX!).toBeGreaterThan(800);
  });
});

describe('AI 选择武器', () => {
  it('基础炮弹足以击毁残血目标时不浪费特殊弹药', () => {
    const self = tankAt('ai', 1, 1200, flat);
    const target = tankAt('p1', 0, 700, flat);
    target.health = 20;
    self.ammo.heavy_impact = 3;
    self.ammo.singularity_bomb = 1;
    const choice = chooseAITacticalWeapon({ self, target, wind: still, terrain: flat, difficulty: 'elite' });
    expect(choice).toEqual({ weaponId: 'basic_shell', reason: 'finisher' });
  });

  it('近距离不使用会波及自己的大爆炸武器', () => {
    const self = tankAt('ai', 1, 800, flat);
    const target = tankAt('p1', 0, 690, flat);
    self.ammo.singularity_bomb = 1;
    self.ammo.aurora_needle = 2;
    const choice = chooseAITacticalWeapon({ self, target, wind: still, terrain: flat, difficulty: 'elite', urgency: 1 });
    expect(choice.weaponId).not.toBe('singularity_bomb');
  });

  it('目标被掩体挡住时改用空袭类武器', () => {
    const self = tankAt('ai', 1, 600, wall);
    const target = tankAt('p1', 0, 1300, wall);
    self.ammo.sky_coordinates = 3;
    self.ammo.triple_scatter = 6;
    const choice = chooseAITacticalWeapon({ self, target, wind: still, terrain: wall, difficulty: 'elite', urgency: 0.5 });
    expect(choice.weaponId).toBe('sky_coordinates');
    expect(choice.reason).toBe('cover');
  });

  it('强风下普通 AI 偏好受风影响小的武器', () => {
    const self = tankAt('ai', 1, 1300, flat);
    const target = tankAt('p1', 0, 500, flat);
    self.ammo.aurora_needle = 4;
    const choice = chooseAITacticalWeapon({
      self, target, wind: { value: 3, displayStrength: 3 }, terrain: flat, difficulty: 'normal', urgency: 1, random: () => 0.5,
    });
    expect(choice.weaponId).toBe('aurora_needle');
  });
});
