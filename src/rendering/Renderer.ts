import type { CameraSystem } from '../systems/CameraSystem';
import type { TerrainSystem } from '../systems/TerrainSystem';
import type { ParticleSystem } from '../systems/ParticleSystem';
import type { TurnManager } from '../systems/TurnManager';
import type { ProjectileSystem } from '../systems/ProjectileSystem';
import type { Tank, Particle, TreasureChest, TreasureReward } from '../types';
import { BackgroundRenderer } from './BackgroundRenderer';
import { TerrainRenderer } from './TerrainRenderer';
import { POWER_RANGE, TANK_CONFIG, WORLD_CONFIG } from '../config/gameConfig';
import type { ShotRecord } from '../systems/ShotHistory';
import { BATTLE_THEMES, type BattleTheme } from '../config/battleThemes';
import { angleToVector, degToRad } from '../utils/math';
import { COLORS, PLAYER_COLORS } from '../core/Constants';
import { weaponRegistry } from '../weapons/WeaponRegistry';

const TREASURE_REWARD_LABELS: Record<TreasureReward, { text: string; color: string }> = {
  double_damage: { text: 'DMG×2', color: '#ff647c' },
  wide_blast: { text: 'AOE+', color: '#4ddcff' },
  split_shot: { text: 'SPLIT', color: '#dc78ff' },
};

export interface SceneOverlay {
  /** 当前熔岩面（世界 Y），null 表示本模式没有熔岩 */
  lavaLevel?: number | null;
  /** 下一回合熔岩面预告 */
  nextLavaLevel?: number | null;
  /** 回合提示横幅的强调色 */
  hintAccent?: string;
  /** 当前操作方最近几发的实际弹道（新到旧） */
  shotHistory?: readonly ShotRecord[];
}

export class Renderer {
  background: BackgroundRenderer;
  terrainRenderer: TerrainRenderer;
  private theme: BattleTheme;
  private vignette: { w: number; h: number; gradient: CanvasGradient } | null = null;
  private hintText = '';
  private hintStart = 0;

  constructor(seed: string, theme: BattleTheme = BATTLE_THEMES.nebula) {
    this.theme = theme;
    this.background = new BackgroundRenderer(seed, theme);
    this.terrainRenderer = new TerrainRenderer();
  }

