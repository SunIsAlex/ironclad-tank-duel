import type { Projectile, Tank, TreasureChest, TreasureReward, WindState } from '../types';
import { createProjectile } from '../entities/Projectile';
import { WORLD_CONFIG } from '../config/gameConfig';
import { angleToVector } from '../utils/math';
import { segmentCircleHit } from '../utils/math';
import type { CollisionSystem } from './CollisionSystem';
import type { TerrainSystem } from './TerrainSystem';
import { weaponRegistry } from '../weapons/WeaponRegistry';

export interface ExplosionRequest {
  x: number;
  y: number;
  radius: number;
  damage: number;
  ownerTankId: string;
  directHitTankId: string | null;
  terrainDamageMultiplier: number;
  weaponColor: string;
}

export interface TreasureRewardEvent {
  ownerTankId: string;
  reward: TreasureReward;
}

export class ProjectileSystem {
  private next: Projectile[] = [];
  private explosionsQueue: ExplosionRequest[] = [];
  private spawnsQueue: Projectile[] = [];
  private chest: TreasureChest | null = null;
  private rewardsQueue: TreasureRewardEvent[] = [];

  constructor(
    private terrain: TerrainSystem,
    private collision: CollisionSystem,
    private tanks: Tank[],
    private wind: WindState
  ) {}

  reset(tanks: Tank[], wind: WindState): void {
    this.next = [];
    this.explosionsQueue = [];
    this.spawnsQueue = [];
    this.chest = null;
    this.rewardsQueue = [];
    (this.tanks as Tank[]) = tanks;
    (this.wind as WindState) = wind;
  }

  setWind(w: WindState): void {
    this.wind = w;
  }

  fire(tank: Tank, angleDeg: number, power: number): void {
    const weapon = weaponRegistry.get(tank.selectedWeaponId);
    const dir = angleToVector(angleDeg);
    const speed = power * weapon.projectileSpeedMultiplier;
    const vx = dir.x * speed;
    const vy = dir.y * speed;

    // 炮口位置
    const px = tank.x + dir.x * 30;
    const py = tank.y - 6 + dir.y * 30;

    if (weapon.projectileCount > 1) {
      // 散射，三发角度差
      const spread = weapon.spreadAngle ?? 8;
      for (let i = 0; i < weapon.projectileCount; i++) {
        const offset = (i - (weapon.projectileCount - 1) / 2) * spread;
        const a = angleDeg + offset;
        const d = angleToVector(a);
        const speedStep = weapon.projectileSpeedStep ?? 0;
        const s = speed * (1 + (i - (weapon.projectileCount - 1) / 2) * speedStep);
        const proj = createProjectile(
          tank.id,
          weapon,
          tank.x + d.x * 30,
          tank.y - 6 + d.y * 30,
          d.x * s,
          d.y * s,
          i === 0
        );
        this.next.push(proj);
      }
    } else {
      const proj = createProjectile(tank.id, weapon, px, py, vx, vy, true);
      this.next.push(proj);
    }
  }

  getProjectiles(): Projectile[] {
    return this.next;
  }

  getChest(): TreasureChest | null {
    return this.chest;
  }

  consumeRewards(): TreasureRewardEvent[] {
    const rewards = this.rewardsQueue;
    this.rewardsQueue = [];
    return rewards;
  }

