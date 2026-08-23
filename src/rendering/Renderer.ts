import type { CameraSystem } from '../systems/CameraSystem';
import type { TerrainSystem } from '../systems/TerrainSystem';
import type { ParticleSystem } from '../systems/ParticleSystem';
import type { TurnManager } from '../systems/TurnManager';
import type { ProjectileSystem } from '../systems/ProjectileSystem';
import type { Tank, Particle, TreasureChest, TreasureReward } from '../types';
import { BackgroundRenderer } from './BackgroundRenderer';
import { TerrainRenderer } from './TerrainRenderer';
import { TANK_CONFIG } from '../config/gameConfig';
import { angleToVector, degToRad } from '../utils/math';
import { COLORS, PLAYER_COLORS } from '../core/Constants';
import { weaponRegistry } from '../weapons/WeaponRegistry';

const TREASURE_REWARD_LABELS: Record<TreasureReward, { text: string; color: string }> = {
  double_damage: { text: 'DMG×2', color: '#ff647c' },
  wide_blast: { text: 'AOE+', color: '#4ddcff' },
  split_shot: { text: 'SPLIT', color: '#dc78ff' },
};

export class Renderer {
  background: BackgroundRenderer;
  terrainRenderer: TerrainRenderer;

  constructor(seed: string) {
    this.background = new BackgroundRenderer(seed);
    this.terrainRenderer = new TerrainRenderer();
  }

  setBackgroundSeed(seed: string): void {
    this.background = new BackgroundRenderer(seed);
  }

  renderScene(
    ctx: CanvasRenderingContext2D,
    camera: CameraSystem,
    terrain: TerrainSystem,
    particles: ParticleSystem,
    turn: TurnManager,
    projectiles: ProjectileSystem,
    tanks: Tank[],
    wind: { value: number; displayStrength: number },
    showTrajectory: boolean,
    reducedMotion: boolean,
    turnHint: { text: string; life: number } | null,
    alpha: number,
    dpr: number,
    aimPoint: { x: number; y: number } | null = null
  ): void {
    void alpha;
    // 背景需要不受相机缩放影响太多，仍画在世界坐标里
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 清屏
    ctx.fillStyle = '#0c1a2b';
    ctx.fillRect(0, 0, camera.viewportWidth, camera.viewportHeight);
    // 应用相机变换画背景
    camera.applyTransform(ctx, dpr);
    this.background.update(1 / 60, wind.value);
    this.background.render(ctx, reducedMotion);

    // 地形
    this.terrainRenderer.render(ctx, terrain, camera);

    const wormholes = projectiles.getWormholes();
    if (wormholes) this.renderWormholes(ctx, wormholes);

    // 坦克
    for (const tank of tanks) {
      this.renderTank(ctx, tank, turn);
    }

    if (aimPoint && turn.phase === 'PLAYER_CONTROL') {
      const activeTank = tanks[turn.currentPlayer];
      if (activeTank?.isAlive) this.renderAimGuide(ctx, activeTank, aimPoint);
    }

    // 预测轨迹
    if (showTrajectory && turn.phase === 'PLAYER_CONTROL') {
      const tank = tanks[turn.currentPlayer];
      if (tank && tank.isAlive) {
        this.renderTrajectory(ctx, tank, terrain, wind);
      }
    }

    // 炮弹
    const chest = projectiles.getChest();
    if (chest?.active) this.renderBuffPickup(ctx, chest);
    for (const p of projectiles.getProjectiles()) {
      this.renderProjectile(ctx, p);
    }

    // 粒子
    for (const p of particles.getParticles()) {
      this.renderParticle(ctx, p);
    }

    // 伤害数字
    for (const d of particles.getDamageNumbers()) {
      this.renderDamageNumber(ctx, d.x, d.y, d.value, d.life / d.maxLife);
    }

    ctx.restore();

    // 回合提示（屏幕坐标层）
    if (turnHint && turnHint.life > 0) {
      this.renderTurnHint(ctx, turnHint.text, turnHint.life, camera.viewportWidth, camera.viewportHeight);
    }
  }

