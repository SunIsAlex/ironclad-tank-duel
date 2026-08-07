import type { Tank } from '../types';

export const MATCH_WINS_REQUIRED = 3;
export const MATCH_MAX_GAMES = 5;
export const MAX_TURNS_PER_GAME = 10;

export interface RoundResult {
  winnerIndex: number;
  isDraw: boolean;
}

export function resolveRoundByHealth(tanks: Tank[]): RoundResult {
  if (tanks.length < 2 || tanks[0].health === tanks[1].health) {
    return { winnerIndex: -1, isDraw: true };
  }
  return {
    winnerIndex: tanks[0].health > tanks[1].health ? 0 : 1,
    isDraw: false,
  };
}

export function nextGameHealth(
  tanks: Tank[],
  winnerIndex: number,
  initialHealth: number
): [number, number] {
  const health: [number, number] = [initialHealth, initialHealth];
  if (winnerIndex >= 0 && winnerIndex < health.length) {
    health[winnerIndex] = Math.max(1, tanks[winnerIndex].health);
  }
  return health;
}

export function hasWonMatch(wins: readonly number[]): boolean {
  return wins.some((score) => score >= MATCH_WINS_REQUIRED);
}

