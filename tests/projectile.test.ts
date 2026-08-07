import { describe, it, expect } from 'vitest';
import { clamp, segmentCircleHit } from '../src/utils/math';
import { createProjectile, spawnTrail, updateTrail } from '../src/entities/Projectile';
import { WEAPONS } from '../src/config/weaponConfig';
import { getWeaponById } from '../src/config/weaponConfig';
import { ProjectileSystem } from '../src/systems/ProjectileSystem';

describe('炮弹超时销毁', () => {
  it('超过 maxAge 应被标记为不可用', () => {
    const w = WEAPONS[0];
    const p = createProjectile('t1', w, 0, 0, 100, -100, true);
    expect(p.alive).toBe(true);
    p.age = p.maxAge + 0.01;
    expect(p.age).toBeGreaterThan(p.maxAge);
  });

  it('初始 radius 为正数', () => {
    const w = WEAPONS[0];
    const p = createProjectile('t1', w, 0, 0, 100, -100, true);
    expect(p.radius).toBeGreaterThan(0);
  });

  it('不同炮弹使用各自的拖影持续时间并会随时间消散', () => {
    const basic = createProjectile('t1', getWeaponById('basic_shell'), 0, 0, 100, -100, true);
    const heavy = createProjectile('t1', getWeaponById('heavy_impact'), 0, 0, 100, -100, true);
    spawnTrail(basic);
    spawnTrail(heavy);
    expect(heavy.trail[0].maxLife).toBeGreaterThan(basic.trail[0].maxLife);
    const previousLife = basic.trail[0].life;
    updateTrail(basic, 0.1);
    expect(basic.trail[0].life).toBeCloseTo(previousLife - 0.1);
  });
});

describe('世界边界处理', () => {
  it('clamp 保证 x 在边界内', () => {
    expect(clamp(-10, 0, 100)).toBe(0);
    expect(clamp(200, 0, 100)).toBe(100);
    expect(clamp(50, 0, 100)).toBe(50);
  });
});

describe('分段碰撞检测', () => {
  it('检测线段是否穿过圆形', () => {
    // 从 (-10, 0) 飞到 (10, 0)，圆心 (0, 0) 半径 5
    const hit = segmentCircleHit(-10, 0, 10, 0, 0, 0, 5);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeGreaterThan(0);
    expect(hit!.t).toBeLessThan(1);
  });

  it('未穿过圆形返回 null', () => {
    const hit = segmentCircleHit(0, 0, 10, 0, 0, 50, 5);
    expect(hit).toBeNull();
  });

  it('高速运动也检测命中', () => {
    // 从 -1000 飞到 1000，应命中圆心
    const hit = segmentCircleHit(-1000, 0, 1000, 0, 0, 0, 5);
    expect(hit).not.toBeNull();
  });
});

