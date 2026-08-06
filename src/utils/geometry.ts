// 几何工具方法

import { PROJECTILE_MAX_SPEED } from '../config/gameConfig';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// 根据 dt 切段以便进行连续碰撞检测
export function segmentCountForSpeed(dt: number, speed: number): number {
  const distance = speed * dt;
  if (distance <= 1) return 1;
  const n = Math.ceil(distance / (PROJECTILE_MAX_SPEED / 120)); // 自适应步进
  return Math.max(1, Math.min(16, n));
}
