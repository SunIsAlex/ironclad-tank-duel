import type { GamePhase, Tank, WindState } from '../types';
import type { GameVariant } from '../config/gameVariants';
import { COLORS, PLAYER_COLORS } from '../core/Constants';
import { weaponRegistry } from '../weapons/WeaponRegistry';
import { POWER_RANGE } from '../config/gameConfig';

// 战斗 HUD（屏幕坐标系）：顶部双方铭牌 + 中央赛况/风向，底部武器坞。

const FONT = `system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif`;
const PANEL = 'rgba(4, 12, 24, 0.78)';
const PANEL_EDGE = 'rgba(140, 220, 255, 0.16)';
const MUTED = 'rgba(200, 225, 240, 0.62)';

export interface HudState {
  tanks: Tank[];
  currentPlayer: number;
  phase: GamePhase;
  roles: string[];
  credits: Array<number | null>;
  /** 训练靶机等无限耐久对象 */
  invulnerable: boolean[];
  matchWins: [number, number];
  winsRequired: number;
  title: string;
  roundLabel: string;
  variant: GameVariant;
  wind: WindState;
  timer: number | null;
  hint: string;
  /** 触控面板可见时把武器信息压缩到顶部 */
  compact: boolean;
}

export class HudRenderer {
  /** 血条延迟尾迹，突出刚受到的伤害 */
  private ghost: number[] = [];
  private lastTime = performance.now();

  render(ctx: CanvasRenderingContext2D, vw: number, vh: number, state: HudState): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    state.tanks.forEach((tank, i) => {
      const ratio = state.invulnerable[i] ? 1 : Math.max(0, tank.health / tank.maxHealth);
      const ghost = this.ghost[i];
      if (ghost === undefined || ghost < ratio) this.ghost[i] = ratio;
      else this.ghost[i] = Math.max(ratio, ghost - dt * 0.35);
    });

