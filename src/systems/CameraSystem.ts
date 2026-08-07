import { clamp, smoothApproach } from '../utils/math';

const TANK_SCREEN_Y_RATIO = 0.6;
const TANK_SAFE_BOTTOM_RATIO = 0.76;

export class CameraSystem {
  x = 0;
  y = 0;
  zoom = 1;
  targetX = 0;
  targetY = 0;
  shakeX = 0;
  shakeY = 0;
  shakeMagnitude = 0;
  shakeTime = 0;
  viewportWidth = 800;
  viewportHeight = 480;
  worldWidth: number;
  worldHeight: number;
  screenShakeEnabled = true;
  reducedMotion = false;
  private tankFocus: { x: number; y: number } | null = null;

  constructor(worldWidth: number, worldHeight: number) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
  }

  setViewport(w: number, h: number): void {
    this.viewportWidth = w;
    this.viewportHeight = h;
    // 同时受世界宽、高约束，确保扩大后的整张地图和双方坦克始终可见。
    // 不能设置过高的最小缩放，否则窄屏会再次裁掉地图左右两端。
    const fitWidth = w / this.worldWidth;
    const fitHeight = h / this.worldHeight;
    this.zoom = clamp(Math.min(fitWidth, fitHeight), 0.1, 2.5);
    if (this.tankFocus) this.setTankTarget(this.tankFocus.x, this.tankFocus.y);
  }

  follow(x: number, y: number): void {
    this.tankFocus = null;
    this.targetX = x;
    this.targetY = y;
  }

  /** 跟随坦克时让其位于画面中下部，并在平滑追赶期间保持在安全区内。 */
  followTank(x: number, y: number): void {
    this.tankFocus = { x, y };
    this.setTankTarget(x, y);
  }

  private setTankTarget(x: number, y: number): void {
    const visibleHeight = this.viewportHeight / this.zoom;
    this.targetX = x;
    this.targetY = y - (TANK_SCREEN_Y_RATIO - 0.5) * visibleHeight;
  }

  shake(magnitude: number, time: number): void {
    if (!this.screenShakeEnabled || this.reducedMotion) return;
    if (magnitude > this.shakeMagnitude) {
      this.shakeMagnitude = magnitude;
      this.shakeTime = time;
    }
  }

  update(dt: number): void {
    this.x = smoothApproach(this.x, this.targetX, 0.18, dt);
    this.y = smoothApproach(this.y, this.targetY, 0.18, dt);
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const t = Math.max(0, this.shakeTime);
      const intensity = this.shakeMagnitude * (t > 0 ? Math.min(1, t / 0.3) : 0);
      this.shakeX = (Math.random() * 2 - 1) * intensity;
      this.shakeY = (Math.random() * 2 - 1) * intensity;
      if (this.shakeTime <= 0) {
        this.shakeMagnitude = 0;
        this.shakeX = 0;
        this.shakeY = 0;
      }
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
    // 边界限制
    const halfW = this.viewportWidth / (2 * this.zoom);
    const halfH = this.viewportHeight / (2 * this.zoom);
    this.x = clamp(this.x, halfW, this.worldWidth - halfW);
    this.y = clamp(this.y, halfH, this.worldHeight - halfH);
    // 视口比世界还大时
    if (this.viewportWidth / this.zoom >= this.worldWidth) {
      this.x = this.worldWidth / 2;
    }
    if (this.viewportHeight / this.zoom >= this.worldHeight) {
      this.y = this.worldHeight / 2;
    }

    // 平滑镜头从高空炮弹切回地面时会产生明显滞后。只修正超出底部
    // 安全线的部分，既保留平滑感，也不会让坦克掉出画面。
    if (this.tankFocus && this.viewportHeight / this.zoom < this.worldHeight) {
      const minCameraY = this.tankFocus.y
        - (TANK_SAFE_BOTTOM_RATIO - 0.5) * this.viewportHeight / this.zoom;
      this.y = Math.max(this.y, minCameraY);
      this.y = Math.min(this.y, this.worldHeight - halfH);
    }
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const sx = (wx - this.x + this.shakeX) * this.zoom + this.viewportWidth / 2;
    const sy = (wy - this.y + this.shakeY) * this.zoom + this.viewportHeight / 2;
    return { x: sx, y: sy };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const wx = (sx - this.viewportWidth / 2) / this.zoom + this.x - this.shakeX;
    const wy = (sy - this.viewportHeight / 2) / this.zoom + this.y - this.shakeY;
    return { x: wx, y: wy };
  }

  // 给 canvas 上下文应用变换
  // 必须并入 dpr，否则在设备像素比 > 1 的手机上画面会被压缩到左上角
  applyTransform(ctx: CanvasRenderingContext2D, dpr = 1): void {
    const z = this.zoom * dpr;
    ctx.setTransform(z, 0, 0, z, 0, 0);
    ctx.translate(
      -this.x + this.shakeX + this.viewportWidth / (2 * this.zoom),
      -this.y + this.shakeY + this.viewportHeight / (2 * this.zoom)
    );
  }
}
