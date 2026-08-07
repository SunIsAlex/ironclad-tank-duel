import type { Tank, WindState, WormholePair } from '../types';
import { POWER_RANGE, TANK_CONFIG, WORLD_CONFIG } from '../config/gameConfig';
import { weaponRegistry } from '../weapons/WeaponRegistry';
import { angleToVector, clamp, segmentCircleHit } from '../utils/math';
import { predictOfflineShot } from './OfflineAIModel';
import { predictEliteShot } from './EliteAIModel';
import { predictPortalShot } from './PortalAIModel';

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

export const ELITE_AI_AIM_CONFIG = {
  maxWindReadingError: 0.05,
  minAngleError: 0.35,
  maxAngleError: 0.9,
  minPowerError: 3,
  maxPowerError: 10,
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
  weaponId = 'basic_shell',
  difficulty: 'normal' | 'elite' = 'normal',
  wormholes: WormholePair | null = null
): AIShotPlan {
  const weapon = weaponRegistry.get(weaponId);
  const aimConfig = difficulty === 'elite' ? ELITE_AI_AIM_CONFIG : AI_AIM_CONFIG;
  const targetX = target.x;
  const targetY = target.y - TANK_CONFIG.bodyHeight * 0.5;
  const distanceRatio = clamp(Math.abs(targetX - shooter.x) / (terrain.worldWidth * 0.55), 0, 1);
  const perceivedWind = wind.value + (random() - 0.5) * 2 * aimConfig.maxWindReadingError;
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
    let portalCooldown = 0;
    const dt = AI_AIM_CONFIG.simulationStep;

    for (let time = 0; time < 6; time += dt) {
      const previousX = x;
      const previousY = y;
      vx += perceivedWind * WORLD_CONFIG.windScale * weapon.windMultiplier * dt;
      vy += WORLD_CONFIG.gravity * weapon.gravityMultiplier * dt;
      x += vx * dt;
      y += vy * dt;
      portalCooldown = Math.max(0, portalCooldown - dt);
      if (wormholes && portalCooldown <= 0) {
        const routes = [
          { entry: wormholes.blue, exit: wormholes.red },
          { entry: wormholes.red, exit: wormholes.blue },
        ];
        for (const route of routes) {
          if (!segmentCircleHit(previousX, previousY, x, y, route.entry.x, route.entry.y, route.entry.radius + 4)) continue;
          const speed = Math.hypot(vx, vy) || 1;
          vx = -vx;
          vy = -vy;
          const padding = route.exit.radius + 11;
          x = route.exit.x + (vx / speed) * padding;
          y = route.exit.y + (vy / speed) * padding;
          portalCooldown = 0.28;
          break;
        }
      }
      nearest = Math.min(nearest, Math.hypot(x - targetX, y - targetY));
      if (x < 0 || x > terrain.worldWidth || y > terrain.worldHeight || terrain.isSolid(x, y)) break;
    }
    return nearest;
  };

  const distance = Math.abs(targetX - shooter.x);
  const heightUp = (shooter.y - 6) - targetY;
  const windAlong = perceivedWind * horizontalDirection;
  const elitePrediction = difficulty === 'elite'
    ? predictEliteShot(distance, heightUp, windAlong, weapon)
    : null;
  const prediction = elitePrediction ?? predictOfflineShot(distance, heightUp, windAlong);
  if (prediction) {
    const angle = shootsRight ? prediction.elevation : 180 - prediction.elevation;
    // 模型由基础弹道训练；按武器速度与重力做近似换算，保留小模型的不完美。
    const adjustedPower = elitePrediction
      ? prediction.power
      : clamp(
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

  // 扩展地图上的远距离超出了旧模型的主要训练区间，用物理模拟做一次
  // 粗粒度全局校正，避免 AI 在大型战场上持续打短。
  if (distance > 1050) {
    for (let angle = minAngle; angle <= maxAngle; angle += 6) {
      for (let power = POWER_RANGE.min; power <= POWER_RANGE.max; power += 40) {
        const nearest = evaluate(angle, power);
        if (nearest < best.missDistance) best = { angle, power, missDistance: nearest };
      }
    }
  }

  // 黑洞存在时对实际传送弹道进行候选搜索。普通 AI 使用较粗粒度，精英
  // AI 搜索更细；两者仍会叠加各自的风力感知和操作误差。
  if (wormholes) {
    if (difficulty === 'elite') {
      const toLocal = (point: { x: number; y: number }): [number, number] => [
        (point.x - shooter.x) * horizontalDirection,
        (shooter.y - 6) - point.y,
      ];
      const [blueX, blueY] = toLocal(wormholes.blue);
      const [redX, redY] = toLocal(wormholes.red);
      const portalPredictions = [
        predictPortalShot(distance, heightUp, windAlong, blueX, blueY, redX, redY, weapon),
        predictPortalShot(distance, heightUp, windAlong, redX, redY, blueX, blueY, weapon),
      ];
      for (const portalPrediction of portalPredictions) {
        if (!portalPrediction) continue;
        const angle = shootsRight ? portalPrediction.elevation : 180 - portalPrediction.elevation;
        const nearest = evaluate(angle, portalPrediction.power);
        if (nearest < best.missDistance) best = { angle, power: portalPrediction.power, missDistance: nearest };
      }
    }
    const angleStep = difficulty === 'elite' ? 2 : 4;
    const powerStep = difficulty === 'elite' ? 12 : 25;
    for (let angle = minAngle; angle <= maxAngle; angle += angleStep) {
      for (let power = POWER_RANGE.min; power <= POWER_RANGE.max; power += powerStep) {
        const nearest = evaluate(angle, power);
        if (nearest < best.missDistance) best = { angle, power, missDistance: nearest };
      }
    }
  }

  // 远距离更难稳定控制炮管和蓄力；近距离仍保留足够威胁。
  const angleErrorLimit = aimConfig.minAngleError +
    (aimConfig.maxAngleError - aimConfig.minAngleError) * distanceRatio;
  const powerErrorLimit = aimConfig.minPowerError +
    (aimConfig.maxPowerError - aimConfig.minPowerError) * distanceRatio;
  const angleError = (random() - 0.5) * 2 * angleErrorLimit;
  const powerError = (random() - 0.5) * 2 * powerErrorLimit;
  const aiPowerMax = distance > 1050 ? POWER_RANGE.max : 820;
  return {
    angle: clamp(best.angle + angleError, minAngle, maxAngle),
    power: clamp(best.power + powerError, POWER_RANGE.min, aiPowerMax),
    missDistance: best.missDistance,
  };
}