  // 每回合生成一个悬浮宝箱，位置避开地图边缘与地面。
  spawnRandomChest(): void {
    const aliveTanks = this.tanks.filter((tank) => tank.isAlive);
    const worldMin = 80;
    const worldMax = this.terrain.worldWidth - 80;
    let minX = worldMin;
    let maxX = worldMax;
    if (aliveTanks.length >= 2) {
      const left = Math.min(aliveTanks[0].x, aliveTanks[1].x);
      const right = Math.max(aliveTanks[0].x, aliveTanks[1].x);
      // 两辆坦克各留出安全边距，宝箱永远位于两者之间。
      minX = Math.max(worldMin, left + 50);
      maxX = Math.min(worldMax, right - 50);
      if (maxX < minX) {
        const midpoint = Math.max(worldMin, Math.min(worldMax, (left + right) * 0.5));
        minX = midpoint;
        maxX = midpoint;
      }
    }
    const leftTank = aliveTanks[0];
    const rightTank = aliveTanks[1];
    const lowestTankY = aliveTanks.length >= 2
      ? Math.min(leftTank.y, rightTank.y)
      : this.terrain.worldHeight * 0.68;
    const highestTankY = aliveTanks.length >= 2
      ? Math.max(leftTank.y, rightTank.y)
      : lowestTankY;
    const midpointX = (minX + maxX) * 0.5;
    const groundY = typeof this.terrain.surfaceY === 'function'
      ? this.terrain.surfaceY(midpointX)
      : this.terrain.worldHeight * 0.72;
    // 屏幕坐标中 y 越小越高。宝箱不再贴近天空，而是在坦克上方一段
    // 可瞄准高度内悬浮，并至少离地 70px。
    const minY = Math.max(170, lowestTankY - 150);
    const maxY = Math.min(groundY - 70, highestTankY - 30);
    const safeMinY = Math.min(minY, maxY);
    const safeMaxY = Math.max(minY, maxY);
    let chestX = midpointX;
    let chestY = (safeMinY + safeMaxY) * 0.5;
    const targetsReachable = aliveTanks.length < 2 || (
      this.canHitPoint(leftTank, rightTank.x, rightTank.y - 6) &&
      this.canHitPoint(rightTank, leftTank.x, leftTank.y - 6)
    );
    // 随机尝试多个候选点；位置必须对双方都可达，且不破坏双方互射的
    // 基本可玩性。失败时保留中线低位安全点，不会回到地图高空。
    if (targetsReachable && aliveTanks.length >= 2) {
      for (let attempt = 0; attempt < 24; attempt++) {
        const candidateX = minX + Math.random() * Math.max(0, maxX - minX);
        const candidateY = safeMinY + Math.random() * Math.max(0, safeMaxY - safeMinY);
        if (
          this.canHitPoint(leftTank, candidateX, candidateY) &&
          this.canHitPoint(rightTank, candidateX, candidateY)
        ) {
          chestX = candidateX;
          chestY = candidateY;
          break;
        }
      }
    }
    this.chest = {
      x: chestX,
      y: chestY,
      radius: 18,
      phase: Math.random() * Math.PI * 2,
      active: true,
      reward: null,
    };
  }

  private canHitPoint(shooter: Tank, targetX: number, targetY: number): boolean {
    const dx = targetX - shooter.x;
    if (Math.abs(dx) < 12) return true;
    const direction = dx > 0 ? 1 : -1;
    const startAngle = direction > 0 ? 8 : 92;
    const endAngle = direction > 0 ? 82 : 172;
    const terrain = this.terrain as TerrainSystem & { isSolid?: (x: number, y: number) => boolean };
    for (let angle = startAngle; angle <= endAngle; angle += 8) {
      const radians = angle * Math.PI / 180;
      for (let speed = 300; speed <= 820; speed += 40) {
        const vx = Math.cos(radians) * speed * direction;
        const vy = -Math.sin(radians) * speed;
        for (let t = 0.04; t <= 4.5; t += 0.04) {
          const x = shooter.x + vx * t;
          const y = shooter.y - 6 + vy * t + 0.5 * WORLD_CONFIG.gravity * t * t;
          if (x < 0 || x > this.terrain.worldWidth || y > this.terrain.worldHeight) break;
          if (Math.hypot(x - targetX, y - targetY) <= 28) return true;
          if (terrain.isSolid?.(x, y) && t > 0.08) break;
        }
      }
    }
    return false;
  }

  getPendingExplosions(): ExplosionRequest[] {
    return this.explosionsQueue;
  }

  getPendingSpawns(): Projectile[] {
    return this.spawnsQueue;
  }

  consumePendingSpawns(): void {
    if (this.spawnsQueue.length === 0) return;
    for (const p of this.spawnsQueue) this.next.push(p);
    this.spawnsQueue.length = 0;
  }

  consumePendingExplosions(): ExplosionRequest[] {
    const arr = this.explosionsQueue;
    this.explosionsQueue = [];
    return arr;
  }

  hasAlive(): boolean {
    return this.next.some((p) => p.alive);
  }

  clear(): void {
    this.next = [];
    this.explosionsQueue = [];
    this.spawnsQueue = [];
    this.chest = null;
    this.rewardsQueue = [];
  }

