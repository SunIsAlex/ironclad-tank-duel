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
    this.mountainsFar = this.buildMountain(rng, 80, '#142a3d', 12);
    this.mountainsNear = this.buildMountain(rng, 140, '#0b1927', 7);

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
    grad.addColorStop(0, '#020812');
    grad.addColorStop(0.45, '#071a2d');
    grad.addColorStop(0.76, '#10334a');
    grad.addColorStop(1, '#172b38');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    // 星
    for (const s of this.starfield) {
      const alpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.time * 1.5 + s.tw));
      ctx.fillStyle = `rgba(255,255,255,${alpha * (reducedMotion ? 0.5 : 1)})`;
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }

    // 具有冷色边缘光的行星，建立战术科幻场景的视觉锚点。
    const planetX = this.width * 0.78;
    const planetY = 108;
    const planetGlow = ctx.createRadialGradient(planetX, planetY, 12, planetX, planetY, 64);
    planetGlow.addColorStop(0, 'rgba(3, 10, 20, .96)');
    planetGlow.addColorStop(.78, 'rgba(3, 10, 20, .96)');
    planetGlow.addColorStop(.9, 'rgba(57, 220, 255, .55)');
    planetGlow.addColorStop(1, 'rgba(57, 220, 255, 0)');
    ctx.fillStyle = planetGlow;
    ctx.beginPath();
    ctx.arc(planetX, planetY, 64, 0, Math.PI * 2);
    ctx.fill();

    // 极淡的全息网格让空旷区域保持层次，但不干扰弹道读取。
    ctx.save();
    ctx.strokeStyle = 'rgba(74, 213, 255, .045)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= this.width; x += 80) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.height); ctx.stroke();
    }
    for (let y = 40; y < this.height; y += 64) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.width, y); ctx.stroke();
    }
    ctx.restore();

    // 天际线冷光。
    const horizon = ctx.createLinearGradient(0, this.height - 340, 0, this.height - 180);
    horizon.addColorStop(0, 'rgba(20, 174, 214, 0)');
    horizon.addColorStop(.65, 'rgba(20, 174, 214, .1)');
    horizon.addColorStop(1, 'rgba(20, 174, 214, 0)');
    ctx.fillStyle = horizon;
    ctx.fillRect(0, this.height - 340, this.width, 160);

    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.arc(planetX + 13, planetY - 6, 52, 0, Math.PI * 2);
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
    ctx.fillStyle = 'rgba(91, 171, 203, 0.10)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 36, 12, 0, 0, Math.PI * 2);
    ctx.ellipse(20, -6, 24, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(-20, -4, 22, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(36, 2, 18, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