  setBackgroundSeed(seed: string): void {
    this.background = new BackgroundRenderer(seed, this.theme);
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
    aimPoint: { x: number; y: number } | null = null,
    overlay: SceneOverlay = {}
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

    // 熔岩画在坦克之下，浸没的坦克仍清晰可见
    if (overlay.lavaLevel !== null && overlay.lavaLevel !== undefined) {
      this.renderLava(ctx, overlay.lavaLevel, overlay.nextLavaLevel ?? null, terrain.worldWidth, terrain.worldHeight, reducedMotion);
    }

    // 坦克
    for (const tank of tanks) {
      this.renderTank(ctx, tank, turn);
    }

    if (aimPoint && turn.phase === 'PLAYER_CONTROL') {
      const activeTank = tanks[turn.currentPlayer];
      if (activeTank?.isAlive) this.renderAimGuide(ctx, activeTank, aimPoint);
    }

    // 历史弹道：画在预测轨迹之下，便于对照修正
    if (overlay.shotHistory?.length && turn.phase === 'PLAYER_CONTROL') {
      this.renderShotHistory(ctx, overlay.shotHistory, camera.zoom);
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

    this.renderVignette(ctx, camera.viewportWidth, camera.viewportHeight, dpr);

    // 回合提示（屏幕坐标层）
    if (turnHint && turnHint.life > 0) {
      if (turnHint.text !== this.hintText) {
        this.hintText = turnHint.text;
        this.hintStart = performance.now();
      }
      this.renderTurnHint(
        ctx, turnHint.text, turnHint.life, camera.viewportWidth, camera.viewportHeight,
        overlay.hintAccent ?? COLORS.Accent, reducedMotion
      );
    } else {
      this.hintText = '';
    }
  }

  private renderShotHistory(ctx: CanvasRenderingContext2D, shots: readonly ShotRecord[], zoom: number): void {
    // 线宽与字号按镜头缩放换算，保证屏幕上的大小恒定
    const px = 1 / Math.max(0.1, zoom);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 先画旧的，最新一发压在最上层
    for (let i = shots.length - 1; i >= 0; i--) {
      const shot = shots[i];
      const latest = i === 0;
      const weapon = weaponRegistry.get(shot.weaponId);
      const color = weapon.trailColor ?? weapon.color;
      ctx.globalAlpha = latest ? 0.9 : i === 1 ? 0.5 : 0.3;
      ctx.strokeStyle = color;
      ctx.lineWidth = (latest ? 2.6 : 2) * px;
      // 长度近似 0 的虚线段配合圆端点即成为圆点
      ctx.setLineDash([0.01, 7 * px]);
      for (const path of shot.paths) {
        ctx.beginPath();
        for (let j = 0; j < path.length; j++) {
          const point = path[j];
          const prev = path[j - 1];
          // 穿越黑洞时坐标跳变，断开折线避免画出穿屏连线
          if (!prev || Math.hypot(point.x - prev.x, point.y - prev.y) > 90) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // 落点标记与参数标签（取第一条弹体轨迹的终点）
      const main = shot.paths[0];
      const end = main[main.length - 1];
      const size = 5 * px;
      ctx.lineWidth = 1.6 * px;
      ctx.beginPath();
      ctx.moveTo(end.x - size, end.y - size);
      ctx.lineTo(end.x + size, end.y + size);
      ctx.moveTo(end.x + size, end.y - size);
      ctx.lineTo(end.x - size, end.y + size);
      ctx.stroke();
      const powerPct = Math.round(((shot.power - POWER_RANGE.min) / (POWER_RANGE.max - POWER_RANGE.min)) * 100);
      const label = `${latest ? '上一发 ' : ''}${Math.round(shot.angle)}° · ${powerPct}%`;
      ctx.font = `700 ${11 * px}px system-ui, sans-serif`;
      const w = ctx.measureText(label).width + 10 * px;
      const h = 16 * px;
      const lx = end.x - w / 2;
      const ly = end.y - size - 6 * px - h;
      ctx.fillStyle = 'rgba(4, 12, 24, 0.82)';
      ctx.beginPath();
      ctx.roundRect(lx, ly, w, h, h / 2);
      ctx.fill();
      ctx.lineWidth = 1 * px;
      ctx.stroke();
      ctx.fillStyle = latest ? '#ffffff' : 'rgba(230, 240, 255, 0.85)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, end.x, ly + h / 2 + 0.5 * px);
    }
    ctx.restore();
  }

  private renderVignette(ctx: CanvasRenderingContext2D, vw: number, vh: number, dpr: number): void {
    if (!this.vignette || this.vignette.w !== vw || this.vignette.h !== vh) {
      const radius = Math.hypot(vw, vh) / 2;
      const gradient = ctx.createRadialGradient(vw / 2, vh / 2, radius * 0.45, vw / 2, vh / 2, radius);
      gradient.addColorStop(0, `rgba(${this.theme.vignette}, 0)`);
      gradient.addColorStop(1, `rgba(${this.theme.vignette}, 0.55)`);
      this.vignette = { w: vw, h: vh, gradient };
    }
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = this.vignette.gradient;
    ctx.fillRect(0, 0, vw, vh);
    ctx.restore();
  }

  private renderLava(
    ctx: CanvasRenderingContext2D,
    level: number,
    nextLevel: number | null,
    worldWidth: number,
    worldHeight: number,
    reducedMotion: boolean
  ): void {
    const t = reducedMotion ? 0 : performance.now() / 1000;
    const surface = (x: number): number =>
      level + Math.sin(x * 0.018 + t * 1.6) * 3.2 + Math.sin(x * 0.051 - t * 2.4) * 1.6;
    ctx.save();
    // 下一回合预告线
    if (nextLevel !== null && nextLevel < level - 1) {
      ctx.strokeStyle = 'rgba(255, 140, 60, 0.45)';
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, nextLevel);
      ctx.lineTo(worldWidth, nextLevel);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255, 170, 90, 0.8)';
      ctx.font = '700 20px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      for (let x = 60; x < worldWidth; x += 600) ctx.fillText('▲ 下回合熔岩线', x, nextLevel - 4);
    }
    // 熔岩上方热浪光
    const heat = ctx.createLinearGradient(0, level - 90, 0, level);
    heat.addColorStop(0, 'rgba(255, 90, 20, 0)');
    heat.addColorStop(1, 'rgba(255, 110, 30, 0.28)');
    ctx.fillStyle = heat;
    ctx.fillRect(0, level - 90, worldWidth, 90);
    // 熔岩本体
    const body = ctx.createLinearGradient(0, level - 4, 0, Math.min(worldHeight, level + 220));
    body.addColorStop(0, 'rgba(255, 214, 92, 0.96)');
    body.addColorStop(0.08, 'rgba(255, 120, 30, 0.94)');
    body.addColorStop(0.4, 'rgba(196, 40, 12, 0.93)');
    body.addColorStop(1, 'rgba(70, 8, 4, 0.96)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, worldHeight);
    for (let x = 0; x <= worldWidth; x += 12) ctx.lineTo(x, surface(x));
    ctx.lineTo(worldWidth, worldHeight);
    ctx.closePath();
    ctx.fill();
    // 发光表层
    ctx.shadowColor = '#ff8a1f';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = 'rgba(255, 236, 160, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= worldWidth; x += 12) {
      if (x === 0) ctx.moveTo(x, surface(x));
      else ctx.lineTo(x, surface(x));
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 冒泡：基于时间的伪随机气泡，无需粒子对象
    if (!reducedMotion) {
      for (let i = 0; i < 26; i++) {
        const cycle = (t * 0.6 + i * 0.37) % 1;
        const bx = ((i * 977) % worldWidth) + Math.sin(i * 3.1 + t) * 10;
        const by = surface(bx) + 6 - cycle * 4;
        ctx.globalAlpha = (1 - cycle) * 0.8;
        ctx.fillStyle = '#ffe28a';
        ctx.beginPath();
        ctx.arc(bx, by, 1.5 + cycle * 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
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
      this.renderWreck(ctx, tank);
      return;
    }
    const isActive = turn.currentPlayer === tank.playerIndex && turn.phase === 'PLAYER_CONTROL';
    const color = PLAYER_COLORS[tank.playerIndex];
    if (isActive) {
      // 当前操作坦克脚下的脉冲光环
      const pulse = (performance.now() / 900) % 1;
      ctx.save();
      ctx.translate(tank.x, tank.y + 3);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      for (const phase of [pulse, (pulse + 0.5) % 1]) {
        ctx.globalAlpha = (1 - phase) * 0.55;
        ctx.beginPath();
        ctx.ellipse(0, 0, 18 + phase * 22, 4 + phase * 5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
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

  private renderWreck(ctx: CanvasRenderingContext2D, tank: Tank): void {
    ctx.save();
    ctx.translate(tank.x, tank.y);
    ctx.rotate(tank.bodyAngle + 0.08);
    ctx.fillStyle = '#1a1d20';
    ctx.strokeStyle = 'rgba(255, 120, 60, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(-16, -9);
    ctx.lineTo(-4, -12);
    ctx.lineTo(4, -8);
    ctx.lineTo(14, -10);
    ctx.lineTo(18, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 折断的炮管
    ctx.fillStyle = '#2a2f33';
    ctx.save();
    ctx.translate(2, -11);
    ctx.rotate(tank.playerIndex === 0 ? 0.5 : Math.PI - 0.5);
    ctx.fillRect(0, -2, 13, 4);
    ctx.restore();
    // 余烬
    const t = performance.now() / 1000;
    ctx.fillStyle = `rgba(255, 120, 40, ${0.45 + Math.sin(t * 5) * 0.25})`;
    ctx.beginPath();
    ctx.arc(-3, -7, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 袅袅黑烟
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const cycle = (t * 0.35 + i / 5) % 1;
      ctx.globalAlpha = (1 - cycle) * 0.35;
      ctx.fillStyle = '#2b2b2e';
      ctx.beginPath();
      ctx.arc(tank.x - 2 + Math.sin(t + i) * 6 + cycle * 10, tank.y - 12 - cycle * 60, 4 + cycle * 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private renderHealthBar(ctx: CanvasRenderingContext2D, x: number, y: number, ratio: number, color: string): void {
    const w = 40;
    const h = 5;
    ctx.save();
    ctx.fillStyle = 'rgba(2,9,16,0.85)';
    ctx.beginPath();
    ctx.roundRect(x - w / 2 - 1.5, y - 1.5, w + 3, h + 3, 3);
    ctx.fill();
    const r = Math.max(0, Math.min(1, ratio));
    const fill = r > 0.5 ? color : r > 0.25 ? '#ffd166' : COLORS.Warning;
    ctx.shadowColor = fill;
    ctx.shadowBlur = 5;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y, Math.max(0.01, w * r), h, 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // 分段刻度
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    for (let i = 1; i < 4; i++) ctx.fillRect(x - w / 2 + (w * i) / 4, y, 1, h);
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
    // 出现瞬间放大回弹；高伤害使用更大字号与炽热配色。
    const age = 1 - ratio;
    const pop = 1 + 0.7 * Math.max(0, 1 - age / 0.16);
    const big = value >= 30;
    const size = (big ? 22 : 16) * pop;
    ctx.save();
    ctx.globalAlpha = Math.min(1, ratio * 1.6);
    ctx.font = `900 ${size.toFixed(1)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(10, 4, 8, 0.85)';
    ctx.strokeText(`-${value}`, x, y);
    ctx.fillStyle = big ? '#ffd166' : '#ff6b8a';
    ctx.shadowColor = big ? '#ff8a1f' : COLORS.Warning;
    ctx.shadowBlur = big ? 12 : 6;
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
    const g = WORLD_CONFIG.gravity * weapon.gravityMultiplier;
    const w = wind.value * WORLD_CONFIG.windScale * weapon.windMultiplier;
    const dt = 0.03;
    const steps = 28;
    ctx.save();
    ctx.fillStyle = weapon.color;
    ctx.shadowColor = weapon.color;
    ctx.shadowBlur = 6;
    for (let i = 0; i < steps; i++) {
      vx += w * dt;
      vy += g * dt;
      x += vx * dt;
      y += vy * dt;
      if (terrain.isSolid(x, y)) break;
      if (x < 0 || x > terrain.worldWidth || y > terrain.worldHeight) break;
      // 越远越淡越小，强调近端弹道方向
      const fade = 1 - i / steps;
      ctx.globalAlpha = 0.2 + fade * 0.6;
      ctx.beginPath();
      ctx.arc(x, y, 1.2 + fade * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private renderTurnHint(
    ctx: CanvasRenderingContext2D,
    text: string,
    life: number,
    vw: number,
    vh: number,
    accent: string,
    reducedMotion: boolean
  ): void {
    const elapsed = (performance.now() - this.hintStart) / 1000;
    const enter = reducedMotion ? 1 : Math.min(1, elapsed / 0.22);
    const ease = 1 - Math.pow(1 - enter, 3);
    const alpha = Math.min(1, life * 2.5) * ease;
    const fontSize = Math.max(16, Math.min(30, vw / 28));
    ctx.save();
    ctx.font = `800 ${fontSize}px system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif`;
    const textW = Math.min(vw - 40, ctx.measureText(text).width + 90);
    const bandH = fontSize + 30;
    const cx = vw / 2 + (1 - ease) * -60;
    const cy = vh * 0.36;
    const skew = 14;
    ctx.globalAlpha = alpha;
    // 斜切横幅底板
    const bg = ctx.createLinearGradient(cx - textW / 2, 0, cx + textW / 2, 0);
    bg.addColorStop(0, 'rgba(4, 10, 20, 0)');
    bg.addColorStop(0.12, 'rgba(4, 10, 20, 0.86)');
    bg.addColorStop(0.88, 'rgba(4, 10, 20, 0.86)');
    bg.addColorStop(1, 'rgba(4, 10, 20, 0)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(cx - textW / 2 + skew, cy - bandH / 2);
    ctx.lineTo(cx + textW / 2 + skew, cy - bandH / 2);
    ctx.lineTo(cx + textW / 2 - skew, cy + bandH / 2);
    ctx.lineTo(cx - textW / 2 - skew, cy + bandH / 2);
    ctx.closePath();
    ctx.fill();
    // 上下强调线
    const line = ctx.createLinearGradient(cx - textW / 2, 0, cx + textW / 2, 0);
    line.addColorStop(0, 'rgba(255,255,255,0)');
    line.addColorStop(0.5, accent);
    line.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = line;
    ctx.fillRect(cx - textW / 2 + skew, cy - bandH / 2, textW, 2);
    ctx.fillRect(cx - textW / 2 - skew, cy + bandH / 2 - 2, textW, 2);
    // 文本
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = accent;
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, cx, cy + 1, vw - 60);
    ctx.restore();
  }
}
