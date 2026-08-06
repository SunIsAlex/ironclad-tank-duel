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
});
