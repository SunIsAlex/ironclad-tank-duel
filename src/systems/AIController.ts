import type { Tank, WindState } from '../types';
import { POWER_RANGE, TANK_CONFIG, WORLD_CONFIG } from '../config/gameConfig';
import { weaponRegistry } from '../weapons/WeaponRegistry';
import { angleToVector, clamp } from '../utils/math';
import { predictOfflineShot } from './OfflineAIModel';

// AI 使用的是“粗略心算”而不是与游戏完全相同的精确弹道求解器。
// 较大的候选间隔和感知/操作误差会让它大致瞄准目标，但不会稳定直击。
export const AI_AIM_CONFIG = {
  angleStep: 4,
  powerStep: 25,
  simulationStep: 1 / 20,
  maxWindReadingError: 0.45,
  minAngleError: 3.5,
  maxAngleError: 6,
  minPowerError: 35,
  maxPowerError: 70,
} as const;

export interface AIShotPlan {
  angle: number;
  power: number;
  missDistance: number;
}

export interface AITerrain {
  worldWidth: number;
  worldHeight: number;
  isSolid(x: number, y: number): boolean;
}

// 用低精度弹道估算候选射击。AI 会读错一些风力，并在执行角度、力度时产生
// 随距离增长的误差，效果更接近玩家观察轨迹后凭经验瞄准。
export function planAIShot(
  shooter: Tank,
  target: Tank,
  wind: WindState,
  terrain: AITerrain,
  random: () => number = Math.random,
  weaponId = 'basic_shell'
): AIShotPlan {
  const weapon = weaponRegistry.get(weaponId);
  const targetX = target.x;
  const targetY = target.y - TANK_CONFIG.bodyHeight * 0.5;
  const distanceRatio = clamp(Math.abs(targetX - shooter.x) / (terrain.worldWidth * 0.55), 0, 1);
  const perceivedWind = wind.value + (random() - 0.5) * 2 * AI_AIM_CONFIG.maxWindReadingError;
  const shootsRight = targetX >= shooter.x;
  const horizontalDirection = shootsRight ? 1 : -1;
  const minAngle = shootsRight ? 18 : 100;
  const maxAngle = shootsRight ? 80 : 162;
  let best: AIShotPlan = {
    angle: shootsRight ? 45 : 135,
    power: 500,
    missDistance: Number.POSITIVE_INFINITY,
  };

  const evaluate = (angle: number, power: number): number => {
    const direction = angleToVector(angle);
    let x = shooter.x + direction.x * 30;
    let y = shooter.y - 6 + direction.y * 30;
    let vx = direction.x * power * weapon.projectileSpeedMultiplier;
    let vy = direction.y * power * weapon.projectileSpeedMultiplier;
    let nearest = Math.hypot(x - targetX, y - targetY);
    const dt = AI_AIM_CONFIG.simulationStep;

    for (let time = 0; time < 6; time += dt) {
      vx += perceivedWind * WORLD_CONFIG.windScale * weapon.windMultiplier * dt;
      vy += WORLD_CONFIG.gravity * weapon.gravityMultiplier * dt;
      x += vx * dt;
      y += vy * dt;
      nearest = Math.min(nearest, Math.hypot(x - targetX, y - targetY));
      if (x < 0 || x > terrain.worldWidth || y > terrain.worldHeight || terrain.isSolid(x, y)) break;
    }
    return nearest;
  };

  const prediction = predictOfflineShot(
    Math.abs(targetX - shooter.x),
    (shooter.y - 6) - targetY,
    perceivedWind * horizontalDirection
  );
  if (prediction) {
    const angle = shootsRight ? prediction.elevation : 180 - prediction.elevation;
    // 模型由基础弹道训练；按武器速度与重力做近似换算，保留小模型的不完美。
    const adjustedPower = clamp(
      prediction.power * Math.sqrt(weapon.gravityMultiplier) / weapon.projectileSpeedMultiplier,
      POWER_RANGE.min,
      POWER_RANGE.max
    );
    best = { angle, power: adjustedPower, missDistance: evaluate(angle, adjustedPower) };
  } else {
    // 权重损坏或版本不兼容时仍可进行游戏；仅回退路径使用低精度搜索。
    for (let angle = minAngle; angle <= maxAngle; angle += AI_AIM_CONFIG.angleStep) {
      for (let power = POWER_RANGE.min; power <= POWER_RANGE.max; power += AI_AIM_CONFIG.powerStep) {
        const nearest = evaluate(angle, power);
        if (nearest < best.missDistance) best = { angle, power, missDistance: nearest };
      }
    }
  }

  // 远距离更难稳定控制炮管和蓄力；近距离仍保留足够威胁。
  const angleErrorLimit = AI_AIM_CONFIG.minAngleError +
    (AI_AIM_CONFIG.maxAngleError - AI_AIM_CONFIG.minAngleError) * distanceRatio;
  const powerErrorLimit = AI_AIM_CONFIG.minPowerError +
    (AI_AIM_CONFIG.maxPowerError - AI_AIM_CONFIG.minPowerError) * distanceRatio;
  const angleError = (random() - 0.5) * 2 * angleErrorLimit;
  const powerError = (random() - 0.5) * 2 * powerErrorLimit;
  return {
    angle: clamp(best.angle + angleError, minAngle, maxAngle),
    power: clamp(best.power + powerError, POWER_RANGE.min, POWER_RANGE.max),
    missDistance: best.missDistance,
  };
}
