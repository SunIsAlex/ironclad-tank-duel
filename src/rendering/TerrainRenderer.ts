import type { CameraSystem } from '../systems/CameraSystem';
import type { TerrainSystem } from '../systems/TerrainSystem';

export class TerrainRenderer {
  render(ctx: CanvasRenderingContext2D, terrain: TerrainSystem, camera: CameraSystem): void {
    // 直接绘制地形离屏 canvas
    // 由于地形是世界坐标，需要应用相机变换
    ctx.drawImage(terrain.canvas, 0, 0);
  }
}