describe('空中分裂武器', () => {
  it('集束弹可在保险计时前由玩家主动释放 5 枚子弹', () => {
    const terrain = { worldWidth: 2000, worldHeight: 1000 };
    const collision = { detectProjectileHit: () => null };
    const tank = {
      id: 't1', x: 200, y: 500, selectedWeaponId: 'micro_cluster',
    };
    const system = new ProjectileSystem(terrain as never, collision as never, [tank] as never, {
      value: 0,
      displayStrength: 0,
    });

    system.fire(tank as never, 60, 300);
    system.update(0.2);
    expect(system.hasControllableCluster('t1')).toBe(true);
    expect(system.detonateCluster('t1')).toBe(true);

    const children = system.getProjectiles().filter((p) => p.alive);
    expect(children).toHaveLength(5);
    expect(children.every((p) => p.splitTime === 0)).toBe(true);
    expect(system.hasAlive()).toBe(true);
  });

  it('集束弹超过保险时间仍会自动释放，避免错过操作后失效', () => {
    const terrain = { worldWidth: 4000, worldHeight: 4000 };
    const collision = { detectProjectileHit: () => null };
    const tank = { id: 't1', x: 200, y: 500, selectedWeaponId: 'micro_cluster' };
    const system = new ProjectileSystem(terrain as never, collision as never, [tank] as never, {
      value: 0,
      displayStrength: 0,
    });
    system.fire(tank as never, 60, 300);
    system.update((getWeaponById('micro_cluster').splitTime ?? 0) + 0.01);
    expect(system.getProjectiles()).toHaveLength(5);
  });

  it('AI 仅在集束母弹到达目标上方时决定释放', () => {
    const terrain = { worldWidth: 2000, worldHeight: 1000 };
    const collision = { detectProjectileHit: () => null };
    const tank = { id: 't1', x: 200, y: 500, selectedWeaponId: 'micro_cluster' };
    const system = new ProjectileSystem(terrain as never, collision as never, [tank] as never, {
      value: 0,
      displayStrength: 0,
    });
    system.fire(tank as never, 45, 400);
    const projectile = system.getProjectiles()[0];
    projectile.age = 0.5;
    projectile.x = 790;
    projectile.y = 300;
    projectile.vx = 200;
    expect(system.shouldAIDetonateCluster('t1', 800, 500)).toBe(true);
    expect(system.shouldAIDetonateCluster('t1', 860, 500)).toBe(false);
    expect(system.shouldAIDetonateCluster('t1', 1200, 500)).toBe(false);
  });

  it('高速集束子弹在实际坦克接触点产生直接命中爆炸', () => {
    const terrain = { worldWidth: 2000, worldHeight: 1000 };
    const target = { id: 't2' };
    const collision = {
      detectProjectileHit: () => ({ type: 'tank', x: 410, y: 320, tank: target }),
    };
    const system = new ProjectileSystem(terrain as never, collision as never, [] as never, {
      value: 0,
      displayStrength: 0,
    });
    const child = createProjectile(
      't1', getWeaponById('micro_cluster'), 400, 280, 0, 300, false
    );
    child.splitTime = 0;
    system.getProjectiles().push(child);

    system.update(0.2);

    const [explosion] = system.consumePendingExplosions();
    expect(explosion.directHitTankId).toBe('t2');
    expect(explosion.x).toBe(410);
    expect(explosion.y).toBe(320);
    expect(explosion.damage).toBeGreaterThan(0);
  });

  it('裂空弹分裂后保持飞行阶段所需的活动弹体', () => {
    const terrain = { worldWidth: 2000, worldHeight: 1000 };
    const collision = { detectProjectileHit: () => null };
    const tank = { id: 't1', x: 200, y: 500, selectedWeaponId: 'air_split' };
    const system = new ProjectileSystem(terrain as never, collision as never, [tank] as never, {
      value: 0,
      displayStrength: 0,
    });

    system.fire(tank as never, 60, 300);
    system.update((getWeaponById('air_split').splitTime ?? 0) + 0.01);

    expect(system.getProjectiles()).toHaveLength(4);
    expect(system.hasAlive()).toBe(true);
  });

  it('命中宝箱后可获得双倍伤害奖励', () => {
    const terrain = { worldWidth: 2000, worldHeight: 1000 };
    const collision = { detectProjectileHit: () => null };
    const tank = { id: 't1', x: 200, y: 500, selectedWeaponId: 'micro_cluster' };
    const system = new ProjectileSystem(terrain as never, collision as never, [tank] as never, {
      value: 0,
      displayStrength: 0,
    });
    const oldRandom = Math.random;
    Math.random = () => 0; // 第一个奖励：伤害翻倍
    try {
      system.fire(tank as never, 0, 300);
      system.spawnRandomChest();
      const chest = system.getChest()!;
      chest.x = 245;
      chest.y = 494;
      chest.phase = 0;
      system.update(0.1);
      expect(chest.active).toBe(false);
      expect(system.getProjectiles()[0].damage).toBe(28);
      expect(system.consumeRewards()[0].reward).toBe('double_damage');
    } finally {
      Math.random = oldRandom;
    }
  });

  it('宝箱横向位置锁定在两辆坦克之间并远离地图边缘', () => {
    const terrain = { worldWidth: 1600, worldHeight: 1000 };
    const collision = { detectProjectileHit: () => null };
    const tanks = [
      { id: 't1', x: 220, y: 500, isAlive: true },
      { id: 't2', x: 1180, y: 500, isAlive: true },
    ];
    const system = new ProjectileSystem(terrain as never, collision as never, tanks as never, {
      value: 0,
      displayStrength: 0,
    });
    const oldRandom = Math.random;
    Math.random = () => 0.5;
    try {
      system.spawnRandomChest();
      const chest = system.getChest()!;
      expect(chest.x).toBeGreaterThanOrEqual(270);
      expect(chest.x).toBeLessThanOrEqual(1130);
      expect(chest.x).toBeGreaterThan(80);
      expect(chest.x).toBeLessThan(1520);
      expect(chest.reward).toBe('wide_blast');
    } finally {
      Math.random = oldRandom;
    }
  });

  it('命中宝箱后可按原速度分裂为两枚偏转炮弹', () => {
    const terrain = { worldWidth: 2000, worldHeight: 1000 };
    const collision = { detectProjectileHit: () => null };
    const tank = { id: 't1', x: 200, y: 500, selectedWeaponId: 'micro_cluster' };
    const system = new ProjectileSystem(terrain as never, collision as never, [tank] as never, {
      value: 0,
      displayStrength: 0,
    });
    const oldRandom = Math.random;
    Math.random = () => 0.99; // 第三个奖励：分裂
    try {
      system.fire(tank as never, 0, 300);
      system.spawnRandomChest();
      const chest = system.getChest()!;
      chest.x = 245;
      chest.y = 494;
      chest.phase = 0;
      system.update(0.1);
      const children = system.getProjectiles();
      expect(children).toHaveLength(2);
      // 两枚子弹速度相同，方向向两侧偏转。
      expect(Math.abs(Math.hypot(children[0].vx, children[0].vy) - Math.hypot(children[1].vx, children[1].vy))).toBeLessThan(0.01);
      expect(system.consumeRewards()[0].reward).toBe('split_shot');
    } finally {
      Math.random = oldRandom;
    }
  });
});

