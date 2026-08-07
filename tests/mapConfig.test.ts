import { describe, expect, it } from 'vitest';
import { MAP_PRESETS } from '../src/config/mapConfig';
import { POWER_RANGE, WORLD_CONFIG } from '../src/config/gameConfig';

describe('大型多样地图配置', () => {
  it('战场尺寸与最大射程同步扩大', () => {
    expect(WORLD_CONFIG.worldWidth).toBe(2400);
    expect(WORLD_CONFIG.worldHeight).toBe(900);
    expect((POWER_RANGE.max ** 2) / WORLD_CONFIG.gravity).toBeGreaterThan(2200);
  });

  it('提供足够多且参数有差异的地形轮廓', () => {
    expect(MAP_PRESETS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(MAP_PRESETS.map((preset) => preset.shape)).size).toBeGreaterThanOrEqual(10);
    expect(Math.max(...MAP_PRESETS.map((preset) => preset.roughness))).toBeGreaterThan(1);
  });
});
