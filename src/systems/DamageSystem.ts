import type { Tank, WeaponDefinition, WindState } from '../types';
import { pointDistance } from '../utils/math';

export interface DamageResult {
  targets: Array<{
    tankId: string;
    damage: number;
    isDirect: boolean;
    killed: boolean;
  }>;
}

export class DamageSystem {
  // 根据爆炸中心和半径计算对所有坦克的伤害
  applyExplosion(
    center: { x: number; y: number },
    radius: number,
    maxDamage: number,
    tanks: Tank[],
    directHitTankId: string | null,
    alreadyHitIds: Set<string>
  ): DamageResult {
    const result: DamageResult = { targets: [] };
    for (const tank of tanks) {
      if (!tank.isAlive) continue;
      if (alreadyHitIds.has(tank.id)) continue;
      const distance = pointDistance(center.x, center.y, tank.x, tank.y - 6);
      const isDirect = directHitTankId === tank.id;
      // 直接命中点位于坦克外轮廓，而不是坦克圆心。小范围精确弹的
      // 碰撞点可能略微落在爆炸半径外，不能因此丢失已确认的直击伤害。
      if (distance > radius && !isDirect) continue;
      const ratio = isDirect ? 0 : distance / radius;
      let damage = maxDamage * (1 - ratio);
      if (isDirect) damage += maxDamage * 0.15; // 直接命中奖励
      damage = Math.max(0, Math.round(damage));
      tank.health -= damage;
      tank.damageDealt; // 不在此处记录造成伤害，由调用方结算
      tank.hitFlash = 0.4;
      alreadyHitIds.add(tank.id);
      const killed = tank.health <= 0;
      if (killed) {
        tank.health = 0;
        tank.isAlive = false;
      }
      result.targets.push({ tankId: tank.id, damage, isDirect, killed });
    }
    return result;
  }

  // 计算击退向量
  applyKnockback(center: { x: number; y: number }, radius: number, tank: Tank, factor: number): void {
    const dx = tank.x - center.x;
    const dy = tank.y - 6 - center.y;
    const dist = Math.hypot(dx, dy) || 1;
    const strength = (1 - Math.min(1, dist / radius)) * factor;
    tank.velocityX += (dx / dist) * strength * 50;
    tank.velocityY += (dy / dist) * strength * 50 - 20;
    tank.isGrounded = false;
  }

  generateWind(strength: number): WindState {
    if (strength <= 0) return { value: 0, displayStrength: 0 };
    const dir = Math.random() < 0.5 ? -1 : 1;
    const mag = 0.4 + Math.random() * 0.6;
    return {
      value: dir * mag * strength,
      displayStrength: strength,
    };
  }
}
