// 程序化背景：天空渐变 + 远山 + 云
import { WORLD_CONFIG } from '../config/gameConfig';
import type { RNG } from '../utils/random';
import { createRng } from '../utils/random';

interface Cloud {
  x: number;
  y: number;
  scale: number;
  speed: number;
}

interface Mountain {
  points: number[];
  baseY: number;
  color: string;
}

export class BackgroundRenderer {
  private clouds: Cloud[] = [];
  private mountainsFar: Mountain;
  private mountainsNear: Mountain;
  private starfield: Array<{ x: number; y: number; r: number; tw: number }> = [];
  private time = 0;
  private width: number;
  private height: number;

  constructor(seed: string) {
    this.width = WORLD_CONFIG.worldWidth;
    this.height = WORLD_CONFIG.worldHeight;
    const rng = createRng(seed + '_bg');

    // 云
    const cloudCount = 9;
    for (let i = 0; i < cloudCount; i++) {
      this.clouds.push({
        x: rng.range(0, this.width),
        y: rng.range(40, this.height * 0.35),
        scale: rng.range(0.7, 1.6),
        speed: rng.range(-3, 3),
      });
    }

    // 远山
    this.mountainsFar = this.buildMountain(rng, 80, '#26354d', 12);
    this.mountainsNear = this.buildMountain(rng, 140, '#1d2a3e', 7);

    // 星星
    for (let i = 0; i < 60; i++) {
      this.starfield.push({
        x: rng.range(0, this.width),
        y: rng.range(0, this.height * 0.45),
        r: rng.range(0.4, 1.4),
        tw: rng.range(0, Math.PI * 2),
      });
    }
  }

  private buildMountain(rng: RNG, amp: number, color: string, segments: number): Mountain {
    const points: number[] = [];
    const baseY = this.height - 270;
    for (let i = 0; i <= segments; i++) {
      points.push(rng.range(-amp, 0));
    }
    return { points, baseY, color };
  }

  update(dt: number, windValue = 0): void {
    this.time += dt;
    for (const c of this.clouds) {
      // 风向由本回合物理风决定，云自身保留少量随机漂移，形成可见的
      // 同向速度差；windValue 与炮弹系统使用同一数值。
      c.x += (c.speed + windValue * 24) * dt;
      if (c.x < -200) c.x = this.width + 150;
      if (c.x > this.width + 200) c.x = -150;
    }
  }

  render(ctx: CanvasRenderingContext2D, reducedMotion: boolean): void {
    // 天空渐变
    const grad = ctx.createLinearGradient(0, 0, 0, this.height);
    grad.addColorStop(0, '#0c1a2b');
    grad.addColorStop(0.45, '#1a3a52');
    grad.addColorStop(0.75, '#2c5a72');
    grad.addColorStop(1, '#3e6f7c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    // 星
    for (const s of this.starfield) {
      const alpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.time * 1.5 + s.tw));
      ctx.fillStyle = `rgba(255,255,255,${alpha * (reducedMotion ? 0.5 : 1)})`;
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }

    // 月亮
    ctx.fillStyle = 'rgba(245, 240, 220, 0.85)';
    ctx.beginPath();
    ctx.arc(this.width * 0.78, 90, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.arc(this.width * 0.78 + 9, 86, 26, 0, Math.PI * 2);
    ctx.fill();

    // 远山
    this.renderMountain(ctx, this.mountainsFar);
    // 近山
    this.renderMountain(ctx, this.mountainsNear);

    // 云
    for (const c of this.clouds) {
      this.renderCloud(ctx, c);
    }
  }

  private renderMountain(ctx: CanvasRenderingContext2D, m: Mountain): void {
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.moveTo(0, this.height);
    const seg = m.points.length - 1;
    for (let i = 0; i <= seg; i++) {
      const x = (i / seg) * this.width;
      const y = m.baseY + m.points[i];
      if (i === 0) ctx.lineTo(x, y);
      else {
        const px = ((i - 0.5) / seg) * this.width;
        const py = m.baseY + (m.points[i - 1] + m.points[i]) / 2;
        ctx.quadraticCurveTo(px, py, x, y);
      }
    }
    ctx.lineTo(this.width, this.height);
    ctx.closePath();
    ctx.fill();
  }

  private renderCloud(ctx: CanvasRenderingContext2D, c: Cloud): void {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(c.scale, c.scale);
    ctx.fillStyle = 'rgba(220, 230, 240, 0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 36, 12, 0, 0, Math.PI * 2);
    ctx.ellipse(20, -6, 24, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(-20, -4, 22, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(36, 2, 18, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