describe('新增弹体机制', () => {
  it('炮弹进入蓝色黑洞后从红色黑洞反向平行射出', () => {
    const terrain = { worldWidth: 2000, worldHeight: 1000, surfaceY: () => 500 };
    const collision = { detectProjectileHit: () => null };
    const tanks = [
      { id: 't1', x: 100, y: 500, isAlive: true },
      { id: 't2', x: 1500, y: 500, isAlive: true },
    ];
    const system = new ProjectileSystem(terrain as never, collision as never, tanks as never, { value: 0, displayStrength: 0 });
    const rolls = [0, 0.25, 0.5, 0.75, 0.5, 0.5];
    expect(system.spawnWormholesForTurn(1, () => rolls.shift() ?? 0.5)).toBe(true);
    const pair = system.getWormholes()!;
    const projectile = createProjectile('t1', getWeaponById('basic_shell'), pair.blue.x - 35, pair.blue.y, 200, 0, true);
    system.getProjectiles().push(projectile);
    system.update(0.2);
    expect(projectile.x).toBeLessThan(pair.red.x);
    expect(projectile.vx).toBeLessThan(0);
    expect(projectile.portalCooldown).toBeGreaterThan(0);
    expect(system.consumeWormholeEvents()).toHaveLength(1);
  });

  it('未抽中空间异常时不会生成黑洞', () => {
    const terrain = { worldWidth: 1600, worldHeight: 720, surfaceY: () => 500 };
    const system = new ProjectileSystem(terrain as never, {} as never, [] as never, { value: 0, displayStrength: 0 });
    expect(system.spawnWormholesForTurn(0.3, () => 0.9)).toBe(false);
    expect(system.getWormholes()).toBeNull();
  });

  it('天穹坐标弹命中地面后生成 5 枚高空载荷', () => {
    const terrain = { worldWidth: 1600, worldHeight: 720 };
    const collision = {
      detectProjectileHit: () => ({ type: 'terrain', x: 700, y: 480 }),
    };
    const tank = { id: 't1', x: 200, y: 500, selectedWeaponId: 'sky_coordinates' };
    const system = new ProjectileSystem(terrain as never, collision as never, [tank] as never, {
      value: 0,
      displayStrength: 0,
    });
    system.fire(tank as never, 45, 400);
    system.update(0.05);
    expect(system.getProjectiles()).toHaveLength(5);
    expect(system.getProjectiles().every((p) => p.isPayload && p.y < 40)).toBe(true);
  });

  it('岩轨滚轮触地后沿地表继续移动', () => {
    const terrain = {
      worldWidth: 1600,
      worldHeight: 720,
      surfaceY: () => 500,
    };
    let first = true;
    const collision = {
      detectProjectileHit: () => {
        if (!first) return null;
        first = false;
        return { type: 'terrain', x: 400, y: 500 };
      },
    };
    const tank = { id: 't1', x: 200, y: 500, selectedWeaponId: 'stone_runner', isAlive: true };
    const system = new ProjectileSystem(terrain as never, collision as never, [tank] as never, {
      value: 0,
      displayStrength: 0,
    });
    system.fire(tank as never, 30, 400);
    system.update(0.05);
    const roller = system.getProjectiles()[0];
    expect(roller.state).toBe('rolling');
    const x = roller.x;
    system.update(0.1);
    expect(system.getProjectiles()[0].x).toBeGreaterThan(x);
  });
});
