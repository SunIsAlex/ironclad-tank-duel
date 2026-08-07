// 基于 mulberry32 的可复现伪随机数生成器
// 支持以字符串作为种子生成确定性地图

export interface RNG {
  next(): number; // [0,1)
  range(min: number, max: number): number;
  int(min: number, max: number): number; // [min, max]
  pick<T>(arr: T[]): T;
  bool(): boolean;
}

export function hashStringToSeed(str: string): number {
  // cyrb53 简化版
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const seed = (h2 >>> 0) * 0x100000 + (h1 >>> 0);
  return seed >>> 0;
}

export function createRng(seedStr: string): RNG {
  // 若未指定种子，使用当前时间生成
  let seed: number;
  if (seedStr && seedStr.length > 0) {
    seed = hashStringToSeed(seedStr);
  } else {
    seed = (Math.random() * 0xffffffff) >>> 0;
  }

  let state = seed >>> 0;

  function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    range(min: number, max: number) {
      return min + next() * (max - min);
    },
    int(min: number, max: number) {
      return Math.floor(min + next() * (max - min + 1));
    },
    pick<T>(arr: T[]): T {
      return arr[Math.floor(next() * arr.length)];
    },
    bool() {
      return next() < 0.5;
    },
  };
}

// 生成默认随机种子字符串
export function generateRandomSeed(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}
