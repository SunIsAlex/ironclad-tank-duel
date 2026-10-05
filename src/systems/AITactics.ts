import type { Tank, WindState, WormholePair, WeaponDefinition } from '../types';
import { TANK_CONFIG } from '../config/gameConfig';
import { WEAPONS } from '../config/weaponConfig';
import { planAIShot, type AITerrain } from './AIController';
import { getWeaponWinRate, SHOP_ITEMS } from './ShopSystem';

// AI 战术层：在“瞄准”之前决定移动到哪里、使用哪件武器。
// 评估使用无误差的弹道估算（random 固定为 0.5），真正开火时仍由
// planAIShot 叠加各难度的人类化误差。

export interface AITacticsTerrain extends AITerrain {
  surfaceY(x: number): number;
}

export interface AITacticsContext {
  self: Tank;
  target: Tank;
  wind: WindState;
  terrain: AITacticsTerrain;
  difficulty: 'normal' | 'elite';
  wormholes?: WormholePair | null;
  /** 当前与下一回合熔岩面（世界 Y），无熔岩为 null */
  lavaLevel?: number | null;
  nextLavaLevel?: number | null;
  /** 对手上一发的落点，用于规避被修正后的下一发 */
  threat?: { x: number; y: number } | null;
  /** 回合进度 0~1，越接近终局越舍得用稀有弹药 */
  urgency?: number;
  random?: () => number;
}

export type AIMoveReason = 'lava' | 'blocked' | 'dodge' | 'spacing' | 'angle';

export interface AIMovePlan {
  /** null 表示留在原地 */
  targetX: number | null;
  reason: AIMoveReason | null;
}

export const AI_MOVE_REASON_TEXT: Record<AIMoveReason, string> = {
  lava: '躲避熔岩，向高处转移',
  blocked: '射界被挡，寻找射击位置',
  dodge: '规避上一发落点',
  spacing: '与对手拉开距离',
  angle: '调整射击位置',
};

const EXACT = (): number => 0.5;
const EDGE_MARGIN = 40;
/** 爆炸范围内的己方坦克也会受伤 */
const SELF_SAFE_DISTANCE = 150;
/** 低于这一偏差视为射界通畅 */
const CLEAR_SHOT_MISS = 45;

function poseAt(terrain: AITacticsTerrain, x: number): number {
  return terrain.surfaceY(x);
}

/**
 * 沿地表行走估算可到达的最远位置，规则与 TurnManager.moveTank 一致：
 * 上坡过陡会被挡住，除非前方半个车身内能回到当前高度（越过窄坑沿）。
 */
export function reachableX(terrain: AITacticsTerrain, fromX: number, dir: -1 | 1, distance: number): number {
  const step = 4;
  const min = EDGE_MARGIN;
  const max = terrain.worldWidth - EDGE_MARGIN;
  let x = fromX;
  let travelled = 0;
  while (travelled + step <= distance) {
    const next = x + dir * step;
    if (next < min || next > max) break;
    const curY = poseAt(terrain, x);
    const rise = curY - poseAt(terrain, next);
    if (rise / step > TANK_CONFIG.maxClimbSlope) {
      let clears = false;
      for (let probe = step * 2; probe <= TANK_CONFIG.bodyWidth / 2; probe += step) {
        if (poseAt(terrain, x + dir * probe) >= curY) {
          clears = true;
          break;
        }
      }
      if (!clears) break;
    }
    x = next;
    travelled += step;
  }
  return x;
}

function atPosition(tank: Tank, x: number, terrain: AITacticsTerrain): Tank {
  return { ...tank, x, y: poseAt(terrain, x) };
}

function shotMiss(ctx: AITacticsContext, shooter: Tank, weaponId = 'basic_shell'): number {
  return planAIShot(
    shooter, ctx.target, ctx.wind, ctx.terrain, EXACT, weaponId, ctx.difficulty, ctx.wormholes ?? null
  ).missDistance;
}

