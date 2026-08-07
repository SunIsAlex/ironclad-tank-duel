import { describe, expect, it } from 'vitest';
import { createTank } from '../src/entities/Tank';
import { AI_AIM_CONFIG, planAIShot } from '../src/systems/AIController';
import {
  isOfflineAIModelValid,
  offlineAIModel,
  predictOfflineShot,
} from '../src/systems/OfflineAIModel';

const flatTerrain = {
  worldWidth: 1600,
  worldHeight: 720,
  isSolid: (_x: number, y: number) => y >= 500,
};

describe('AI 弹道规划', () => {
  it('加载经过训练且适合浏览器离线运行的小模型', () => {
    expect(isOfflineAIModelValid()).toBe(true);
    expect(offlineAIModel.trainedSamples).toBe(1800);
    const parameterCount = offlineAIModel.w1.length + offlineAIModel.b1.length +
      offlineAIModel.w2.length + offlineAIModel.b2.length;
    expect(parameterCount).toBeLessThan(256);
  });

  it('小模型根据距离、高差和风力输出有效且不同的决策', () => {
    const near = predictOfflineShot(350, 0, 0);
    const far = predictOfflineShot(900, 80, -2);

    expect(near).not.toBeNull();
    expect(far).not.toBeNull();
    expect(near!.elevation).toBeGreaterThanOrEqual(18);
    expect(far!.elevation).toBeLessThanOrEqual(80);
    expect(near!.power).toBeGreaterThanOrEqual(150);
    expect(far!.power).toBeLessThanOrEqual(820);
    expect(Math.abs(far!.power - near!.power)).toBeGreaterThan(50);
  });

  it('能在无风平地上找到接近目标的射击方案', () => {
    const shooter = createTank('ai', 1, 'AI', 1200, 500, 100, 220, 'basic_shell');
    const target = createTank('human', 0, '玩家', 400, 500, 100, 220, 'basic_shell');
    const plan = planAIShot(shooter, target, { value: 0, displayStrength: 0 }, flatTerrain, () => 0.5);

    expect(plan.angle).toBeGreaterThan(90);
    expect(plan.angle).toBeLessThan(180);
    expect(plan.power).toBeGreaterThanOrEqual(150);
    expect(plan.power).toBeLessThanOrEqual(820);
    expect(plan.missDistance).toBeLessThan(60);
  });

  it('目标在右侧时选择朝右的炮管角度', () => {
    const shooter = createTank('ai', 1, 'AI', 300, 500, 100, 220, 'basic_shell');
    const target = createTank('human', 0, '玩家', 1050, 500, 100, 220, 'basic_shell');
    const plan = planAIShot(shooter, target, { value: 1.5, displayStrength: 2 }, flatTerrain, () => 0.5);

    expect(plan.angle).toBeGreaterThan(0);
    expect(plan.angle).toBeLessThan(90);
    expect(plan.missDistance).toBeLessThan(65);
  });

  it('会把风力判断和操作误差加入射击，而不是每次输出同一个精确解', () => {
    const shooter = createTank('ai', 1, 'AI', 1200, 500, 100, 220, 'basic_shell');
    const target = createTank('human', 0, '玩家', 400, 500, 100, 220, 'basic_shell');
    const lowRoll = planAIShot(shooter, target, { value: 2, displayStrength: 2 }, flatTerrain, () => 0);
    const highRoll = planAIShot(shooter, target, { value: 2, displayStrength: 2 }, flatTerrain, () => 1);

    expect(Math.abs(highRoll.angle - lowRoll.angle)).toBeGreaterThanOrEqual(AI_AIM_CONFIG.minAngleError);
    expect(Math.abs(highRoll.power - lowRoll.power)).toBeGreaterThanOrEqual(AI_AIM_CONFIG.minPowerError);
    expect(lowRoll.angle).toBeGreaterThanOrEqual(100);
    expect(highRoll.angle).toBeLessThanOrEqual(162);
    expect(lowRoll.power).toBeGreaterThanOrEqual(150);
    expect(highRoll.power).toBeLessThanOrEqual(820);
  });
});
