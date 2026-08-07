// 通用数学工具

export const TAU = Math.PI * 2;
export const DEG2RAD = Math.PI / 180;

export function clamp(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function degToRad(deg: number): number {
  return deg * DEG2RAD;
}

export function radToDeg(rad: number): number {
  return rad / DEG2RAD;
}

// 将角度限制到 [0, 360)
export function normalizeAngle360(deg: number): number {
  let v = deg % 360;
  if (v < 0) v += 360;
  return v;
}

// 将角度限制到 [-180, 180)
export function normalizeAngle180(deg: number): number {
  let v = deg % 360;
  if (v >= 180) v -= 360;
  if (v < -180) v += 360;
  return v;
}

// 取两个角度之间最短的差值（单位：度）
export function angleDelta(a: number, b: number): number {
  return normalizeAngle180(b - a);
}

export function approach(current: number, target: number, maxDelta: number): number {
  const d = angleDelta(current, target);
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

export function smoothApproach(current: number, target: number, factor: number, dt: number): number {
  const t = 1 - Math.pow(1 - factor, dt * 60);
  return current + (target - current) * t;
}

export function pointDistance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function pointDistance2(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

// 线性插值段，避免炮弹高速穿透；返回与圆心距离最近的位置
export function segmentCircleHit(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  r: number
): { t: number; x: number; y: number } | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;
  const a = dx * dx + dy * dy;
  if (a === 0) return null;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  const t2 = (-b + sq) / (2 * a);
  let t: number | null = null;
  if (t1 >= 0 && t1 <= 1) t = t1;
  else if (t2 >= 0 && t2 <= 1) t = t2;
  if (t === null) return null;
  return { t, x: x1 + dx * t, y: y1 + dy * t };
}

// 角度 -> 单位向量
export function angleToVector(deg: number): { x: number; y: number } {
  const r = degToRad(deg);
  return { x: Math.cos(r), y: -Math.sin(r) };
}
