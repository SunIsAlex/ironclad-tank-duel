import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TANK_CONFIG } from '../src/config/gameConfig';
import { TerrainSystem } from '../src/systems/TerrainSystem';

function fakeCanvasContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  return {
    clearRect: () => undefined,
    createLinearGradient: () => gradient,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    closePath: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    fillRect: () => undefined,
    save: () => undefined,
    restore: () => undefined,
    getImageData: (_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    }),
  } as unknown as CanvasRenderingContext2D;
}

beforeAll(() => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => fakeCanvasContext(),
    }),
  });
});

afterAll(() => vi.unstubAllGlobals());

describe('逐像素地形破坏', () => {
  it('弹坑同时更新碰撞和高度图，且不会扩大为粗网格空洞', () => {
    const terrain = new TerrainSystem();
    terrain.generate('pixel-crater', 'training_range');
    const x = 1200;
    const surface = terrain.surfaceY(x);
    const neighborX = x + 4;
    const neighborSurface = terrain.surfaceY(neighborX);

    terrain.carveCircle(x, surface, 2, false);

    expect(terrain.isSolid(x, surface + 1)).toBe(false);
    expect(terrain.surfaceY(x)).toBeGreaterThan(surface + 1);
    expect(terrain.isSolid(neighborX, neighborSurface + 1)).toBe(true);
    expect(terrain.surfaceY(neighborX)).toBe(neighborSurface);
  });

  it('宽弹坑让整段履带找到坑底，窄裂缝仍可被履带跨越', () => {
    const wideTerrain = new TerrainSystem();
    wideTerrain.generate('wide-crater', 'training_range');
    const x = 1200;
    const initialY = wideTerrain.tankPose(x, 0, TANK_CONFIG.bodyWidth).y;
    wideTerrain.carveCircle(x, initialY, 48, false);
    const droppedPose = wideTerrain.tankPose(x, initialY, TANK_CONFIG.bodyWidth);

    expect(droppedPose.supported).toBe(true);
    expect(droppedPose.y).toBeGreaterThan(initialY + 30);

    const narrowTerrain = new TerrainSystem();
    narrowTerrain.generate('narrow-crater', 'training_range');
    const narrowInitial = narrowTerrain.tankPose(x, 0, TANK_CONFIG.bodyWidth).y;
    narrowTerrain.carveCircle(x, narrowInitial, 4, false);
    const bridgedPose = narrowTerrain.tankPose(x, narrowInitial, TANK_CONFIG.bodyWidth);

    expect(bridgedPose.y).toBeLessThan(narrowInitial + 3);
  });
});