  private renderAimGuide(
    ctx: CanvasRenderingContext2D,
    tank: Tank,
    aimPoint: { x: number; y: number }
  ): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.68)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 7]);
    ctx.beginPath();
    ctx.moveTo(tank.x, tank.y - TANK_CONFIG.bodyHeight);
    ctx.lineTo(aimPoint.x, aimPoint.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255, 209, 102, 0.85)';
    ctx.beginPath();
    ctx.arc(aimPoint.x, aimPoint.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private renderBuffPickup(
    ctx: CanvasRenderingContext2D,
    chest: TreasureChest
  ): void {
    const y = chest.y + Math.sin(chest.phase) * 8;
    const reward = chest.reward
      ? TREASURE_REWARD_LABELS[chest.reward]
      : { text: 'BUFF', color: '#8de8ff' };
    const pulse = 1 + Math.sin(chest.phase * 1.5) * 0.06;

    ctx.save();
    ctx.translate(chest.x, y);
    ctx.scale(pulse, pulse);

    // 低调的呼吸光晕与深色扁平化底盘。
    ctx.shadowColor = reward.color;
    ctx.shadowBlur = 9;
    ctx.fillStyle = 'rgba(7, 19, 40, 0.88)';
    ctx.beginPath();
    ctx.arc(0, 0, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(180, 225, 255, 0.24)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 16.5, 0, Math.PI * 2);
    ctx.stroke();

    // 两段旋转圆弧作为科幻 HUD 识别边框。
    ctx.save();
    ctx.rotate(chest.phase * 0.45);
    ctx.strokeStyle = reward.color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, 22.5, -0.15, 1.7);
    ctx.moveTo(-22.3, -3.2);
    ctx.arc(0, 0, 22.5, Math.PI - 0.15, Math.PI + 1.7);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = reward.color;
    ctx.font = `800 ${reward.text.length > 4 ? 9 : 10}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(reward.text, 0, 0.5);
    ctx.restore();
  }

  private renderWormholes(ctx: CanvasRenderingContext2D, pair: import('../types').WormholePair): void {
    for (const portal of [pair.blue, pair.red]) {
      ctx.save();
      ctx.translate(portal.x, portal.y);
      ctx.rotate(pair.phase * (portal.id === 'blue' ? 1 : -1));
      const glow = ctx.createRadialGradient(0, 0, 3, 0, 0, portal.radius * 1.8);
      glow.addColorStop(0, 'rgba(0,0,0,0.98)');
      glow.addColorStop(0.42, 'rgba(0,0,0,0.94)');
      glow.addColorStop(0.62, portal.color);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.shadowColor = portal.color;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(0, 0, portal.radius * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 8;
      ctx.strokeStyle = portal.color;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 2.2;
      for (let ring = 0; ring < 3; ring++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, portal.radius + ring * 5, portal.radius * (0.6 + ring * 0.12), ring * 0.7, 0.35, Math.PI * 1.75);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private renderTank(ctx: CanvasRenderingContext2D, tank: Tank, turn: TurnManager): void {
    if (!tank.isAlive) {
      // 残骸
      ctx.save();
      ctx.translate(tank.x, tank.y);
      ctx.fillStyle = 'rgba(80, 80, 80, 0.6)';
      ctx.fillRect(-18, -8, 36, 14);
      ctx.fillStyle = 'rgba(40, 40, 40, 0.7)';
      ctx.fillRect(-12, -4, 24, 6);
      ctx.restore();
      return;
    }
    const isActive = turn.currentPlayer === tank.playerIndex && turn.phase === 'PLAYER_CONTROL';
    const color = PLAYER_COLORS[tank.playerIndex];
    ctx.save();
    ctx.translate(tank.x, tank.y);
    ctx.rotate(tank.bodyAngle);
    // 紧贴履带的接触阴影；避免大块黑色椭圆看起来像地形空洞。
    ctx.fillStyle = 'rgba(0, 5, 10, 0.24)';
    ctx.beginPath();
    ctx.ellipse(0, 4, TANK_CONFIG.bodyWidth * 0.36, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // 履带舱：圆角外壳、轮毂与高光取代基础矩形。
    const halfW = TANK_CONFIG.bodyWidth / 2;
    ctx.fillStyle = '#07101a';
    ctx.strokeStyle = 'rgba(135, 208, 224, .45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-halfW - 1, -1, TANK_CONFIG.bodyWidth + 2, 9, 4);
    ctx.fill(); ctx.stroke();
    for (let i = -3; i <= 3; i++) {
      ctx.fillStyle = '#233746';
      ctx.beginPath(); ctx.arc(i * 5, 3.5, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#07101a';
      ctx.beginPath(); ctx.arc(i * 5, 3.5, 1, 0, Math.PI * 2); ctx.fill();
    }

    // 车身
    const hitFlash = tank.hitFlash > 0;
    const armor = ctx.createLinearGradient(0, -TANK_CONFIG.bodyHeight, 0, 0);
    armor.addColorStop(0, hitFlash ? '#fff' : color);
    armor.addColorStop(.34, hitFlash ? '#fff' : color);
    armor.addColorStop(1, '#0c1a24');
    ctx.fillStyle = armor;
    ctx.strokeStyle = hitFlash ? '#fff' : color;
    ctx.shadowColor = color;
    ctx.shadowBlur = isActive ? 8 : 3;
    ctx.beginPath();
    ctx.moveTo(-halfW + 3, -TANK_CONFIG.bodyHeight);
    ctx.lineTo(halfW - 5, -TANK_CONFIG.bodyHeight);
    ctx.lineTo(halfW, -4);
    ctx.lineTo(halfW - 3, 0);
    ctx.lineTo(-halfW + 2, 0);
    ctx.lineTo(-halfW, -5);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    // 车身侧标
    ctx.fillStyle = hitFlash ? '#222' : '#0b1622';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`P${tank.playerIndex + 1}`, 0, -TANK_CONFIG.bodyHeight / 2 - 1);

    ctx.restore();

    // 炮塔（独立炮塔角度叠加车身角度）
    ctx.save();
    ctx.translate(tank.x, tank.y - TANK_CONFIG.bodyHeight);
    const combined = tank.bodyAngle - degToRad(tank.turretAngle);
    ctx.rotate(combined);
    // 炮管
    const barrel = ctx.createLinearGradient(0, -3, 0, 3);
    barrel.addColorStop(0, '#8fa8b5'); barrel.addColorStop(.5, '#263b48'); barrel.addColorStop(1, '#08121a');
    ctx.fillStyle = barrel;
    ctx.fillRect(0, -TANK_CONFIG.barrelWidth / 2, TANK_CONFIG.barrelLength, TANK_CONFIG.barrelWidth);
    ctx.shadowColor = color; ctx.shadowBlur = 7;
    ctx.fillStyle = color;
    ctx.fillRect(TANK_CONFIG.barrelLength - 3, -TANK_CONFIG.barrelWidth / 2 - 1, 3, TANK_CONFIG.barrelWidth + 2);
    ctx.shadowBlur = 0;
    // 炮塔本体
    ctx.fillStyle = hitFlash ? '#ffffff' : '#142b39';
    ctx.strokeStyle = hitFlash ? '#ffffff' : color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, TANK_CONFIG.turretRadius, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = hitFlash ? '#fff' : color;
    ctx.beginPath();
    ctx.arc(-2, -2, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 当前玩家指示
    if (isActive) {
      ctx.save();
      ctx.translate(tank.x, tank.y - 38);
      const bob = Math.sin(performance.now() / 200) * 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, 8 + bob);
      ctx.lineTo(-6, 0 + bob);
      ctx.lineTo(6, 0 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 血条
    this.renderHealthBar(ctx, tank.x, tank.y - 30, tank.health / tank.maxHealth, color);

    // 减少闪烁计时
    if (tank.hitFlash > 0) tank.hitFlash -= 0.016;
  }

  private renderHealthBar(ctx: CanvasRenderingContext2D, x: number, y: number, ratio: number, color: string): void {
    const w = 36;
    const h = 5;
    ctx.save();
    ctx.fillStyle = 'rgba(2,9,16,0.85)';
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#0b1b2a';
    ctx.fillRect(x - w / 2, y, w, h);
    const r = Math.max(0, Math.min(1, ratio));
    ctx.shadowColor = color;
    ctx.shadowBlur = 5;
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y, w * r, h);
    ctx.restore();
  }

  private renderProjectile(ctx: CanvasRenderingContext2D, p: import('../types').Projectile): void {
    const w = weaponRegistry.get(p.weaponId);
    const trailColor = w.trailColor ?? w.color;
    const trailWidth = w.trailWidth ?? 2;
    const trailGlow = w.trailGlow ?? 6;
    // 每段分别按自身剩余寿命绘制，形成连续且逐渐消散的发光曳光线。
    if (p.trail.length > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = trailColor;
      ctx.shadowColor = trailColor;
      for (let i = 1; i < p.trail.length; i++) {
        const previous = p.trail[i - 1];
        const current = p.trail[i];
        const lifeRatio = Math.max(0, Math.min(1, current.life / current.maxLife));
        ctx.globalAlpha = lifeRatio * 0.32;
        ctx.shadowBlur = trailGlow;
        ctx.lineWidth = trailWidth * (2.2 + lifeRatio);
        ctx.beginPath();
        ctx.moveTo(previous.x, previous.y);
        ctx.lineTo(current.x, current.y);
        ctx.stroke();
        ctx.globalAlpha = lifeRatio * 0.88;
        ctx.shadowBlur = trailGlow * 0.45;
        ctx.lineWidth = Math.max(0.7, trailWidth * lifeRatio);
        ctx.beginPath();
        ctx.moveTo(previous.x, previous.y);
        ctx.lineTo(current.x, current.y);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.save();
    ctx.shadowColor = trailColor;
    ctx.shadowBlur = trailGlow;
    ctx.fillStyle = w.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(p.x - p.radius * 0.3, p.y - p.radius * 0.3, p.radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
    if (p.state === 'rolling') {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 3, 0, Math.PI * 1.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
    const lifeRatio = Math.max(0, p.life / p.maxLife);
    if (p.kind === 'ring') {
      const r = p.size * (1 - lifeRatio) * 1.6;
      ctx.strokeStyle = `${p.color}`;
      ctx.globalAlpha = lifeRatio;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (p.kind === 'flash') {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = lifeRatio * 0.8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - lifeRatio * 0.3), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (p.kind === 'smoke') {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = lifeRatio * 0.7;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 + (1 - lifeRatio) * 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (p.kind === 'debris') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = lifeRatio;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.globalAlpha = 1;
      ctx.restore();
    } else {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = lifeRatio;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private renderDamageNumber(ctx: CanvasRenderingContext2D, x: number, y: number, value: number, ratio: number): void {
    ctx.save();
    ctx.globalAlpha = ratio;
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(`-${value}`, x + 1, y + 1);
    ctx.fillStyle = COLORS.Warning;
    ctx.fillText(`-${value}`, x, y);
    ctx.restore();
  }

  private renderTrajectory(
    ctx: CanvasRenderingContext2D,
    tank: Tank,
    terrain: TerrainSystem,
    wind: { value: number; displayStrength: number }
  ): void {
    const weapon = weaponRegistry.get(tank.selectedWeaponId);
    const dir = angleToVector(tank.turretAngle);
    const speed = tank.power * weapon.projectileSpeedMultiplier;
    let x = tank.x + dir.x * 30;
    let y = tank.y - 6 + dir.y * 30;
    let vx = dir.x * speed;
    let vy = dir.y * speed;
    const g = 520 * weapon.gravityMultiplier;
    const w = wind.value * 55 * weapon.windMultiplier;
    const dt = 0.03;
    ctx.fillStyle = 'rgba(255, 220, 120, 0.5)';
    for (let i = 0; i < 28; i++) {
      vx += w * dt;
      vy += g * dt;
      x += vx * dt;
      y += vy * dt;
      if (terrain.isSolid(x, y)) break;
      if (x < 0 || x > terrain.worldWidth || y > terrain.worldHeight) break;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderTurnHint(ctx: CanvasRenderingContext2D, text: string, life: number, vw: number, vh: number): void {
    ctx.save();
    const alpha = Math.min(1, life);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, vh / 2 - 50, vw, 100);
    ctx.fillStyle = COLORS.Accent;
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, vw / 2, vh / 2);
    ctx.restore();
  }
}