  // 更新所有炮弹：移动、碰撞、行为触发
  update(dt: number): void {
    const g = WORLD_CONFIG.gravity;
    const wind = this.wind.value * WORLD_CONFIG.windScale;
    if (this.chest?.active) this.chest.phase += dt * 2.4;

    // 处理分裂等产生的新炮弹
    this.consumePendingSpawns();

    const survivors: Projectile[] = [];
    for (const p of this.next) {
      if (!p.alive) continue;
      p.prevX = p.x;
      p.prevY = p.y;
      if (p.state === 'rolling') {
        this.updateRoller(p, dt);
        if (p.alive) survivors.push(p);
        continue;
      }

      // 物理；钻地阶段保留入射方向，不再受风与重力扰动。
      if (p.state !== 'drilling') {
        p.vx += wind * p.windMultiplier * dt;
        p.vy += g * p.gravityMultiplier * dt;
      }
      if (p.state === 'drilling') {
        const ddist = Math.hypot(p.vx * dt, p.vy * dt);
        p.drillRemaining = Math.max(0, p.drillRemaining - ddist);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.age += dt;
        // 尾迹
        if (p.age * 60 % 1 < dt * 60) {
          p.trail.push({ x: p.x, y: p.y, life: 0.4 });
          if (p.trail.length > 12) p.trail.shift();
        }
        if (p.drillRemaining <= 0) {
          this.queueExplosionFromProjectile(p, null);
          p.alive = false;
          continue;
        }
        if (p.age > p.maxAge) {
          this.queueExplosionFromProjectile(p, null);
          p.alive = false;
          continue;
        }
        survivors.push(p);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.age += dt;
      // 尾迹
      if (Math.floor(p.age * 30) !== Math.floor((p.age - dt) * 30)) {
        p.trail.push({ x: p.x, y: p.y, life: 0.5 });
        if (p.trail.length > 14) p.trail.shift();
      }
      for (const t of p.trail) t.life -= dt;
      while (p.trail.length > 0 && p.trail[0].life <= 0) p.trail.shift();

      // 行为更新
      if (p.splitTime > 0 && !p.splitDone && p.age >= p.splitTime) {
        p.splitDone = true;
        this.handleSplit(p);
        // 分裂行为会销毁母弹。不要再让母弹参与本帧碰撞；否则既可能
        // 额外爆炸，也会让场景在子弹入队前误判飞行阶段已经结束。
        if (!p.alive) continue;
      }

      // 宝箱碰撞优先于地形/坦克碰撞，避免高速炮弹穿过小宝箱。
      const chestHit = this.detectChestHit(p);
      if (chestHit) {
        this.collectChest(p, chestHit.x, chestHit.y);
        if (!p.alive) continue;
      }

      const hit = this.collision.detectProjectileHit(p, this.terrain, this.tanks);
      if (hit) {
        if (hit.type === 'oob') {
          p.alive = false;
          continue;
        }
        if (hit.type === 'tank') {
          // 分段碰撞返回的是实际接触点。必须在该点爆炸，尤其集束子弹
          // 半径较小，若沿用本帧终点会越过坦克并被伤害范围排除。
          p.x = hit.x;
          p.y = hit.y;
          const weapon = weaponRegistry.get(p.weaponId);
          if (weapon.behavior === 'airstrike' && !p.isPayload) {
            this.spawnAirstrike(p, hit.x);
          } else {
            this.queueExplosionFromProjectile(p, hit.tank!.id);
          }
          p.alive = false;
          continue;
        }
        // 地形
        this.handleTerrainHit(p, hit.x, hit.y);
        // 若仍然存活（如弹跳），加入 survivors
        if (p.alive) survivors.push(p);
        continue;
      }

      if (p.age > p.maxAge) {
        this.queueExplosionFromProjectile(p, null);
        p.alive = false;
        continue;
      }
      survivors.push(p);
    }
    // 分裂产生的子弹必须在本帧就成为活动弹体，确保 hasAlive() 不会在
    // 母弹消失与下一帧之间返回 false，导致回合状态机提前结束。
    if (this.spawnsQueue.length > 0) {
      survivors.push(...this.spawnsQueue);
      this.spawnsQueue.length = 0;
    }
    this.next = survivors;
  }

  private updateRoller(p: Projectile, dt: number): void {
    const dx = p.vx * dt;
    p.x += dx;
    p.rollRemaining -= Math.abs(dx);
    p.age += dt;
    if (p.x < 0 || p.x >= this.terrain.worldWidth) {
      p.alive = false;
      return;
    }
    p.y = this.terrain.surfaceY(p.x) - p.radius;
    for (const tank of this.tanks) {
      if (!tank.isAlive || (tank.id === p.ownerId && p.age < 0.25)) continue;
      const hit = segmentCircleHit(
        p.prevX,
        p.prevY,
        p.x,
        p.y,
        tank.x,
        tank.y - 6,
        20 + p.radius
      );
      if (hit) {
        p.x = hit.x;
        p.y = hit.y;
        this.queueExplosionFromProjectile(p, tank.id);
        p.alive = false;
        return;
      }
    }
    if (p.rollRemaining <= 0 || p.age > p.maxAge) {
      this.queueExplosionFromProjectile(p, null);
      p.alive = false;
    }
  }

  private spawnAirstrike(marker: Projectile, impactX: number): void {
    const weapon = weaponRegistry.get(marker.weaponId);
    const count = weapon.airstrikeCount ?? 5;
    const spread = weapon.airstrikeSpread ?? 40;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * spread;
      const payload = createProjectile(
        marker.ownerId,
        weapon,
        impactX + offset,
        24 - Math.abs(offset) * 0.08,
        -offset * 0.12,
        155,
        false
      );
      payload.isPayload = true;
      payload.splitDone = true;
      payload.splitTime = 0;
      this.spawnsQueue.push(payload);
    }
  }

