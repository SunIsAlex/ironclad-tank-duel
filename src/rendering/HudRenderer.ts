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
  const hudGrad = ctx.createLinearGradient(0, 0, 0, h);
  hudGrad.addColorStop(0, 'rgba(2, 8, 17, .97)');
  hudGrad.addColorStop(1, 'rgba(5, 20, 34, .86)');
  ctx.fillStyle = hudGrad;
  ctx.fillRect(0, 0, vw, h);
  ctx.strokeStyle = 'rgba(62, 219, 255, .38)';
  ctx.beginPath(); ctx.moveTo(0, h - .5); ctx.lineTo(vw, h - .5); ctx.stroke();
  ctx.fillStyle = 'rgba(62, 219, 255, .45)';
  ctx.fillRect(vw / 2 - 72, h - 2, 144, 2);

  // 玩家 1
  renderPlayerCard(ctx, 12, 6, tanks[0], currentPlayer === 0);
  // 玩家 2
  renderPlayerCard(ctx, vw - 232, 6, tanks[1], currentPlayer === 1, true);

  // 中部信息
  const cx = vw / 2;
  ctx.fillStyle = COLORS.HUDForeground;
  ctx.font = '800 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`ROUND  ${String(roundCount).padStart(2, '0')}`, cx, 7);

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
  ctx.fillStyle = active ? 'rgba(12, 43, 58, .78)' : 'rgba(2, 10, 19, .66)';
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + w - 12, y); ctx.lineTo(x + w, y + 12);
  ctx.lineTo(x + w, y + h); ctx.lineTo(x + 8, y + h); ctx.lineTo(x, y + h - 8); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = active ? COLORS.Accent : 'rgba(119, 183, 201, .2)';
  ctx.lineWidth = active ? 1.5 : 1;
  ctx.stroke();

  const color = PLAYER_COLORS[tank.playerIndex];
  ctx.fillStyle = color;
  ctx.shadowColor = color; ctx.shadowBlur = active ? 8 : 0;
  ctx.fillRect(x + 4, y + 5, 3, h - 10);
  ctx.shadowBlur = 0;

  ctx.fillStyle = COLORS.HUDForeground;
  ctx.font = '700 11px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`${tank.name}  P${tank.playerIndex + 1}${tank.isAlive ? '' : ' †'}`, x + 16, y + 6);

  // 血条
  const barX = x + 16;
  const barY = y + 22;
  const barW = w - 24;
  ctx.fillStyle = '#020912';
  ctx.fillRect(barX, barY, barW, 8);
  const ratio = Math.max(0, tank.health / tank.maxHealth);
  const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  grad.addColorStop(0, color);
  grad.addColorStop(1, ratio > 0.4 ? COLORS.Success : COLORS.Warning);
  ctx.fillStyle = grad;
  ctx.fillRect(barX, barY, barW * ratio, 8);
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  ctx.fillRect(barX, barY, barW * ratio, 1);

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
  ctx.fillText(`WIND  ${arrow}  ${wind.displayStrength.toFixed(1)}`, cx, y);
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
  const panel = ctx.createLinearGradient(0, padTop, 0, vh);
  panel.addColorStop(0, 'rgba(5,20,34,.82)'); panel.addColorStop(1, 'rgba(2,8,16,.97)');
  ctx.fillStyle = panel;
  ctx.fillRect(0, padTop, vw, 70);
  ctx.strokeStyle = 'rgba(62,219,255,.3)';
  ctx.beginPath(); ctx.moveTo(0, padTop + .5); ctx.lineTo(vw, padTop + .5); ctx.stroke();

  ctx.fillStyle = COLORS.HUDForeground;
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const weapon = weaponRegistry.get(tank.selectedWeaponId);
  const ammoStr = tank.ammo[weapon.id] === -1 ? '∞' : `${tank.ammo[weapon.id]}`;
  ctx.fillStyle = weapon.color;
  ctx.fillRect(12, padTop + 8, 3, 14);
  ctx.fillStyle = COLORS.HUDForeground;
  ctx.font = '700 12px ui-monospace, monospace';
  ctx.fillText(`WEAPON // ${weapon.displayName}  [${ammoStr}]   ${hint}`, 22, padTop + 8);

  // 角度
  ctx.fillText(`ANGLE  ${String(Math.round(tank.turretAngle)).padStart(3, '0')}°`, 12, padTop + 30);
  // 力度
  const pw = vw - 200;
  ctx.fillText(`PWR`, 12, padTop + 49);
  ctx.fillStyle = '#0b1b2a';
  ctx.fillRect(50, padTop + 48, pw - 50, 8);
  const ratio = (tank.power - POWER_RANGE.min) / (POWER_RANGE.max - POWER_RANGE.min);
  const powerGrad = ctx.createLinearGradient(50, 0, pw, 0);
  powerGrad.addColorStop(0, '#35d9ff'); powerGrad.addColorStop(.72, '#ffe06d'); powerGrad.addColorStop(1, '#ff6548');
  ctx.fillStyle = powerGrad;
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
