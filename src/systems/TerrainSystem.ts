import { WORLD_CONFIG, GROUND_THICKNESS } from '../config/gameConfig';
import type { RNG } from '../utils/random';
import { createRng } from '../utils/random';
import { getMapPreset } from '../config/mapConfig';

// 地形系统：维护离屏 Canvas + 1D 高度图 + 低分辨率碰撞掩码
// 弹坑通过 destination-out 擦除并同步更新高度图与掩码

export class TerrainSystem {
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly ceiling: number; // 地形最高点

  // 离屏地形 Canvas（实体部分）
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  // 高度图：每列地表高度
  heightMap: Int32Array;
  // 低分辨率掩码（用于快速碰撞检测）。1 = 实体，0 = 空
  // 每格代表 4x4 像素
  readonly maskScale = 4;
  maskWidth: number;
  maskHeight: number;
  mask: Uint8Array;

  initialized = false;

  constructor() {
    this.worldWidth = WORLD_CONFIG.worldWidth;
    this.worldHeight = WORLD_CONFIG.worldHeight;
    this.ceiling = this.worldHeight - GROUND_THICKNESS;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.worldWidth;
    this.canvas.height = this.worldHeight;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D 上下文初始化失败');
    this.ctx = ctx;
    this.heightMap = new Int32Array(this.worldWidth);
    this.maskWidth = Math.ceil(this.worldWidth / this.maskScale);
    this.maskHeight = Math.ceil(this.worldHeight / this.maskScale);
    this.mask = new Uint8Array(this.maskWidth * this.maskHeight);
  }

  generate(seed: string, mapPreset = 'open_arena'): void {
    void seed; // seed 已通过 createRng 使用
    const rng = createRng(seed);
    const preset = getMapPreset(mapPreset);
    const w = this.worldWidth;
    const h = this.worldHeight;
    const baseY = h - 220;

    const points = new Float32Array(w);

    // 平缓地形：低频大幅 + 极弱高频细节
    // 最大瞬时坡度 ≈ amp * freq，控制在 ≤ 0.5 以保证 maxClimbSlope(0.85) 可上坡
    const amp1 = rng.range(34, 52) * preset.waveScale;
    const amp2 = rng.range(12, 24) * preset.waveScale;
    const amp3 = rng.range(4, 9) * preset.waveScale;
    const phase1 = rng.range(0, Math.PI * 2);
    const phase2 = rng.range(0, Math.PI * 2);
    const phase3 = rng.range(0, Math.PI * 2);
    // 频率更小 -> 波长更长 -> 坡度更缓
    const freq1 = rng.range(0.0025, 0.0045);
    const freq2 = rng.range(0.006, 0.011);
    const freq3 = rng.range(0.018, 0.028);

    // 1D 平滑随机游走（少量大节点），幅度受限
    const nodeList = Math.max(8, Math.floor(w / 260));
    const nodeXs: number[] = [];
    const nodeYs: number[] = [];
    for (let i = 0; i <= nodeList; i++) {
      nodeXs.push((i / nodeList) * (w - 1));
      nodeYs.push(rng.range(-22, 36));
    }

    function smoothNoise(x: number): number {
      for (let i = 0; i < nodeXs.length - 1; i++) {
        const x0 = nodeXs[i];
        const x1 = nodeXs[i + 1];
        if (x >= x0 && x <= x1) {
          const t = (x - x0) / (x1 - x0);
          const yt = t * t * (3 - 2 * t);
          return nodeYs[i] * (1 - yt) + nodeYs[i + 1] * yt;
        }
      }
      return nodeYs[nodeYs.length - 1];
    }

    for (let x = 0; x < w; x++) {
      const u = x / Math.max(1, w - 1);
      let macro = 0;
      if (preset.id === 'twin_hills') {
        macro = -54 * gaussian(u, 0.24, 0.13) - 54 * gaussian(u, 0.76, 0.13) + 18 * gaussian(u, 0.5, 0.2);
      } else if (preset.id === 'central_plateau') {
        macro = -64 * gaussian(u, 0.5, 0.18);
      } else if (preset.id === 'lowland_basin') {
        macro = 58 * gaussian(u, 0.5, 0.3);
      } else if (preset.id === 'step_corridor') {
        macro = -24 * Math.sin(u * Math.PI * 5) - 18 * Math.sin(u * Math.PI * 2.5);
      } else if (preset.id === 'training_range') {
        macro = 8 * Math.sin(u * Math.PI * 2);
      }
      const y =
        baseY +
        macro -
        Math.sin(x * freq1 + phase1) * amp1 -
        Math.sin(x * freq2 + phase2) * amp2 -
        Math.sin(x * freq3 + phase3) * amp3 -
        smoothNoise(x) * 0.4;
      points[x] = y;
    }

    // 限坡：对相邻列坡度做软裁剪，避免局部尖峰
    const maxSlope = 0.75;
    for (let x = 1; x < w; x++) {
      const dy = points[x] - points[x - 1];
      if (Math.abs(dy) > maxSlope) {
        points[x] = points[x - 1] + Math.sign(dy) * maxSlope;
      }
    }
    // 反向再扫一遍，保证单调限制
    for (let x = w - 2; x >= 0; x--) {
      const dy = points[x] - points[x + 1];
      if (Math.abs(dy) > maxSlope) {
        points[x] = points[x + 1] + Math.sign(dy) * maxSlope;
      }
    }

    // 边缘抬升，让坦克不容易掉出地图
    for (let x = 0; x < 80; x++) {
      const t = 1 - x / 80;
      points[x] -= 24 * t * t;
    }
    for (let x = w - 80; x < w; x++) {
      const t = 1 - (w - 1 - x) / 80;
      points[x] -= 24 * t * t;
    }

    // 写入 heightMap（地表 Y）
    for (let x = 0; x < w; x++) {
      this.heightMap[x] = Math.round(points[x]);
    }

    this.drawTerrain();
    this.rebuildMask();
    this.initialized = true;
  }