/** 选择本回合的移动目标。普通 AI 只处理熔岩和射界受阻，精英 AI 还会规避与微调。 */
export function chooseAIMove(ctx: AITacticsContext): AIMovePlan {
  const { self, target, terrain, difficulty } = ctx;
  const random = ctx.random ?? Math.random;
  const elite = difficulty === 'elite';
  const fuel = Math.max(0, self.movementFuel);
  if (fuel < 12) return { targetX: null, reason: null };

  const submergedAt = (y: number, level: number | null | undefined): boolean =>
    level !== null && level !== undefined && y - level > 4;
  const lavaThreat = submergedAt(self.y, ctx.lavaLevel) || submergedAt(self.y, ctx.nextLavaLevel);

  // 熔岩逃生使用全部燃料；其他情况保留余量，避免把整回合都花在挪动上。
  const range = lavaThreat ? fuel : Math.min(fuel, elite ? 220 : 140);
  const reach = {
    left: reachableX(terrain, self.x, -1, range),
    right: reachableX(terrain, self.x, 1, range),
  };
  const samples = elite ? 5 : 3;
  const candidates = new Set<number>([self.x]);
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    candidates.add(Math.round(self.x + (reach.left - self.x) * t));
    candidates.add(Math.round(self.x + (reach.right - self.x) * t));
  }

  const currentMiss = shotMiss(ctx, self);
  const blocked = currentMiss > CLEAR_SHOT_MISS * 2;
  const threatNear = !!ctx.threat && Math.hypot(ctx.threat.x - self.x, ctx.threat.y - self.y) < 90;
  const tooClose = Math.abs(target.x - self.x) < SELF_SAFE_DISTANCE;
  // 普通 AI 只在确有必要时才考虑移动
  if (!elite && !lavaThreat && !blocked && !tooClose) return { targetX: null, reason: null };

  let best = { x: self.x, score: Number.NEGATIVE_INFINITY, miss: currentMiss };
  for (const x of candidates) {
    const shooter = atPosition(self, x, terrain);
    const miss = x === self.x ? currentMiss : shotMiss(ctx, shooter);
    let score = -Math.min(miss, 400) * 0.25;
    score -= Math.abs(x - self.x) * 0.02;
    if (submergedAt(shooter.y, ctx.lavaLevel)) score -= 120;
    if (submergedAt(shooter.y, ctx.nextLavaLevel)) score -= 80;
    if (ctx.nextLavaLevel !== null && ctx.nextLavaLevel !== undefined) {
      // 贴着下一回合熔岩线也很危险，留出余量
      score -= Math.max(0, shooter.y - (ctx.nextLavaLevel - 20)) * 1.5;
    }
    if (ctx.lavaLevel !== null && ctx.lavaLevel !== undefined) {
      // 熔岩模式下越高越安全
      score += Math.max(0, ctx.lavaLevel - shooter.y) * 0.04;
    }
    const gap = Math.abs(target.x - x);
    if (gap < SELF_SAFE_DISTANCE) score -= (SELF_SAFE_DISTANCE - gap) * 0.4;
    if (elite && threatNear && ctx.threat) {
      score += Math.min(160, Math.hypot(ctx.threat.x - x, ctx.threat.y - shooter.y)) * 0.12;
    }
    if (!elite) score += (random() - 0.5) * 6;
    if (score > best.score) best = { x, score, miss };
  }

  if (Math.abs(best.x - self.x) < 10) return { targetX: null, reason: null };
  let reason: AIMoveReason = 'angle';
  if (lavaThreat) reason = 'lava';
  else if (blocked && best.miss < currentMiss - 20) reason = 'blocked';
  else if (tooClose && Math.abs(target.x - best.x) > Math.abs(target.x - self.x)) reason = 'spacing';
  else if (threatNear) reason = 'dodge';
  // 精英 AI 的纯微调必须换来明显更好的射界，否则留在原地
  if (reason === 'angle' && best.miss > currentMiss - 15) return { targetX: null, reason: null };
  return { targetX: best.x, reason };
}

/** 多弹体与特殊行为武器的有效伤害系数（相对单发 maxDamage） */
const BEHAVIOR_DAMAGE: Partial<Record<WeaponDefinition['behavior'], number>> = {
  split: 1.8,
  cluster: 2.4,
  shower: 2.6,
  burst: 2.4,
  airstrike: 2.4,
  seismic: 2.2,
};