  private detectChestHit(p: Projectile): { x: number; y: number } | null {
    const chest = this.chest;
    if (!chest?.active) return null;
    const y = chest.y + Math.sin(chest.phase) * 8;
    const hitRadius = chest.radius + p.radius;
    // 炮弹可能在上一帧已经进入宝箱碰撞圆，线段求交的两个根会落在
    // 线段外，此时仍应视为命中。
    const startDistance = Math.hypot(p.prevX - chest.x, p.prevY - y);
    if (startDistance <= hitRadius) return { x: p.prevX, y: p.prevY };
    const hit = segmentCircleHit(
      p.prevX,
      p.prevY,
      p.x,
      p.y,
      chest.x,
      y,
      hitRadius
    );
    return hit ? { x: hit.x, y: hit.y } : null;
  }

  private collectChest(p: Projectile, hitX: number, hitY: number): void {
    const chest = this.chest;
    if (!chest?.active) return;
    chest.active = false;
    chest.reward = this.randomReward();
    this.rewardsQueue.push({ ownerTankId: p.ownerId, reward: chest.reward });

    switch (chest.reward) {
      case 'double_damage':
        p.damage *= 2;
        break;
      case 'wide_blast':
        p.explosionRadius *= 1.6;
        break;
      case 'split_shot':
        this.splitFromChest(p, hitX, hitY);
        break;
    }
  }

  private randomReward(): TreasureReward {
    const rewards: TreasureReward[] = ['double_damage', 'wide_blast', 'split_shot'];
    return rewards[Math.floor(Math.random() * rewards.length)];
  }

  private splitFromChest(p: Projectile, x: number, y: number): void {
    const speed = Math.hypot(p.vx, p.vy);
    if (speed < 1) return;
    const baseAngle = Math.atan2(p.vy, p.vx);
    const offset = 10 * Math.PI / 180;
    for (const angle of [baseAngle - offset, baseAngle + offset]) {
      const child = createProjectile(
        p.ownerId,
        weaponRegistry.get(p.weaponId),
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        false
      );
      // 奖励分裂只发生一次；保留原弹的伤害、范围和物理倍率。
      child.damage = p.damage;
      child.explosionRadius = p.explosionRadius;
      child.terrainDamageMultiplier = p.terrainDamageMultiplier;
      child.gravityMultiplier = p.gravityMultiplier;
      child.windMultiplier = p.windMultiplier;
      child.speedMultiplier = p.speedMultiplier;
      child.splitTime = 0;
      child.splitDone = true;
      this.spawnsQueue.push(child);
    }
    p.alive = false;
  }

