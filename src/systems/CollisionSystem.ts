import type { Projectile, Tank } from '../types';
import type { TerrainSystem } from './TerrainSystem';
import { segmentCircleHit } from '../utils/math';
import { TANK_CONFIG } from '../config/gameConfig';

export interface HitTankResult {
  tankId: string;
  isDirect: boolean; // 是否是直接命中
  px: number;
  py: number;
}

export class CollisionSystem {
  // 检测炮弹本帧移动是否击中地形或坦克
  // 返回命中类型和位置
  detectProjectileHit(
    p: Projectile,
    terrain: TerrainSystem,
    tanks: Tank[]
  ): { type: 'terrain' | 'tank' | 'oob'; x: number; y: number; tank?: Tank; isDirect?: boolean } | null {
    // 边界检测：水平出界 -> 销毁但不爆炸（视为超时）
    if (p.x < -80 || p.x > terrain.worldWidth + 80) {
      return { type: 'oob', x: p.x, y: p.y };
    }
    if (p.y > terrain.worldHeight + 80) {
      return { type: 'oob', x: p.x, y: p.y };
    }
    if (p.y < -200 && p.vy > 0) {
      // 仍允许飞回，不立刻销毁
    }

    // 与坦克圆形碰撞
    for (const t of tanks) {
      if (!t.isAlive) continue;
      if (t.id === p.ownerId && p.age < 0.18) continue; // 自伤保护期
      const cx = t.x;
      const cy = t.y - 6;
      const r = TANK_CONFIG.bodyHeight + 6;
      const hit = segmentCircleHit(p.prevX, p.prevY, p.x, p.y, cx, cy, r + p.radius);
      if (hit) {
        return { type: 'tank', x: hit.x, y: hit.y, tank: t, isDirect: true };
      }
    }

    // 与地形碰撞 - 沿线段采样
    const dx = p.x - p.prevX;
    const dy = p.y - p.prevY;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const sx = p.prevX + dx * t;
      const sy = p.prevY + dy * t;
      if (terrain.isSolid(sx, sy)) {
        return { type: 'terrain', x: sx, y: sy };
      }
    }
    return null;
  }
}
