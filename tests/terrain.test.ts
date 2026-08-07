import { describe, it, expect } from 'vitest';
import { hashStringToSeed, createRng } from '../src/utils/random';

// 这些测试不需要 DOM canvas，验证种子可复现性

describe('随机种子复现', () => {
  it('相同字符串生成的 hash 一致', () => {
    expect(hashStringToSeed('ABC123')).toBe(hashStringToSeed('ABC123'));
  });

  it('不同字符串生成的 hash 大概率不同', () => {
    expect(hashStringToSeed('ABC123')).not.toBe(hashStringToSeed('ABC124'));
  });

  it('相同种子产生的随机序列一致', () => {
    const a = createRng('seed1');
    const b = createRng('seed1');
    const seqA = [a.next(), a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it('空种子产生随机（仍合法）', () => {
    const r = createRng('');
    expect(typeof r.next()).toBe('number');
    expect(r.next()).toBeGreaterThanOrEqual(0);
    expect(r.next()).toBeLessThan(1);
  });

  it('range / int 在范围内', () => {
    const r = createRng('xyz');
    for (let i = 0; i < 50; i++) {
      const v = r.range(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(20);
      const n = r.int(0, 5);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(5);
    }
  });
});
