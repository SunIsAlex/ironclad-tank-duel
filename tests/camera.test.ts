import { describe, expect, it } from 'vitest';
import { CameraSystem } from '../src/systems/CameraSystem';

describe('摄像机', () => {
  it('完整显示世界宽度和高度', () => {
    const camera = new CameraSystem(1600, 720);
    camera.setViewport(800, 360);

    expect(camera.viewportWidth / camera.zoom).toBeGreaterThanOrEqual(1600);
    expect(camera.viewportHeight / camera.zoom).toBeGreaterThanOrEqual(720);
  });

  it('从高空切回坦克时不会让坦克落到画面底部', () => {
    const camera = new CameraSystem(1600, 720);
    camera.setViewport(800, 360);
    camera.x = 800;
    camera.y = 180;
    camera.followTank(800, 560);

    camera.update(1 / 60);

    expect(camera.worldToScreen(800, 560).y).toBeLessThan(360);
  });

  it('视口尺寸变化后重新计算坦克构图位置', () => {
    const camera = new CameraSystem(1600, 720);
    camera.setViewport(800, 600);
    camera.followTank(500, 520);
    const oldTargetY = camera.targetY;

    camera.setViewport(1200, 360);

    expect(camera.targetY).not.toBe(oldTargetY);
    expect(camera.targetX).toBe(500);
  });
});
