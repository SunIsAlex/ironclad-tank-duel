import { describe, expect, it } from 'vitest';
import { createTank } from '../src/entities/Tank';
import { AI_AIM_CONFIG, planAIShot } from '../src/systems/AIController';
import {
  isOfflineAIModelValid,
  offlineAIModel,
  predictOfflineShot,
} from '../src/systems/OfflineAIModel';
import {
  eliteAIModel,
  isEliteAIModelValid,
  predictEliteShot,
} from '../src/systems/EliteAIModel';
import { getWeaponById } from '../src/config/weaponConfig';
import { isPortalAIModelValid, portalAIModel, predictPortalShot } from '../src/systems/PortalAIModel';

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

  it('精英模型由全部武器弹道样本训练且参数规模保持轻量', () => {
    expect(isEliteAIModelValid()).toBe(true);
    expect(eliteAIModel.trainedWeaponProfiles).toBe(11);
    expect(eliteAIModel.trainedSamples).toBe(3200);
    const parameterCount = eliteAIModel.w1.length + eliteAIModel.b1.length +
      eliteAIModel.w2.length + eliteAIModel.b2.length;
    expect(parameterCount).toBeLessThan(400);
  });

  it('精英模型会根据不同武器和风向给出不同力度', () => {
    const heavy = predictEliteShot(760, 20, -2, getWeaponById('heavy_impact'))!;
    const needle = predictEliteShot(760, 20, -2, getWeaponById('aurora_needle'))!;
    const tailwind = predictEliteShot(760, 20, 2, getWeaponById('heavy_impact'))!;
    expect(Math.abs(heavy.power - needle.power)).toBeGreaterThan(80);
    expect(Math.abs(heavy.power - tailwind.power)).toBeGreaterThan(10);
  });

  it('普通与精英难度保持独立的瞄准误差范围', () => {
    const shooter = createTank('ai', 1, 'AI', 1200, 500, 100, 220, 'heavy_impact');
    const target = createTank('human', 0, '玩家', 400, 500, 100, 220, 'basic_shell');
    const normal = planAIShot(shooter, target, { value: 2, displayStrength: 2 }, flatTerrain, () => 1, 'heavy_impact', 'normal');
    const elite = planAIShot(shooter, target, { value: 2, displayStrength: 2 }, flatTerrain, () => 1, 'heavy_impact', 'elite');
    expect(normal.angle).not.toBe(elite.angle);
    expect(normal.missDistance).not.toBe(elite.missDistance);
  });

  it('黑洞射击模型包含入口、出口、风向与武器训练样本', () => {
    expect(isPortalAIModelValid()).toBe(true);
    expect(portalAIModel.trainedSamples).toBe(1400);
    expect(portalAIModel.weaponProfiles).toBeGreaterThanOrEqual(7);
    const prediction = predictPortalShot(
      760, 0, -1.5, 330, 180, 950, 160, getWeaponById('aurora_needle')
    );
    expect(prediction).not.toBeNull();
    expect(prediction!.elevation).toBeGreaterThanOrEqual(18);
    expect(prediction!.power).toBeLessThanOrEqual(820);
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
