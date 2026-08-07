import type { Tank as TankData } from '../types';
import { weaponRegistry } from '../weapons/WeaponRegistry';

export function createTank(
  id: string,
  playerIndex: number,
  name: string,
  x: number,
  y: number,
  maxHealth: number,
  maxFuel: number,
  initialWeapon: string
): TankData {
  return {
    id,
    playerIndex,
    name,
    x,
    y,
    velocityX: 0,
    velocityY: 0,
    bodyAngle: 0,
    turretAngle: playerIndex === 0 ? 45 : 135,
    power: 500,
    health: maxHealth,
    maxHealth,
    movementFuel: maxFuel,
    maxFuel,
    isGrounded: true,
    selectedWeaponId: initialWeapon,
    ammo: weaponRegistry.createInitialAmmo(),
    hitFlash: 0,
    damageDealt: 0,
    hitCount: 0,
    directHitCount: 0,
    isAlive: true,
  };
}

export function resetTurn(tank: TankData, maxFuel: number): void {
  tank.movementFuel = maxFuel;
  tank.velocityX = 0;
  tank.velocityY = 0;
  tank.hitFlash = 0;
}

// 减少弹药；-1 表示无限
export function consumeAmmo(tank: TankData, weaponId: string): boolean {
  const current = tank.ammo[weaponId];
  if (current === -1) return true;
  if (current <= 0) return false;
  tank.ammo[weaponId] = current - 1;
  return true;
}

export function hasAmmo(tank: TankData, weaponId: string): boolean {
  const current = tank.ammo[weaponId];
  return current === -1 || current > 0;
}

export function cycleWeapon(tank: TankData, direction: 1 | -1): void {
  const w = direction === 1 ? weaponRegistry.next(tank.selectedWeaponId) : weaponRegistry.prev(tank.selectedWeaponId);
  tank.selectedWeaponId = w;
}