  private drawTerrain(): void {
    const ctx = this.ctx;
    const w = this.worldWidth;
    const h = this.worldHeight;

    // 清空
    ctx.clearRect(0, 0, w, h);

    // 渐变填充：草层 -> 土层
    const grad = ctx.createLinearGradient(0, this.ceiling, 0, h);
    grad.addColorStop(0, '#6ab04c');
    grad.addColorStop(0.05, '#5a9036');
    grad.addColorStop(0.18, '#7d5a3c');
    grad.addColorStop(0.55, '#5b3d24');
    grad.addColorStop(1, '#321d10');
    ctx.fillStyle = grad;

    // 绘制实体地形多边形
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x < w; x++) {
      ctx.lineTo(x, this.heightMap[x]);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // 顶部高光线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      if (x === 0) ctx.moveTo(x, this.heightMap[x]);
      else ctx.lineTo(x, this.heightMap[x]);
    }
    ctx.stroke();

    // 草点装饰
    ctx.fillStyle = '#8bc34a';
    for (let x = 0; x < w; x += 6) {
      const y = this.heightMap[x];
      const r = (sinLookup(x * 0.3) + 1) * 0.5;
      ctx.fillRect(x, y - 2 - r * 2, 2, 3);
    }
  }

  // 在某 x 查询最新地表 Y（用于落地检测）
  surfaceY(x: number): number {
    const xi = Math.floor(x);
    if (xi < 0) return this.heightMap[0];
    if (xi >= this.worldWidth) return this.heightMap[this.worldWidth - 1];
    // 线性插值
    const a = this.heightMap[xi];
    const b = xi + 1 < this.worldWidth ? this.heightMap[xi + 1] : a;
    const t = x - xi;
    return a + (b - a) * t;
  }

  // 判断某像素是否为实体地形
  isSolid(x: number, y: number): boolean {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || xi >= this.worldWidth) return false;
    if (yi >= this.worldHeight) return false;
    if (yi < 0) return false;
    // 先用高度图快速判断
    if (yi < this.heightMap[xi]) return false;
    // 再用掩码精确判断（弹坑可能让中间变空）
    const mx = (xi / this.maskScale) | 0;
    const my = (yi / this.maskScale) | 0;
    if (mx < 0 || mx >= this.maskWidth || my < 0 || my >= this.maskHeight) return false;
    return this.mask[my * this.maskWidth + mx] === 1;
  }

  // 在弹坑区域擦除地形
  carveCircle(cx: number, cy: number, radius: number, irregular = true): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    if (!irregular) {
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    } else {
      // 不规则边缘
      const steps = 18;
      const seed = (cx * 13.7 + cy * 7.3) | 0;
      for (let i = 0; i <= steps; i++) {
        const ang = (i / steps) * Math.PI * 2;
        const r = radius * (0.88 + 0.12 * pseudo(seed + i));
        const px = cx + Math.cos(ang) * r;
        const py = cy + Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // 更新掩码与高度图局部
    this.invalidateRegion(cx - radius, cy - radius, cx + radius, cy + radius);
  }

  // 仅在 mask 上擦除，不影响 Canvas（用于钻地等纯碰撞修改，目前未使用）
  invalidateRegion(x0: number, y0: number, x1: number, y1: number): void {
    const xi0 = Math.max(0, Math.floor(x0));
    const xi1 = Math.min(this.worldWidth - 1, Math.ceil(x1));
    const yi0 = Math.max(0, Math.floor(y0));
    const yi1 = Math.min(this.worldHeight - 1, Math.ceil(y1));
    if (xi1 < xi0 || yi1 < yi0) return;

    // 读取该区域像素并更新掩码
    const region = this.ctx.getImageData(xi0, yi0, xi1 - xi0 + 1, yi1 - yi0 + 1);
    const data = region.data;
    const rw = xi1 - xi0 + 1;
    for (let py = 0; py < yi1 - yi0 + 1; py++) {
      for (let px = 0; px < rw; px++) {
        const alpha = data[(py * rw + px) * 4 + 3];
        const realX = xi0 + px;
        const realY = yi0 + py;
        const mx = (realX / this.maskScale) | 0;
        const my = (realY / this.maskScale) | 0;
        if (mx < 0 || mx >= this.maskWidth || my < 0 || my >= this.maskHeight) continue;
        const idx = my * this.maskWidth + mx;
        if (alpha < 64) {
          this.mask[idx] = 0;
        } else if (this.mask[idx] === 0) {
          // 不主动恢复为 1，避免反复写入
        }
      }
    }

    // 更新该 x 范围的高度图
    for (let x = xi0; x <= xi1; x++) {
      this.heightMap[x] = this.computeSurfaceY(x);
    }
  }

  // 重新计算某列地表 Y（从顶向下找第一个实体像素）
  private computeSurfaceY(x: number): number {
    // 先尝试用 mask 快速判断
    const ctx = this.ctx;
    // 读 1 像素宽列
    const img = ctx.getImageData(x, 0, 1, this.worldHeight);
    const data = img.data;
    for (let y = 0; y < this.worldHeight; y++) {
      const a = data[y * 4 + 3];
      if (a > 64) return y;
    }
    return this.worldHeight;
  }

  // 基于掩码的快速 surface Y 查询（用于坦克落地）
  private rebuildMask(): void {
    this.mask.fill(0);
    const ctx = this.ctx;
    const w = this.worldWidth;
    const h = this.worldHeight;
    const mw = this.maskWidth;
    const mh = this.maskHeight;
    const s = this.maskScale;
    // 按块采样
    for (let my = 0; my < mh; my++) {
      for (let mx = 0; mx < mw; mx++) {
        const x = mx * s;
        const y = my * s;
        // 取中心像素 alpha
        const img = ctx.getImageData(x + (s >> 1), y + (s >> 1), 1, 1);
        if (img.data[3] > 64) {
          this.mask[my * mw + mx] = 1;
        }
      }
    }
  }

  // 检查某段是否完全是空的（用于坦克下落判断）
  isClearVertical(x: number, y0: number, y1: number): boolean {
    const xi = Math.floor(x);
    if (xi < 0 || xi >= this.worldWidth) return false;
    const a = Math.min(y0, y1);
    const b = Math.max(y0, y1);
    const startY = Math.max(0, Math.floor(a));
    const endY = Math.min(this.worldHeight - 1, Math.floor(b));
    for (let y = startY; y <= endY; y++) {
      if (this.isSolid(xi, y)) return false;
    }
    return true;
  }

  // 给定 x，查找下方支撑的实体 Y（从当前 y 向下找第一个实体）
  findSupportY(x: number, y: number): number {
    const xi = Math.floor(x);
    if (xi < 0) return this.heightMap[0];
    if (xi >= this.worldWidth) return this.heightMap[this.worldWidth - 1];
    for (let yy = Math.floor(y); yy < this.worldHeight; yy++) {
      if (this.isSolid(xi, yy)) return yy;
    }
    return this.worldHeight;
  }

  // 重置（清空所有改变）
  destroy(): void {
    this.initialized = false;
  }
}

function gaussian(x: number, center: number, width: number): number {
  const d = (x - center) / width;
  return Math.exp(-d * d);
}

// 简单 hash伪随机（不依赖 RNG 实例，避免破坏种子图）
function pseudo(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function sinLookup(x: number): number {
  return Math.sin(x);
}
