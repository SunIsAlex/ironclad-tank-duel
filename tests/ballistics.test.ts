import { describe, it, expect } from 'vitest';
import { angleToVector } from '../src/utils/math';

// 角度/力度 -> 初速度

describe('角度到向量', () => {
  it('0 度 -> 朝右', () => {
    const v = angleToVector(0);
    expect(v.x).toBeCloseTo(1, 5);
    expect(v.y).toBeCloseTo(0, 5);
  });
  it('90 度 -> 朝上（屏幕 y 负方向）', () => {
    const v = angleToVector(90);
    expect(v.x).toBeCloseTo(0, 5);
    expect(v.y).toBeCloseTo(-1, 5);
  });
  it('180 度 -> 朝左', () => {
    const v = angleToVector(180);
    expect(v.x).toBeCloseTo(-1, 5);
    expect(v.y).toBeCloseTo(0, 5);
  });
  it('45 度向量长度为 1', () => {
    const v = angleToVector(45);
    const len = Math.hypot(v.x, v.y);
    expect(len).toBeCloseTo(1, 5);
  });
});

// 给定角度和力度，初速度应该合理
describe('初速度计算', () => {
  it('power=350, angle=45，水平分量 = 垂直分量（45°）', () => {
    const v = angleToVector(45);
    const power = 350;
    const vx = v.x * power;
    const vy = v.y * power;
    expect(Math.abs(vx)).toBeCloseTo(Math.abs(vy), 2);
  });
});
