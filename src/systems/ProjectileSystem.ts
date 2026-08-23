import type { Projectile, Tank, TreasureChest, TreasureReward, WindState, WormholePair } from '../types';
import { createProjectile, spawnTrail, updateTrail } from '../entities/Projectile';
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

export interface WormholeTravelEvent {
  entryX: number;
  entryY: number;
  exitX: number;
  exitY: number;
  color: string;
}

export class ProjectileSystem {
  private next: Projectile[] = [];
  private explosionsQueue: ExplosionRequest[] = [];
  private spawnsQueue: Projectile[] = [];
  private chest: TreasureChest | null = null;
  private rewardsQueue: TreasureRewardEvent[] = [];
  private wormholes: WormholePair | null = null;
  private wormholeEvents: WormholeTravelEvent[] = [];

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
    this.wormholes = null;
    this.wormholeEvents = [];
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

  getWormholes(): WormholePair | null {
    return this.wormholes;
  }

  consumeWormholeEvents(): WormholeTravelEvent[] {
    const events = this.wormholeEvents;
    this.wormholeEvents = [];
    return events;
  }

  spawnWormholesForTurn(chance = 0.3, random: () => number = Math.random): boolean {
    this.wormholes = null;
    if (random() >= chance) return false;
    const endpoints: Array<{ x: number; y: number }> = [];
    for (let portalIndex = 0; portalIndex < 2; portalIndex++) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const x = 140 + random() * (this.terrain.worldWidth - 280);
        const surfaceY = this.terrain.surfaceY(x);
        const y = Math.max(105, surfaceY - 80 - random() * 210);
        const awayFromTanks = this.tanks.every((tank) => Math.hypot(x - tank.x, y - tank.y) > 120);
        const awayFromOther = endpoints.every((point) => Math.hypot(x - point.x, y - point.y) > 320);
        if (awayFromTanks && awayFromOther) {
          endpoints.push({ x, y });
          break;
        }
      }
    }
    if (endpoints.length < 2) return false;
    this.wormholes = {
      blue: { id: 'blue', ...endpoints[0], radius: 25, color: '#45b7ff' },
      red: { id: 'red', ...endpoints[1], radius: 25, color: '#ff536d' },
      phase: random() * Math.PI * 2,
    };
    return true;
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
      // 生成时即确定奖励，便于渲染器在宝箱上方预告 buff。
      reward: this.randomReward(),
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

  hasControllableCluster(ownerId: string): boolean {
    return this.next.some((projectile) => {
      const weapon = weaponRegistry.get(projectile.weaponId);
      return projectile.alive && projectile.ownerId === ownerId && projectile.isPrimary &&
        !projectile.splitDone && weapon.behavior === 'cluster';
    });
  }

  detonateCluster(ownerId: string): boolean {
    const projectile = this.next.find((candidate) => {
      const weapon = weaponRegistry.get(candidate.weaponId);
      return candidate.alive && candidate.ownerId === ownerId && candidate.isPrimary &&
        candidate.age >= 0.15 && !candidate.splitDone && weapon.behavior === 'cluster';
    });
    if (!projectile) return false;
    projectile.splitDone = true;
    this.handleSplit(projectile);
    // 主动引爆发生在 update 外部，立即把子弹加入活动列表，避免场景误判
    // 母弹消失后已经没有存活弹体而提前结束回合。
    this.consumePendingSpawns();
    return true;
  }

  shouldAIDetonateCluster(ownerId: string, targetX: number, targetY: number): boolean {
    const projectile = this.next.find((candidate) =>
      candidate.alive && candidate.ownerId === ownerId && candidate.isPrimary &&
      !candidate.splitDone && weaponRegistry.get(candidate.weaponId).behavior === 'cluster'
    );
    if (!projectile || projectile.age < 0.2) return false;
    const horizontalGap = Math.abs(projectile.x - targetX);
    const isAboveTarget = projectile.y < targetY - 20 && projectile.y > targetY - 300;
    const hasPassedTarget = projectile.vx >= 0
      ? projectile.x >= targetX
      : projectile.x <= targetX;
    // 等到更接近目标正上方才释放；保留较小的越过目标补偿窗口，避免
    // 高速母弹在两个更新帧之间跨过最佳位置后完全错失释放机会。
    return isAboveTarget && (horizontalGap <= 55 || (hasPassedTarget && horizontalGap <= 140));
  }

  clear(): void {
    this.next = [];
    this.explosionsQueue = [];
    this.spawnsQueue = [];
    this.chest = null;
    this.rewardsQueue = [];
    this.wormholes = null;
    this.wormholeEvents = [];
  }

  // 更新所有炮弹：移动、碰撞、行为触发
  update(dt: number): void {
    const g = WORLD_CONFIG.gravity;
    const wind = this.wind.value * WORLD_CONFIG.windScale;
    if (this.chest?.active) this.chest.phase += dt * 2.4;
    if (this.wormholes) this.wormholes.phase += dt * 2.8;

    // 处理分裂等产生的新炮弹
    this.consumePendingSpawns();

    const survivors: Projectile[] = [];
    for (const p of this.next) {
      if (!p.alive) continue;
      p.portalCooldown = Math.max(0, p.portalCooldown - dt);
      p.prevX = p.x;
      p.prevY = p.y;
      if (p.state === 'rolling') {
        this.updateRoller(p, dt);
        this.updateTracer(p, dt, 24);
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
        this.updateTracer(p, dt);
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
      this.updateTracer(p, dt);

      if (this.teleportThroughWormhole(p)) {
        survivors.push(p);
        continue;
      }

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
          } else if (weapon.behavior === 'burst' && !p.isPayload) {
            this.queueExplosionFromProjectile(p, hit.tank!.id);
            this.spawnRadialBurst(p, hit.x, hit.y);
          } else if (weapon.behavior === 'seismic') {
            this.spawnSeismicWave(p, hit.x, hit.tank!.id);
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

  private teleportThroughWormhole(p: Projectile): boolean {
    const pair = this.wormholes;
    if (!pair || p.portalCooldown > 0 || p.state !== 'flying') return false;
    const routes = [
      { entry: pair.blue, exit: pair.red },
      { entry: pair.red, exit: pair.blue },
    ];
    for (const route of routes) {
      const hit = segmentCircleHit(
        p.prevX, p.prevY, p.x, p.y,
        route.entry.x, route.entry.y, route.entry.radius + p.radius
      );
      if (!hit) continue;
      const speed = Math.hypot(p.vx, p.vy) || 1;
      p.vx = -p.vx;
      p.vy = -p.vy;
      const padding = route.exit.radius + p.radius + 7;
      p.x = route.exit.x + (p.vx / speed) * padding;
      p.y = route.exit.y + (p.vy / speed) * padding;
      p.prevX = p.x;
      p.prevY = p.y;
      p.portalCooldown = 0.28;
      p.trail = [];
      this.wormholeEvents.push({
        entryX: hit.x,
        entryY: hit.y,
        exitX: route.exit.x,
        exitY: route.exit.y,
        color: route.exit.color,
      });
      return true;
    }
    return false;
  }

  private updateTracer(p: Projectile, dt: number, samplesPerSecond = 30): void {
    updateTrail(p, dt);
    if (!p.alive) return;
    if (Math.floor(p.age * samplesPerSecond) !== Math.floor((p.age - dt) * samplesPerSecond)) {
      spawnTrail(p);
    }
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

  // 命中后从爆心向四周抛出碎片。碎片被标记为载荷，落地时只爆炸一次，
  // 不会递归产生新的碎片；出生点向外偏移可避免在直击时全部重叠命中。
  private spawnRadialBurst(parent: Projectile, impactX: number, impactY: number): void {
    const weapon = weaponRegistry.get(parent.weaponId);
    const count = weapon.burstCount ?? 8;
    const speed = weapon.burstSpeed ?? 220;
    const spawnOffset = 32;
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (i / count) * Math.PI * 2;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const fragment = createProjectile(
        parent.ownerId,
        weapon,
        impactX + dx * spawnOffset,
        impactY + dy * spawnOffset,
        dx * speed + parent.vx * 0.08,
        dy * speed + parent.vy * 0.08,
        false
      );
      fragment.isPayload = true;
      fragment.splitDone = true;
      fragment.splitTime = 0;
      fragment.damage = weapon.maxDamage;
      fragment.explosionRadius = weapon.explosionRadius;
      this.spawnsQueue.push(fragment);
    }
  }

  // 将一次落点转换为沿地表传播的奇数个震爆点。中心点保留直接命中
  // 标记，两侧伤害略微衰减，既能撕开掩体又不会让全部爆炸叠在坦克上。
  private spawnSeismicWave(
    projectile: Projectile,
    impactX: number,
    directHitTankId: string | null
  ): void {
    const weapon = weaponRegistry.get(projectile.weaponId);
    const count = Math.max(3, weapon.seismicCount ?? 7);
    const spacing = weapon.seismicSpacing ?? 46;
    const center = (count - 1) / 2;
    for (let i = 0; i < count; i++) {
      const offsetSteps = i - center;
      const x = Math.max(4, Math.min(this.terrain.worldWidth - 4, impactX + offsetSteps * spacing));
      const y = this.terrain.surfaceY(x) - 2;
      const falloff = 1 - Math.abs(offsetSteps) * 0.08;
      this.explosionsQueue.push({
        x,
        y,
        radius: projectile.explosionRadius,
        damage: Math.max(1, Math.round(projectile.damage * falloff)),
        ownerTankId: projectile.ownerId,
        directHitTankId: offsetSteps === 0 ? directHitTankId : null,
        terrainDamageMultiplier: projectile.terrainDamageMultiplier,
        weaponColor: weapon.color,
      });
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
    const reward = chest.reward ?? this.randomReward();
    chest.reward = reward;
    this.rewardsQueue.push({ ownerTankId: p.ownerId, reward });

    switch (reward) {
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
      case 'burst': {
        p.x = hitX;
        p.y = hitY;
        this.queueExplosionFromProjectile(p, null);
        if (!p.isPayload) this.spawnRadialBurst(p, hitX, hitY);
        p.alive = false;
        break;
      }
      case 'seismic': {
        p.x = hitX;
        p.y = hitY;
        this.spawnSeismicWave(p, hitX, null);
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
    } else if (weapon.behavior === 'shower') {
      const childCount = weapon.childCount ?? 7;
      const childSpeed = weapon.childSpeed ?? 185;
      const center = (childCount - 1) / 2;
      for (let i = 0; i < childCount; i++) {
        const normalized = center === 0 ? 0 : (i - center) / center;
        const proj = createProjectile(
          p.ownerId,
          weapon,
          p.x + normalized * 22,
          p.y,
          normalized * childSpeed * 0.78 + p.vx * 0.12,
          childSpeed * (0.78 + Math.abs(normalized) * 0.16),
          false
        );
        proj.isPayload = true;
        proj.splitDone = true;
        proj.splitTime = 0;
        proj.damage = weapon.maxDamage;
        proj.explosionRadius = weapon.explosionRadius;
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
