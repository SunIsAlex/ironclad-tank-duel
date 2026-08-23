import { WORLD_CONFIG, GROUND_THICKNESS } from '../config/gameConfig';
import { createRng } from '../utils/random';
import { getMapPreset, MAP_PRESETS, type TerrainShape } from '../config/mapConfig';

// 地形系统：全分辨率二值体素是碰撞的唯一真源，Canvas 只负责显示。
// 这样爆炸边缘的抗锯齿不会再让视觉地形与碰撞地形逐渐错位。

export interface TankTerrainPose {
  y: number;
  angle: number;
  supported: boolean;
}

export class TerrainSystem {
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly ceiling: number; // 地形最高点

  // 离屏地形 Canvas（实体部分）
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  // 高度图：每列地表高度
  heightMap: Int32Array;
  // 每个世界像素对应一格。1 = 实体，0 = 空；约占 2.1 MiB。
  private solid: Uint8Array;

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
    this.solid = new Uint8Array(this.worldWidth * this.worldHeight);
  }

  generate(seed: string, mapPreset = 'generated'): void {
    void seed; // seed 已通过 createRng 使用
    const rng = createRng(seed);
    const selectedPreset = getMapPreset(mapPreset);
    const preset = selectedPreset.shape === 'generated'
      ? rng.pick(MAP_PRESETS.filter((item) => item.shape !== 'generated' && item.shape !== 'training_range'))
      : selectedPreset;
    const w = this.worldWidth;
    const h = this.worldHeight;
    const baseY = h - 270;

    const points = new Float32Array(w);

    // 多尺度地貌：大轮廓决定战术结构，中高频变化负责制造落点与掩体差异。
    const amp1 = rng.range(52, 82) * preset.waveScale;
    const amp2 = rng.range(22, 42) * preset.waveScale;
    const amp3 = rng.range(7, 16) * preset.roughness;
    const phase1 = rng.range(0, Math.PI * 2);
    const phase2 = rng.range(0, Math.PI * 2);
    const phase3 = rng.range(0, Math.PI * 2);
    const freq1 = rng.range(0.0018, 0.0032);
    const freq2 = rng.range(0.005, 0.009);
    const freq3 = rng.range(0.014, 0.025);

    // 1D 平滑随机游走（少量大节点），幅度受限
    const nodeList = Math.max(10, Math.floor(w / 180));
    const nodeXs: number[] = [];
    const nodeYs: number[] = [];
    for (let i = 0; i <= nodeList; i++) {
      nodeXs.push((i / nodeList) * (w - 1));
      nodeYs.push(rng.range(-52, 58) * preset.roughness);
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
      const macro = terrainMacro(preset.shape as TerrainShape, u);
      const y =
        baseY +
        macro -
        Math.sin(x * freq1 + phase1) * amp1 -
        Math.sin(x * freq2 + phase2) * amp2 -
        Math.sin(x * freq3 + phase3) * amp3 -
        smoothNoise(x) * 0.7;
      points[x] = clampTerrainHeight(y, h);
    }

    // 限坡：对相邻列坡度做软裁剪，避免局部尖峰
    const maxSlope = preset.maxSlope;
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

    this.rebuildSolidFromHeightMap();
    this.drawTerrain();
    this.initialized = true;
  }

  private drawTerrain(): void {
    const ctx = this.ctx;
    const w = this.worldWidth;
    const h = this.worldHeight;

    // 清空
    ctx.clearRect(0, 0, w, h);

    // 岩层渐变：冷色合金矿脉 + 深色可破坏地壳。
    const grad = ctx.createLinearGradient(0, this.ceiling, 0, h);
    grad.addColorStop(0, '#2f7184');
    grad.addColorStop(0.025, '#173f51');
    grad.addColorStop(0.14, '#172d3b');
    grad.addColorStop(0.55, '#101d28');
    grad.addColorStop(1, '#070d14');
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
    ctx.shadowColor = '#35d6ff';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(79, 222, 255, 0.72)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      if (x === 0) ctx.moveTo(x, this.heightMap[x]);
      else ctx.lineTo(x, this.heightMap[x]);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 发光矿晶与地表刻痕。
    for (let x = 0; x < w; x += 13) {
      const y = this.heightMap[x];
      const r = (sinLookup(x * 0.3) + 1) * 0.5;
      ctx.fillStyle = r > .72 ? 'rgba(89, 229, 255, .7)' : 'rgba(144, 188, 200, .24)';
      ctx.fillRect(x, y - 2 - r * 2, r > .72 ? 2 : 1, 2 + r * 2);
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
    return this.solid[yi * this.worldWidth + xi] === 1;
  }

  // 在弹坑区域擦除地形
  carveCircle(cx: number, cy: number, radius: number, irregular = true): void {
    if (!Number.isFinite(radius) || radius <= 0) return;
    const points = createCraterPoints(cx, cy, radius, irregular);

    // 先修改权威碰撞数据。使用像素中心和与绘制相同的多边形，重复爆炸
    // 只是幂等地清零，不会产生粗掩码常见的 4px 台阶和隐形坑沿。
    const xi0 = Math.max(0, Math.floor(cx - radius));
    const xi1 = Math.min(this.worldWidth - 1, Math.ceil(cx + radius));
    const yi0 = Math.max(0, Math.floor(cy - radius));
    const yi1 = Math.min(this.worldHeight - 1, Math.ceil(cy + radius));
    for (let y = yi0; y <= yi1; y++) {
      const row = y * this.worldWidth;
      for (let x = xi0; x <= xi1; x++) {
        if (pointInPolygon(x + 0.5, y + 0.5, points)) {
          this.solid[row + x] = 0;
        }
      }
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    this.rebuildSurfaceRange(xi0, xi1);
  }

  // Canvas 被外部修改时可显式同步该区域。常规爆炸不走这条慢路径。
  invalidateRegion(x0: number, y0: number, x1: number, y1: number): void {
    const xi0 = Math.max(0, Math.floor(x0));
    const xi1 = Math.min(this.worldWidth - 1, Math.ceil(x1));
    const yi0 = Math.max(0, Math.floor(y0));
    const yi1 = Math.min(this.worldHeight - 1, Math.ceil(y1));
    if (xi1 < xi0 || yi1 < yi0) return;

    // 精确同步每个像素，绝不把一个透明像素扩大成整个 4x4 空格。
    const region = this.ctx.getImageData(xi0, yi0, xi1 - xi0 + 1, yi1 - yi0 + 1);
    const data = region.data;
    const rw = xi1 - xi0 + 1;
    for (let py = 0; py < yi1 - yi0 + 1; py++) {
      for (let px = 0; px < rw; px++) {
        const alpha = data[(py * rw + px) * 4 + 3];
        const realX = xi0 + px;
        const realY = yi0 + py;
        this.solid[realY * this.worldWidth + realX] = alpha >= 128 ? 1 : 0;
      }
    }
    this.rebuildSurfaceRange(xi0, xi1);
  }

  // 重新计算某列地表 Y（从权威数据顶端找第一个实体像素）
  private computeSurfaceY(x: number): number {
    const w = this.worldWidth;
    for (let y = 0; y < this.worldHeight; y++) {
      if (this.solid[y * w + x] === 1) return y;
    }
    return this.worldHeight;
  }

  private rebuildSolidFromHeightMap(): void {
    this.solid.fill(0);
    const w = this.worldWidth;
    const h = this.worldHeight;
    for (let x = 0; x < w; x++) {
      const startY = Math.max(0, Math.min(h, this.heightMap[x]));
      for (let y = startY; y < h; y++) {
        this.solid[y * w + x] = 1;
      }
    }
  }

  private rebuildSurfaceRange(x0: number, x1: number): void {
    for (let x = x0; x <= x1; x++) this.heightMap[x] = this.computeSurfaceY(x);
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
    const startY = Math.max(0, Math.min(this.worldHeight - 1, Math.floor(y)));

    // 如果查询点已经进入地形，先回溯到这一实体层的上表面。击退或陡坡
    // 不会因此把履带留在土里；洞穴下方的第二层地面也仍能正确识别。
    if (this.isSolid(xi, startY)) {
      let yy = startY;
      while (yy > 0 && this.isSolid(xi, yy - 1)) yy--;
      return yy;
    }
    for (let yy = startY + 1; yy < this.worldHeight; yy++) {
      if (this.isSolid(xi, yy)) return yy;
    }
    return this.worldHeight;
  }

  /**
   * 求刚性履带在地形上的稳定姿态。左右履带区各自找接触点，再把车底
   * 提升到不会穿过任一采样点的位置。小裂缝可以跨越，整个履带下方被
   * 炸空时则会返回更深的支撑面，让坦克自然下落。
   */
  tankPose(x: number, fromY: number, trackWidth: number): TankTerrainPose {
    const halfTrack = trackWidth * 0.44;
    const sampleCount = 13;
    const samples: Array<{ offset: number; y: number }> = [];
    for (let i = 0; i < sampleCount; i++) {
      const offset = -halfTrack + (i / (sampleCount - 1)) * halfTrack * 2;
      const supportY = this.findSupportY(x + offset, fromY - 3);
      samples.push({ offset, y: supportY });
    }

    const valid = samples.filter((sample) => sample.y < this.worldHeight);
    if (valid.length === 0) {
      return { y: this.worldHeight, angle: 0, supported: false };
    }

    const wheelBand = halfTrack * 0.45;
    const left = highestSupport(valid.filter((sample) => sample.offset <= -wheelBand));
    const right = highestSupport(valid.filter((sample) => sample.offset >= wheelBand));
    let slope = 0;
    if (left && right) {
      slope = (right.y - left.y) / Math.max(1, right.offset - left.offset);
    } else {
      // 地图边缘或仅剩单侧接触时保持近似水平，避免角度无约束地翻转。
      const first = valid[0];
      const last = valid[valid.length - 1];
      if (first !== last) slope = (last.y - first.y) / Math.max(1, last.offset - first.offset);
    }
    slope = Math.max(-1.25, Math.min(1.25, slope));

    // 屏幕坐标 y 向下，最小值是最先碰到履带的地形约束。
    let anchorY = this.worldHeight;
    for (const sample of valid) {
      anchorY = Math.min(anchorY, sample.y - slope * sample.offset);
    }
    return {
      y: anchorY,
      angle: Math.atan(slope),
      supported: anchorY < this.worldHeight,
    };
  }

  // 重置（清空所有改变）
  destroy(): void {
    this.initialized = false;
  }
}

function terrainMacro(shape: TerrainShape, u: number): number {
  switch (shape) {
    case 'twin_hills':
      return -145 * gaussian(u, 0.23, 0.11) - 145 * gaussian(u, 0.77, 0.11) + 85 * gaussian(u, 0.5, 0.16);
    case 'central_plateau': {
      const edge = Math.abs(u - 0.5);
      return -135 / (1 + Math.exp((edge - 0.2) * 45)) + 35 * gaussian(u, 0.12, 0.08) + 35 * gaussian(u, 0.88, 0.08);
    }
    case 'lowland_basin':
      return 150 * gaussian(u, 0.5, 0.25) - 58 * gaussian(u, 0.12, 0.1) - 58 * gaussian(u, 0.88, 0.1);
    case 'step_corridor':
      return Math.round((u - 0.5) * 7) * 28 - 44 * Math.sin(u * Math.PI * 4);
    case 'canyon_divide':
      return -185 * gaussian(u, 0.5, 0.065) + 105 * gaussian(u, 0.32, 0.085) + 105 * gaussian(u, 0.68, 0.085);
    case 'crater_field':
      return 100 * gaussian(u, 0.2, 0.07) + 125 * gaussian(u, 0.5, 0.09) + 95 * gaussian(u, 0.8, 0.065)
        - 48 * gaussian(u, 0.34, 0.055) - 52 * gaussian(u, 0.66, 0.055);
    case 'rugged_peaks':
      return -105 * gaussian(u, 0.14, 0.055) + 115 * gaussian(u, 0.28, 0.07)
        - 155 * gaussian(u, 0.43, 0.065) + 125 * gaussian(u, 0.59, 0.075)
        - 135 * gaussian(u, 0.75, 0.06) + 85 * gaussian(u, 0.89, 0.05);
    case 'asymmetric_ridge':
      return 150 * (u - 0.5) - 135 * gaussian(u, 0.3, 0.105) + 90 * gaussian(u, 0.72, 0.13);
    case 'training_range':
      return 8 * Math.sin(u * Math.PI * 2);
    case 'open_arena':
    default:
      return -42 * Math.sin(u * Math.PI * 3) + 28 * Math.sin(u * Math.PI * 7);
  }
}

function clampTerrainHeight(y: number, worldHeight: number): number {
  return Math.max(worldHeight * 0.3, Math.min(worldHeight - 105, y));
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

function highestSupport(samples: Array<{ offset: number; y: number }>): { offset: number; y: number } | null {
  if (samples.length === 0) return null;
  let result = samples[0];
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].y < result.y) result = samples[i];
  }
  return result;
}

function createCraterPoints(
  cx: number,
  cy: number,
  radius: number,
  irregular: boolean
): Array<{ x: number; y: number }> {
  const steps = irregular ? 28 : 40;
  const seed = (cx * 13.7 + cy * 7.3 + radius * 5.1) | 0;
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const edgeScale = irregular ? 0.9 + 0.1 * pseudo(seed + i) : 1;
    points.push({
      x: cx + Math.cos(angle) * radius * edgeScale,
      y: cy + Math.sin(angle) * radius * edgeScale,
    });
  }
  return points;
}

function pointInPolygon(x: number, y: number, points: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (
      (a.y > y) !== (b.y > y) &&
      x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}
