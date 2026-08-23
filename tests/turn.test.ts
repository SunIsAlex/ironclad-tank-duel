import { describe, it, expect } from 'vitest';
import { TurnManager } from '../src/systems/TurnManager';
import { DamageSystem } from '../src/systems/DamageSystem';
import { createTank } from '../src/entities/Tank';

describe('回合管理', () => {
  it('初始玩家为 0', () => {
    const t1 = createTank('t1', 0, 'P1', 100, 100, 100, 200, 'basic_shell');
    const t2 = createTank('t2', 1, 'P2', 200, 100, 100, 200, 'basic_shell');
    const ds = new DamageSystem();
    const tm = new TurnManager([t1, t2], ds);
    tm.reset([t1, t2]);
    tm.startGame();
    expect(tm.currentPlayer).toBe(0);
    expect(tm.roundCount).toBe(1);
  });

  it('切换玩家 -> 1', () => {
    const t1 = createTank('t1', 0, 'P1', 100, 100, 100, 200, 'basic_shell');
    const t2 = createTank('t2', 1, 'P2', 200, 100, 100, 200, 'basic_shell');
    const ds = new DamageSystem();
    const tm = new TurnManager([t1, t2], ds);
    tm.reset([t1, t2]);
    tm.startGame();
    tm.switchPlayer();
    expect(tm.currentPlayer).toBe(1);
    expect(tm.roundCount).toBe(2);
  });

  it('跳过已死亡的坦克', () => {
    const t1 = createTank('t1', 0, 'P1', 100, 100, 100, 200, 'basic_shell');
    const t2 = createTank('t2', 1, 'P2', 200, 100, 100, 200, 'basic_shell');
    t2.isAlive = false;
    const ds = new DamageSystem();
    const tm = new TurnManager([t1, t2], ds);
    tm.reset([t1, t2]);
    tm.startGame();
    tm.switchPlayer();
    // 只有 t1 还活着，应该触发 GAME_OVER
    expect(tm.phase).toBe('GAME_OVER');
  });

  it('回合开始时重置当前坦克燃料', () => {
    const t1 = createTank('t1', 0, 'P1', 100, 100, 100, 200, 'basic_shell');
    const ds = new DamageSystem();
    const tm = new TurnManager([t1], ds);
    tm.turnFuel = 150;
    tm.reset([t1]);
    tm.startGame();
    tm.enterTurnStart();
    expect(t1.movementFuel).toBe(150);
  });

  it('双方阵亡判定平局', () => {
    const t1 = createTank('t1', 0, 'P1', 100, 100, 100, 200, 'basic_shell');
    const t2 = createTank('t2', 1, 'P2', 200, 100, 100, 200, 'basic_shell');
    t1.isAlive = false;
    t2.isAlive = false;
    const ds = new DamageSystem();
    const tm = new TurnManager([t1, t2], ds);
    tm.reset([t1, t2]);
    tm.startGame();
    const v = tm.checkVictory();
    expect(v.isOver).toBe(true);
    expect(v.isDraw).toBe(true);
  });

  it('单方存活判定为胜', () => {
    const t1 = createTank('t1', 0, 'P1', 100, 100, 100, 200, 'basic_shell');
    const t2 = createTank('t2', 1, 'P2', 200, 100, 100, 200, 'basic_shell');
    t2.isAlive = false;
    const ds = new DamageSystem();
    const tm = new TurnManager([t1, t2], ds);
    tm.reset([t1, t2]);
    tm.startGame();
    const v = tm.checkVictory();
    expect(v.isOver).toBe(true);
    expect(v.isDraw).toBe(false);
    expect(v.winnerIndex).toBe(0);
  });

  it('允许坦克驶下陡峭弹坑边缘，但仍阻止攀上陡壁', () => {
    const tank = createTank('t1', 0, 'P1', 96, 100, 100, 200, 'basic_shell');
    const tm = new TurnManager([tank], new DamageSystem());
    // x < 100 是坑外地面，x >= 100 是低 80px 的坑底。
    const craterTerrain = {
      worldWidth: 500,
      surfaceY: (x: number) => x < 100 ? 100 : 180,
    };

    expect(tm.moveTank(tank, 1, 4, craterTerrain)).toBe(true);
    expect(tank.x).toBe(100);
    expect(tank.y).toBe(180);

    // 反向面对同一垂直坑壁时属于陡峭上坡，应继续受爬坡能力限制。
    expect(tm.moveTank(tank, -1, 4, craterTerrain)).toBe(false);
    expect(tank.x).toBe(100);
  });

  it('履带可越过弹坑边缘的窄尖唇进入坑内', () => {
    const tank = createTank('t1', 0, 'P1', 120, 100, 100, 200, 'basic_shell');
    const tm = new TurnManager([tank], new DamageSystem());
    const craterWithLip = {
      worldWidth: 500,
      surfaceY: (x: number) => {
        if (x >= 116) return 100;
        if (x >= 112) return 92; // 爆炸边缘残留的 8px 窄凸起
        return 170; // 坑内
      },
    };

    expect(tm.moveTank(tank, -1, 12, craterWithLip)).toBe(true);
    expect(tank.x).toBe(108);
    expect(tank.y).toBe(170);
  });

  it('使用履带姿态时驶入宽坑由重力接管，不瞬移到坑底', () => {
    const tank = createTank('t1', 0, 'P1', 98, 100, 100, 200, 'basic_shell');
    const tm = new TurnManager([tank], new DamageSystem());
    const terrain = {
      worldWidth: 500,
      surfaceY: (x: number) => x < 100 ? 100 : 180,
      tankPose: (x: number) => ({
        y: x < 100 ? 100 : 180,
        angle: 0,
        supported: true,
      }),
    };

    expect(tm.moveTank(tank, 1, 2, terrain)).toBe(true);
    expect(tank.x).toBe(100);
    expect(tank.y).toBe(100);
    expect(tank.isGrounded).toBe(false);
  });

  it('亚像素移动距离会完整累计，不因分段取整产生卡顿', () => {
    const tank = createTank('t1', 0, 'P1', 100, 100, 100, 200, 'basic_shell');
    const tm = new TurnManager([tank], new DamageSystem());
    const terrain = {
      worldWidth: 500,
      surfaceY: () => 100,
      tankPose: () => ({ y: 100, angle: 0, supported: true }),
    };

    expect(tm.moveTank(tank, 1, 1.125, terrain)).toBe(true);
    expect(tank.x).toBeCloseTo(101.125);
    expect(tank.movementFuel).toBeCloseTo(198.875);
  });
});