/** 不依赖精确弹道的武器，命中判定放宽 */
const AREA_REACH: Partial<Record<WeaponDefinition['behavior'], number>> = {
  airstrike: 3,
  shower: 2.6,
  seismic: 2.8,
  roller: 2.4,
  cluster: 2,
  burst: 2,
  split: 1.6,
};

export interface AIWeaponChoice {
  weaponId: string;
  /** 便于提示与调试的主要理由 */
  reason: 'finisher' | 'cover' | 'damage' | 'wind' | 'basic';
}

function weaponPrice(id: string): number {
  return SHOP_ITEMS.find((item) => item.weaponId === id)?.price ?? 0;
}

/** 按当前站位评估每件有弹药的武器，返回期望收益最高的一件。 */
export function chooseAITacticalWeapon(ctx: AITacticsContext): AIWeaponChoice {
  const { self, target, wind, difficulty } = ctx;
  const random = ctx.random ?? Math.random;
  const elite = difficulty === 'elite';
  const urgency = Math.max(0, Math.min(1, ctx.urgency ?? 0));
  const available = WEAPONS.filter((w) => self.ammo[w.id] === -1 || (self.ammo[w.id] ?? 0) > 0);
  if (available.length <= 1) return { weaponId: available[0]?.id ?? 'basic_shell', reason: 'basic' };

  const distance = Math.abs(target.x - self.x);
  const context = { distance, windStrength: wind.value, difficulty };
  const basicMiss = shotMiss(ctx, self);
  const covered = basicMiss > CLEAR_SHOT_MISS * 2;
  const targetLower = target.y - self.y > 40;

  const scored = available.map((weapon) => {
    const miss = weapon.id === 'basic_shell' ? basicMiss : shotMiss(ctx, self, weapon.id);
    const reach = weapon.explosionRadius * (AREA_REACH[weapon.behavior] ?? 1);
    const hit = Math.max(0, 1 - miss / Math.max(20, reach));
    const spread = weapon.projectileCount > 1 ? 1 + (weapon.projectileCount - 1) * 0.45 : 1;
    const potential = weapon.maxDamage * spread * (BEHAVIOR_DAMAGE[weapon.behavior] ?? 1);
    const expected = potential * (0.25 + 0.75 * hit);
    // 对手残血时溢出伤害没有价值
    let score = Math.min(expected, target.health + 10) / 100;
    score += getWeaponWinRate(weapon.id, context) * 0.3;
    if (covered) {
      if (weapon.behavior === 'airstrike' || weapon.behavior === 'shower') score += 0.25;
      if (weapon.behavior === 'drill') score += 0.18;
      if (weapon.behavior === 'roller' && targetLower) score += 0.2;
    }
    // 风大时偏好受风影响小的武器；普通 AI 读风误差大，更依赖这一点
    score += (1 - weapon.windMultiplier) * (Math.abs(wind.value) / 3) * (elite ? 0.12 : 0.22);
    // 近距离大爆炸会波及自己
    if (distance < weapon.explosionRadius * 1.4 + 20) score -= 0.6;
    // 稀有弹药留到需要的时候用
    const scarcity = weaponPrice(weapon.id) / 4200;
    score -= scarcity * 0.12 * (1 - urgency);
    if (!elite) score += (random() - 0.5) * 0.18;
    return { weapon, score, expected, hit };
  });

  // 补刀：基础炮弹足以击毁时不浪费特殊弹药
  const basic = scored.find((s) => s.weapon.id === 'basic_shell');
  if (basic && basic.hit > 0.6 && basic.expected >= target.health) {
    return { weaponId: 'basic_shell', reason: 'finisher' };
  }
  const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
  let reason: AIWeaponChoice['reason'] = 'damage';
  if (best.weapon.id === 'basic_shell') reason = 'basic';
  else if (covered && ['airstrike', 'shower', 'drill', 'roller'].includes(best.weapon.behavior)) reason = 'cover';
  else if (best.weapon.windMultiplier < 0.6 && Math.abs(wind.value) > 1.5) reason = 'wind';
  return { weaponId: best.weapon.id, reason };
}