    const tank = state.tanks[state.currentPlayer];
    const plateW = Math.max(150, Math.min(270, vw * 0.27));
    this.renderPlate(ctx, state, 0, 10, 8, plateW, false);
    // 右侧预留 DOM 暂停按钮的位置
    this.renderPlate(ctx, state, 1, vw - plateW - 62, 8, plateW, true);
    this.renderCenter(ctx, vw, state, plateW);
    if (!tank) return;
    if (state.compact) this.renderCompactWeapon(ctx, vw, tank, state);
    else this.renderDock(ctx, vw, vh, tank, state);
  }

  private renderPlate(
    ctx: CanvasRenderingContext2D,
    state: HudState,
    index: number,
    x: number,
    y: number,
    w: number,
    mirrored: boolean
  ): void {
    const tank = state.tanks[index];
    if (!tank) return;
    const color = PLAYER_COLORS[index];
    const active = state.currentPlayer === index;
    const h = 58;
    ctx.save();
    // 斜角玻璃底板
    const cut = 12;
    ctx.beginPath();
    if (!mirrored) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w - cut, y + h);
      ctx.lineTo(x, y + h);
    } else {
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + cut, y + h);
    }
    ctx.closePath();
    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, 'rgba(8, 20, 36, 0.86)');
    bg.addColorStop(1, 'rgba(3, 9, 18, 0.78)');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = active ? color : PANEL_EDGE;
    if (active) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 阵营色条
    ctx.fillStyle = color;
    ctx.fillRect(mirrored ? x + w - 4 : x, y, 4, h);

    const pad = 14;
    const left = mirrored ? x + cut + 6 : x + pad;
    const right = mirrored ? x + w - pad : x + w - cut - 6;
    const align: CanvasTextAlign = mirrored ? 'right' : 'left';
    const anchor = mirrored ? right : left;

    // 名字 + 角色徽章
    ctx.textBaseline = 'top';
    ctx.textAlign = align;
    ctx.font = `800 14px ${FONT}`;
    ctx.fillStyle = tank.isAlive ? '#f2fbff' : 'rgba(242,251,255,0.45)';
    const maxNameW = w - 110;
    const name = fitText(ctx, tank.name, maxNameW);
    ctx.fillText(name, anchor, y + 8);
    const nameW = ctx.measureText(name).width;
    const role = state.roles[index];
    ctx.font = `800 9px ${FONT}`;
    const roleW = ctx.measureText(role).width + 10;
    const roleX = mirrored ? anchor - nameW - 8 - roleW : anchor + nameW + 8;
    ctx.fillStyle = hexAlpha(color, 0.18);
    roundRect(ctx, roleX, y + 9, roleW, 14, 3);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.fillText(role, roleX + 5, y + 11.5);

    // 点数
    const credits = state.credits[index];
    if (credits !== null && credits !== undefined) {
      ctx.font = `700 11px ${FONT}`;
      ctx.fillStyle = '#ffd166';
      ctx.textAlign = mirrored ? 'left' : 'right';
      ctx.fillText(`◆ ${credits}`, mirrored ? left : right, y + 10);
    }

    // 血条
    const barY = y + 30;
    const barW = right - left;
    const ratio = state.invulnerable[index] ? 1 : Math.max(0, tank.health / tank.maxHealth);
    const ghost = this.ghost[index] ?? ratio;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    roundRect(ctx, left, barY, barW, 9, 4.5);
    ctx.fill();
    const fillFrom = (r: number): number => (mirrored ? right - barW * r : left);
    if (ghost > ratio) {
      ctx.fillStyle = 'rgba(255, 236, 200, 0.75)';
      roundRect(ctx, fillFrom(ghost), barY, barW * ghost, 9, 4.5);
      ctx.fill();
    }
    if (ratio > 0) {
      const hp = ctx.createLinearGradient(left, 0, right, 0);
      const base = ratio > 0.5 ? color : ratio > 0.25 ? '#ffd166' : COLORS.Warning;
      hp.addColorStop(0, hexAlpha(base, mirrored ? 0.75 : 1));
      hp.addColorStop(1, hexAlpha(base, mirrored ? 1 : 0.75));
      ctx.fillStyle = hp;
      ctx.shadowColor = base;
      ctx.shadowBlur = 8;
      roundRect(ctx, fillFrom(ratio), barY, barW * ratio, 9, 4.5);
      ctx.fill();
      ctx.shadowBlur = 0;
      // 高光
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(fillFrom(ratio) + 2, barY + 1.5, Math.max(0, barW * ratio - 4), 2);
    }

    // 生命数值 + 胜局小旗
    ctx.textBaseline = 'top';
    ctx.font = `700 10px ${FONT}`;
    ctx.fillStyle = MUTED;
    ctx.textAlign = align;
    const hpText = state.invulnerable[index]
      ? '耐久 ∞'
      : tank.isAlive ? `${Math.ceil(tank.health)} / ${tank.maxHealth}` : '已击毁';
    ctx.fillText(hpText, anchor, barY + 13);
    if (state.winsRequired > 0) {
      const pip = 7;
      const gap = 5;
      for (let i = 0; i < state.winsRequired; i++) {
        const won = i < state.matchWins[index];
        const px = mirrored ? left + i * (pip + gap) : right - (state.winsRequired - i) * (pip + gap) + gap;
        ctx.save();
        ctx.translate(px + pip / 2, barY + 18);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = won ? color : 'rgba(255,255,255,0.08)';
        ctx.strokeStyle = won ? color : 'rgba(255,255,255,0.28)';
        if (won) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 8;
        }
        ctx.fillRect(-pip / 2.8, -pip / 2.8, pip / 1.4, pip / 1.4);
        ctx.strokeRect(-pip / 2.8, -pip / 2.8, pip / 1.4, pip / 1.4);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  private renderCenter(ctx: CanvasRenderingContext2D, vw: number, state: HudState, plateW: number): void {
    const cx = (10 + plateW + (vw - plateW - 62)) / 2;
    const avail = vw - plateW * 2 - 90;
    const w = Math.max(120, Math.min(250, avail));
    const x = cx - w / 2;
    const y = 8;
    const h = 58;
    ctx.save();
    ctx.fillStyle = PANEL;
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = PANEL_EDGE;
    ctx.stroke();
    // 模式标签
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `800 9px ${FONT}`;
    ctx.fillStyle = state.variant.accent;
    ctx.fillText(`${state.variant.displayName} · ${state.variant.englishName}`, cx, y + 6, w - 12);
    ctx.font = `800 14px ${FONT}`;
    ctx.fillStyle = '#f2fbff';
    ctx.fillText(state.title, cx, y + 18, w - 12);
    ctx.font = `600 10px ${FONT}`;
    let label = state.roundLabel;
    if (state.timer !== null) label += `  ·  ${Math.ceil(state.timer)}s`;
    ctx.fillStyle = state.timer !== null && state.timer < 5 ? COLORS.Warning : MUTED;
    ctx.fillText(label, cx, y + 35, w - 12);
    ctx.restore();

    // 风向仪：位于中央面板下方
    this.renderWind(ctx, cx, y + h + 4, Math.min(w, 180), state.wind);
  }

  private renderWind(ctx: CanvasRenderingContext2D, cx: number, y: number, w: number, wind: WindState): void {
    const h = 18;
    const x = cx - w / 2;
    const max = 3;
    const ratio = Math.max(-1, Math.min(1, wind.value / max));
    ctx.save();
    ctx.fillStyle = 'rgba(4, 12, 24, 0.7)';
    roundRect(ctx, x, y, w, h, 9);
    ctx.fill();
    // 中线
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(cx - 0.5, y + 3, 1, h - 6);
    if (Math.abs(ratio) > 0.01) {
      const len = (w / 2 - 22) * Math.abs(ratio);
      const dir = Math.sign(ratio);
      const grad = ctx.createLinearGradient(cx, 0, cx + dir * len, 0);
      grad.addColorStop(0, 'rgba(113, 239, 255, 0.15)');
      grad.addColorStop(1, 'rgba(113, 239, 255, 0.95)');
      ctx.fillStyle = grad;
      ctx.fillRect(Math.min(cx, cx + dir * len), y + 7, len, 4);
      // 箭头
      const tip = cx + dir * (len + 7);
      ctx.fillStyle = '#71efff';
      ctx.shadowColor = '#71efff';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(tip, y + 9);
      ctx.lineTo(tip - dir * 7, y + 4);
      ctx.lineTo(tip - dir * 7, y + 14);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.font = `700 9px ${FONT}`;
    ctx.fillStyle = MUTED;
    ctx.textBaseline = 'middle';
    ctx.textAlign = ratio >= 0 ? 'left' : 'right';
    const labelX = ratio >= 0 ? x + 8 : x + w - 8;
    ctx.fillText(`风 ${Math.abs(wind.value).toFixed(1)}`, labelX, y + h / 2 + 0.5);
    ctx.restore();
  }

  private renderDock(ctx: CanvasRenderingContext2D, vw: number, vh: number, tank: Tank, state: HudState): void {
    const w = Math.min(820, vw - 24);
    const h = 62;
    const x = (vw - w) / 2;
    const y = vh - h - 12;
    const color = PLAYER_COLORS[tank.playerIndex];
    ctx.save();
    // 操作提示
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(state.hint, vw / 2 + 1, y - 5, w);
    ctx.fillStyle = 'rgba(220, 240, 255, 0.82)';
    ctx.fillText(state.hint, vw / 2, y - 6, w);

    ctx.fillStyle = PANEL;
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = PANEL_EDGE;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(x + 12, y, 60, 2);

    // 武器卡
    const weapon = weaponRegistry.get(tank.selectedWeaponId);
    const ammo = tank.ammo[weapon.id];
    const weaponW = Math.min(300, w * 0.38);
    ctx.save();
    ctx.translate(x + 30, y + h / 2);
    ctx.fillStyle = weapon.color;
    ctx.shadowColor = weapon.color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath();
    ctx.arc(-3, -3, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `800 14px ${FONT}`;
    ctx.fillStyle = '#f2fbff';
    const weaponName = fitText(ctx, weapon.displayName, weaponW - 90);
    ctx.fillText(weaponName, x + 50, y + 11);
    const nameW = ctx.measureText(weaponName).width;
    const ammoText = ammo === -1 ? '∞' : `×${ammo}`;
    ctx.font = `800 11px ${FONT}`;
    const ammoW = ctx.measureText(ammoText).width + 12;
    ctx.fillStyle = hexAlpha(weapon.color, 0.2);
    roundRect(ctx, x + 56 + nameW, y + 11, ammoW, 17, 8);
    ctx.fill();
    ctx.fillStyle = weapon.color;
    ctx.fillText(ammoText, x + 62 + nameW, y + 13);
    ctx.font = `500 10px ${FONT}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(fitText(ctx, weapon.description, weaponW - 46), x + 50, y + 34);

    // 分隔线
    const sx = x + weaponW + 10;
    ctx.fillStyle = PANEL_EDGE;
    ctx.fillRect(sx, y + 12, 1, h - 24);

    // 角度表盘
    const dialX = sx + 36;
    const dialY = y + h / 2 + 12;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(dialX, dialY, 20, Math.PI, 0);
    ctx.stroke();
    const rad = (tank.turretAngle * Math.PI) / 180;
    ctx.strokeStyle = color;
    ctx.beginPath();
    if (tank.turretAngle <= 90) ctx.arc(dialX, dialY, 20, -rad, 0);
    else ctx.arc(dialX, dialY, 20, Math.PI, -rad);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#f2fbff';
    ctx.beginPath();
    ctx.moveTo(dialX, dialY);
    ctx.lineTo(dialX + Math.cos(rad) * 17, dialY - Math.sin(rad) * 17);
    ctx.stroke();
    ctx.font = `800 13px ${FONT}`;
    ctx.fillStyle = '#f2fbff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(tank.turretAngle)}°`, dialX + 28, y + h / 2 - 6);
    ctx.font = `600 9px ${FONT}`;
    ctx.fillStyle = MUTED;
    ctx.fillText('角度', dialX + 28, y + h / 2 + 10);

    // 力度 + 燃料
    const barsX = dialX + 78;
    const barsW = x + w - barsX - 18;
    if (barsW > 60) {
      const powerRatio = (tank.power - POWER_RANGE.min) / (POWER_RANGE.max - POWER_RANGE.min);
      this.renderBar(ctx, barsX, y + 14, barsW, 10, powerRatio, '力度', `${Math.round(powerRatio * 100)}%`, ['#36ddff', '#ffd166', '#ff5d73']);
      const fuelRatio = tank.maxFuel > 0 ? tank.movementFuel / tank.maxFuel : 0;
      this.renderBar(ctx, barsX, y + 38, barsW, 6, fuelRatio, '燃料', '', ['#06d6a0', '#06d6a0']);
    }
    ctx.restore();
  }

  private renderBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    ratio: number,
    label: string,
    value: string,
    colors: string[]
  ): void {
    const labelW = 30;
    ctx.font = `700 10px ${FONT}`;
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + h / 2);
    const bx = x + labelW;
    const valueW = value ? 36 : 0;
    const bw = w - labelW - valueW;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, bx, y, bw, h, h / 2);
    ctx.fill();
    const r = Math.max(0, Math.min(1, ratio));
    if (r > 0) {
      const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      colors.forEach((c, i) => grad.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), c));
      ctx.save();
      roundRect(ctx, bx, y, bw * r, h, h / 2);
      ctx.clip();
      ctx.fillStyle = grad;
      ctx.fillRect(bx, y, bw, h);
      ctx.restore();
    }
    // 刻度
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 1; i < 10; i++) ctx.fillRect(bx + (bw * i) / 10, y, 1, h);
    if (value) {
      ctx.font = `800 11px ${FONT}`;
      ctx.fillStyle = '#f2fbff';
      ctx.textAlign = 'right';
      ctx.fillText(value, x + w, y + h / 2);
    }
  }

  /** 触控模式：在顶部铭牌下方显示一条紧凑信息带，避免被底部按钮遮挡。 */
  private renderCompactWeapon(ctx: CanvasRenderingContext2D, vw: number, tank: Tank, state: HudState): void {
    const weapon = weaponRegistry.get(tank.selectedWeaponId);
    const ammo = tank.ammo[weapon.id];
    const powerRatio = (tank.power - POWER_RANGE.min) / (POWER_RANGE.max - POWER_RANGE.min);
    const text = `${weapon.displayName} ${ammo === -1 ? '∞' : `×${ammo}`}   ∠ ${Math.round(tank.turretAngle)}°   力度 ${Math.round(powerRatio * 100)}%`;
    ctx.save();
    ctx.font = `700 12px ${FONT}`;
    const w = Math.min(vw - 20, ctx.measureText(text).width + 44);
    const x = 10;
    const y = 94;
    ctx.fillStyle = PANEL;
    roundRect(ctx, x, y, w, 24, 12);
    ctx.fill();
    ctx.strokeStyle = PANEL_EDGE;
    ctx.stroke();
    ctx.fillStyle = weapon.color;
    ctx.shadowColor = weapon.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(x + 14, y + 12, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f2fbff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 26, y + 12.5, w - 32);
    // 燃料细条
    const fuelRatio = tank.maxFuel > 0 ? tank.movementFuel / tank.maxFuel : 0;
    ctx.fillStyle = 'rgba(6, 214, 160, 0.85)';
    ctx.fillRect(x + 12, y + 22, (w - 24) * fuelRatio, 2);
    if (state.hint) {
      ctx.font = `600 10px ${FONT}`;
      ctx.fillStyle = 'rgba(220, 240, 255, 0.7)';
      ctx.fillText(state.hint, x + 4, y + 36, vw - 30);
    }
    ctx.restore();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w), h, Math.min(r, h / 2, Math.max(0, w) / 2));
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

function hexAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
