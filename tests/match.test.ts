import { describe, expect, it } from 'vitest';
import { createTank } from '../src/entities/Tank';
import {
  hasWonMatch,
  MATCH_MAX_GAMES,
  MATCH_WINS_REQUIRED,
  MAX_TURNS_PER_GAME,
  nextGameHealth,
  resolveRoundByHealth,
} from '../src/systems/MatchRules';

function tanks(health1: number, health2: number) {
  const t1 = createTank('t1', 0, 'P1', 100, 100, 100, 200, 'basic_shell');
  const t2 = createTank('t2', 1, 'P2', 200, 100, 100, 200, 'basic_shell');
  t1.health = health1;
  t2.health = health2;
  return [t1, t2];
}

describe('五局三胜规则', () => {
  it('使用三胜、最多五局、每局十回合的规则常量', () => {
    expect(MATCH_WINS_REQUIRED).toBe(3);
    expect(MATCH_MAX_GAMES).toBe(5);
    expect(MAX_TURNS_PER_GAME).toBe(10);
  });

  it('十回合后血量较高者获胜', () => {
    expect(resolveRoundByHealth(tanks(64, 31))).toEqual({ winnerIndex: 0, isDraw: false });
    expect(resolveRoundByHealth(tanks(12, 80))).toEqual({ winnerIndex: 1, isDraw: false });
  });

  it('血量相同时判为平局重赛', () => {
    expect(resolveRoundByHealth(tanks(45, 45))).toEqual({ winnerIndex: -1, isDraw: true });
  });

  it('下一局只有胜者继承血量，败者恢复初始血量', () => {
    expect(nextGameHealth(tanks(37, 0), 0, 100)).toEqual([37, 100]);
    expect(nextGameHealth(tanks(0, 22), 1, 100)).toEqual([100, 22]);
  });

  it('任一方取得三胜后结束比赛', () => {
    expect(hasWonMatch([2, 1])).toBe(false);
    expect(hasWonMatch([3, 2])).toBe(true);
  });
});
