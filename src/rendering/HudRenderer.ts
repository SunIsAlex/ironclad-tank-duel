import type { Tank, WindState } from '../types';
import { COLORS, PLAYER_COLORS } from '../core/Constants';
import { weaponRegistry } from '../weapons/WeaponRegistry';
import { POWER_RANGE } from '../config/gameConfig';

// 顶部 HUD 信息（屏幕坐标系）
export function renderTopHud(
  ctx: CanvasRenderingContext2D,
  vw: number,
  tanks: Tank[],
  currentPlayer: number,
  roundCount: number,
  wind: WindState,
  phase: string,
  turnTimer: number
): void {
  const h = 56;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLORS.HUDBackground;
  ctx.fillRect(0, 0, vw, h);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, h, vw, 1);

  // 玩家 1
  renderPlayerCard(ctx, 12, 6, tanks[0], currentPlayer === 0);
  // 玩家 2
  renderPlayerCard(ctx, vw - 232, 6, tanks[1], currentPlayer === 1, true);

  // 中部信息
  const cx = vw / 2;
  ctx.fillStyle = COLORS.HUDForeground;
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`回合 ${roundCount}`, cx, 8);

  // 风
  renderWindIndicator(ctx, cx, 26, wind);

  // 当前玩家提示
  ctx.fillStyle = currentPlayer === 0 ? PLAYER_COLORS[0] : PLAYER_COLORS[1];
  ctx.font = 'bold 12px monospace';
  ctx.fillText(`当前：${tanks[currentPlayer]?.name ?? ''}`, cx, 42);

  if (phase === 'PROJECTILE_FLYING' || phase === 'EXPLOSION' || phase === 'TERRAIN_SETTLING') {
    ctx.fillStyle = COLORS.Accent;
    ctx.font = 'bold 11px monospace';
    ctx.fillText('回合结算中...', cx, h - 16);
  } else if (turnTimer > 0) {
    ctx.fillStyle = turnTimer < 5 ? COLORS.Warning : COLORS.Accent;
    ctx.fillText(`剩余 ${Math.ceil(turnTimer)}s`, cx, h - 16);
  }

  ctx.restore();
}

function renderPlayerCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tank: Tank,
  active: boolean,
  rightAlign = false
): void {
  const w = 220;
  const h = 44;
  ctx.save();
  if (active) {
    ctx.strokeStyle = COLORS.Accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x, y, w, h);

  const color = PLAYER_COLORS[tank.playerIndex];
  ctx.fillStyle = color;
  ctx.fillRect(x + 4, y + 4, 6, h - 8);

  ctx.fillStyle = COLORS.HUDForeground;
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`${tank.name}  P${tank.playerIndex + 1}${tank.isAlive ? '' : ' †'}`, x + 16, y + 6);

  // 血条
  const barX = x + 16;
  const barY = y + 22;
  const barW = w - 24;
  ctx.fillStyle = '#0b1b2a';
  ctx.fillRect(barX, barY, barW, 8);
  const ratio = Math.max(0, tank.health / tank.maxHealth);
  const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  grad.addColorStop(0, color);
  grad.addColorStop(1, ratio > 0.4 ? COLORS.Success : COLORS.Warning);
  ctx.fillStyle = grad;
  ctx.fillRect(barX, barY, barW * ratio, 8);

  ctx.fillStyle = COLORS.HUDForeground;
  ctx.font = '10px monospace';
  ctx.fillText(`${Math.ceil(tank.health)} / ${tank.maxHealth}`, barX, barY + 10);

  if (rightAlign) {
    void rightAlign;
  }
  ctx.restore();
}

function renderWindIndicator(ctx: CanvasRenderingContext2D, cx: number, y: number, wind: WindState): void {
  const arrow = wind.value > 0 ? '→' : wind.value < 0 ? '←' : '·';
  const strengthBars = Math.abs(wind.value);
  ctx.fillStyle = COLORS.HUDForeground;
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`风 ${arrow}`, cx, y);
  // 强度条
  const barW = 60;
  const seg = 5;
  for (let i = 0; i < seg; i++) {
    const on = i < Math.round(strengthBars * seg / 3);
    ctx.fillStyle = on ? COLORS.Accent : 'rgba(255,255,255,0.15)';
    ctx.fillRect(cx - barW / 2 + i * (barW / seg), y + 12, barW / seg - 2, 4);
  }
}

// 底部玩家操作面板（角度/力度/武器等）
export function renderBottomControls(
  ctx: CanvasRenderingContext2D,
  vw: number,
  vh: number,
  tank: Tank,
  hint: string
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const padTop = vh - 70;
  ctx.fillStyle = COLORS.HUDBackground;
  ctx.fillRect(0, padTop, vw, 70);

  ctx.fillStyle = COLORS.HUDForeground;
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const weapon = weaponRegistry.get(tank.selectedWeaponId);
  const ammoStr = tank.ammo[weapon.id] === -1 ? '∞' : `${tank.ammo[weapon.id]}`;
  ctx.fillText(`武器：${weapon.displayName} (${ammoStr})  ${hint}`, 12, padTop + 8);

  // 角度
  ctx.fillText(`角度：${Math.round(tank.turretAngle)}°`, 12, padTop + 28);
  // 力度
  const pw = vw - 200;
  ctx.fillText(`力度`, 12, padTop + 46);
  ctx.fillStyle = '#0b1b2a';
  ctx.fillRect(50, padTop + 48, pw - 50, 8);
  const ratio = (tank.power - POWER_RANGE.min) / (POWER_RANGE.max - POWER_RANGE.min);
  ctx.fillStyle = COLORS.Accent;
  ctx.fillRect(50, padTop + 48, (pw - 50) * ratio, 8);

  // 燃料
  ctx.fillStyle = COLORS.HUDForeground;
  ctx.fillText(`燃料`, 50, padTop + 28);
  ctx.fillStyle = '#0b1b2a';
  ctx.fillRect(80, padTop + 30, 100, 6);
  ctx.fillStyle = COLORS.Success;
  ctx.fillRect(80, padTop + 30, 100 * (tank.movementFuel / tank.maxFuel), 6);

  ctx.restore();
}