  private handleTerrainHit(p: Projectile, hitX: number, hitY: number): void {
    const weapon = weaponRegistry.get(p.weaponId);
    switch (weapon.behavior) {
      case 'bounce': {
        if (p.bounceCount < p.maxBounce) {
          p.bounceCount++;
          // 反弹：根据接触法线（用表面斜率近似）
          const xi = Math.floor(hitX);
          const tx = this.terrain.heightMap[Math.max(0, Math.min(this.terrain.worldWidth - 1, xi))];
          const tx1 = this.terrain.heightMap[Math.max(0, Math.min(this.terrain.worldWidth - 1, xi + 1))];
          const slope = (tx1 - tx) / 1;
          const nx = -slope;
          const ny = -1;
          const nlen = Math.hypot(nx, ny) || 1;
          const nxn = nx / nlen;
          const nyn = ny / nlen;
          const dot = p.vx * nxn + p.vy * nyn;
          const restitution = weapon.bounceRestitution ?? 0.55;
          p.vx = (p.vx - 2 * dot * nxn) * restitution;
          p.vy = (p.vy - 2 * dot * nyn) * restitution;
          // 推离表面避免立刻再次命中
          p.x = hitX + nxn * 3;
          p.y = hitY + nyn * 3;
          p.prevX = p.x;
          p.prevY = p.y;
          // 速度过低则起爆
          const speed = Math.hypot(p.vx, p.vy);
          if (speed < 60) {
            p.x = hitX;
            p.y = hitY;
            this.queueExplosionFromProjectile(p, null);
            p.alive = false;
          }
        } else {
          p.x = hitX;
          p.y = hitY;
          this.queueExplosionFromProjectile(p, null);
          p.alive = false;
        }
        break;
      }
      case 'drill': {
        p.x = hitX;
        p.y = hitY;
        p.prevX = hitX;
        p.prevY = hitY;
        p.state = 'drilling';
        p.drillRemaining = weapon.drillDistance ?? 26;
        break;
      }
      case 'roller': {
        p.x = hitX;
        p.y = hitY - p.radius;
        p.prevX = p.x;
        p.prevY = p.y;
        p.state = 'rolling';
        p.rollRemaining = weapon.rollDistance ?? 240;
        const direction = Math.sign(p.vx) || 1;
        p.vx = direction * (weapon.rollSpeed ?? 130);
        p.vy = 0;
        break;
      }
      case 'airstrike': {
        if (p.isPayload) {
          p.x = hitX;
          p.y = hitY;
          this.queueExplosionFromProjectile(p, null);
        } else {
          this.spawnAirstrike(p, hitX);
        }
        p.alive = false;
        break;
      }
      default: {
        p.x = hitX;
        p.y = hitY;
        this.queueExplosionFromProjectile(p, null);
        p.alive = false;
        break;
      }
    }
  }

  private handleSplit(p: Projectile): void {
    const weapon = weaponRegistry.get(p.weaponId);
    if (weapon.behavior === 'split') {
      const childCount = weapon.childCount ?? 4;
      for (let i = 0; i < childCount; i++) {
        const ang = (i / childCount) * Math.PI * 2;
        const speed = weapon.childSpeed ?? 140;
        const proj = createProjectile(
          p.ownerId,
          weapon,
          p.x,
          p.y,
          Math.cos(ang) * speed + p.vx * 0.3,
          Math.sin(ang) * speed + p.vy * 0.3,
          false
        );
        proj.damage = weapon.maxDamage;
        proj.explosionRadius = Math.max(18, weapon.explosionRadius * 0.65);
        proj.maxBounce = 0;
        proj.splitTime = 0;
        proj.gravityMultiplier = weapon.gravityMultiplier;
        this.spawnsQueue.push(proj);
      }
      p.alive = false;
    } else if (weapon.behavior === 'cluster') {
      const childCount = weapon.childCount ?? 5;
      const childSpeed = weapon.childSpeed ?? 150;
      for (let i = 0; i < childCount; i++) {
        const center = (childCount - 1) / 2;
        const offset = (i - center) * 30;
        const proj = createProjectile(
          p.ownerId,
          weapon,
          p.x + offset,
          p.y,
          offset * 0.6,
          childSpeed * (0.8 + Math.random() * 0.4),
          false
        );
        proj.damage = weapon.maxDamage;
        proj.explosionRadius = Math.max(16, weapon.explosionRadius * 0.7);
        proj.splitTime = 0;
        this.spawnsQueue.push(proj);
      }
      p.alive = false;
    }
  }

  private queueExplosionFromProjectile(p: Projectile, directHitTankId: string | null): void {
    const weapon = weaponRegistry.get(p.weaponId);
    this.explosionsQueue.push({
      x: p.x,
      y: p.y,
      radius: p.explosionRadius,
      damage: p.damage,
      ownerTankId: p.ownerId,
      directHitTankId,
      terrainDamageMultiplier: p.terrainDamageMultiplier,
      weaponColor: weapon.color,
    });
  }
}
