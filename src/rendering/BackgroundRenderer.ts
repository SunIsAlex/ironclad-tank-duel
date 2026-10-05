// 程序化背景：天空渐变 + 天体 + 远山 + 云 + 主题环境粒子
import { WORLD_CONFIG } from '../config/gameConfig';
import { BATTLE_THEMES, type BattleTheme } from '../config/battleThemes';
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

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
}

export class BackgroundRenderer {
  private clouds: Cloud[] = [];
  private mountainsFar: Mountain;
  private mountainsNear: Mountain;
  private starfield: Array<{ x: number; y: number; r: number; tw: number }> = [];
  private motes: Mote[] = [];
  private time = 0;
  private width: number;
  private height: number;
  private theme: BattleTheme;
  private skyGradient: CanvasGradient | null = null;

  constructor(seed: string, theme: BattleTheme = BATTLE_THEMES.nebula) {
    this.width = WORLD_CONFIG.worldWidth;
    this.height = WORLD_CONFIG.worldHeight;
    this.theme = theme;
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
    this.mountainsFar = this.buildMountain(rng, 80, theme.mountains[0], 12);
    this.mountainsNear = this.buildMountain(rng, 140, theme.mountains[1], 7);

    // 星星
    for (let i = 0; i < theme.starCount; i++) {
      this.starfield.push({
        x: rng.range(0, this.width),
        y: rng.range(0, this.height * 0.5),
        r: rng.range(0.4, 1.6),
        tw: rng.range(0, Math.PI * 2),
      });
    }

    // 环境粒子：余烬上升、尘埃漂浮、电火花闪烁。
    if (theme.ambient !== 'none') {
      for (let i = 0; i < 70; i++) {
        this.motes.push(this.createMote(rng.next(), rng.next(), rng.next()));
      }
    }
  }

  private createMote(a: number, b: number, c: number): Mote {
    const rising = this.theme.ambient === 'embers';
    return {
      x: a * this.width,
      y: b * this.height,
      vx: (c - 0.5) * 14,
      vy: rising ? -18 - c * 30 : (c - 0.5) * 6,
      size: 0.8 + c * 1.8,
      phase: a * Math.PI * 2,
    };
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
    for (const m of this.motes) {
      m.x += (m.vx + windValue * 18) * dt;
      m.y += m.vy * dt;
      if (m.x < -10) m.x += this.width + 20;
      if (m.x > this.width + 10) m.x -= this.width + 20;
      if (m.y < -10) m.y = this.height + 5;
      if (m.y > this.height + 10) m.y = -5;
    }
  }

  render(ctx: CanvasRenderingContext2D, reducedMotion: boolean): void {
    const theme = this.theme;
    // 天空渐变（同一 context 复用，避免每帧重建）
    if (!this.skyGradient) {
      const grad = ctx.createLinearGradient(0, 0, 0, this.height);
      grad.addColorStop(0, theme.sky[0]);
      grad.addColorStop(0.45, theme.sky[1]);
      grad.addColorStop(0.76, theme.sky[2]);
      grad.addColorStop(1, theme.sky[3]);
      this.skyGradient = grad;
    }
    ctx.fillStyle = this.skyGradient;
    ctx.fillRect(0, 0, this.width, this.height);

    // 星
    for (const s of this.starfield) {
      const alpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.time * 1.5 + s.tw));
      ctx.fillStyle = `rgba(${theme.starColor},${alpha * (reducedMotion ? 0.5 : 1)})`;
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }

    if (theme.planet) this.renderPlanet(ctx, theme.planet);

    // 极淡的全息网格让空旷区域保持层次，但不干扰弹道读取。
    ctx.save();
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= this.width; x += 80) {
      ctx.moveTo(x, 0); ctx.lineTo(x, this.height);
    }
    for (let y = 40; y < this.height; y += 64) {
      ctx.moveTo(0, y); ctx.lineTo(this.width, y);
    }
    ctx.stroke();
    ctx.restore();

    // 天际线光晕。
    const horizon = ctx.createLinearGradient(0, this.height - 340, 0, this.height - 180);
    horizon.addColorStop(0, `rgba(${theme.horizon}, 0)`);
    horizon.addColorStop(.65, `rgba(${theme.horizon}, .12)`);
    horizon.addColorStop(1, `rgba(${theme.horizon}, 0)`);
    ctx.fillStyle = horizon;
    ctx.fillRect(0, this.height - 340, this.width, 160);

    // 远山
    this.renderMountain(ctx, this.mountainsFar);
    // 近山
    this.renderMountain(ctx, this.mountainsNear);

    // 云
    for (const c of this.clouds) {
      this.renderCloud(ctx, c);
    }

    if (!reducedMotion) this.renderMotes(ctx);
  }

  private renderPlanet(ctx: CanvasRenderingContext2D, planet: NonNullable<BattleTheme['planet']>): void {
    const px = this.width * planet.x;
    const py = planet.y;
    const r = planet.r;
    const glow = ctx.createRadialGradient(px, py, r * 0.2, px, py, r);
    glow.addColorStop(0, planet.core);
    glow.addColorStop(.78, planet.core);
    glow.addColorStop(.9, `rgba(${planet.rim}, .55)`);
    glow.addColorStop(1, `rgba(${planet.rim}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    // 晨昏线阴影
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.beginPath();
    ctx.arc(px + r * 0.2, py - r * 0.1, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
    if (planet.ring) {
      ctx.save();
      ctx.strokeStyle = planet.ring;
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.globalAlpha = 0.7 - i * 0.15;
        ctx.beginPath();
        ctx.moveTo(px - r * 1.6, py + 10 + i * 14);
        ctx.lineTo(px + r * 1.6, py + 10 + i * 14);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private renderMotes(ctx: CanvasRenderingContext2D): void {
    const theme = this.theme;
    ctx.save();
    for (const m of this.motes) {
      let alpha: number;
      if (theme.ambient === 'sparks') {
        // 电火花：短促随机闪烁
        const flicker = Math.sin(this.time * 7 + m.phase * 13);
        alpha = flicker > 0.86 ? 0.95 : 0.08;
      } else {
        alpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(this.time * 1.8 + m.phase));
      }
      ctx.fillStyle = `rgba(${theme.ambientColor}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
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
    ctx.fillStyle = this.theme.cloud;
    ctx.beginPath();
    ctx.ellipse(0, 0, 36, 12, 0, 0, Math.PI * 2);
    ctx.ellipse(20, -6, 24, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(-20, -4, 22, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(36, 2, 18, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
